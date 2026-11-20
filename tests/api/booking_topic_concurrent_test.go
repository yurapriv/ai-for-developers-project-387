package api

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"
)

// Two overlapping bookings race: one carries a conversation topic, the other
// does not. Exactly one request wins, the slot ends up with a single stored
// booking, and its topic follows the winning request.
//
// Worker goroutines never fail the test themselves: HTTP and OpenAPI failures
// travel on the result channel to the test goroutine, which owns t.Fatalf, so
// a failed request cannot leave the channel read blocked until the package
// timeout.
func TestConcurrentOverlappingBookingsTopicFollowsWinner(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-12-31T05:00:00Z")
	s := bookingAcceptanceServer(t, func() time.Time { return now })
	typ := s.createType(t, "Встреча", "Описание", 30)
	const topic = "Обсудить проект"

	type outcome struct {
		withTopic bool
		status    int
		topic     string
		present   bool
		err       error
	}
	ready := make(chan struct{})
	results := make(chan outcome, 2)
	for _, withTopic := range []bool{true, false} {
		payload := map[string]any{
			"meetingTypeId": typ.ID, "start": "2026-12-31T10:00:00+03:00",
			"name": "Гость", "email": "guest@example.test",
		}
		if withTopic {
			payload["topic"] = topic
		}
		go func(withTopic bool, payload map[string]any) {
			<-ready
			response, err := s.doE(http.MethodPost, "/bookings", payload)
			if err != nil {
				results <- outcome{withTopic: withTopic, err: err}
				return
			}
			out := outcome{withTopic: withTopic, status: response.StatusCode}
			if response.StatusCode == http.StatusCreated {
				body, err := readJSON[map[string]json.RawMessage](response)
				if err != nil {
					results <- outcome{withTopic: withTopic, err: err}
					return
				}
				out.topic, out.present, err = topicField(body)
				if err != nil {
					results <- outcome{withTopic: withTopic, err: err}
					return
				}
			}
			results <- out
		}(withTopic, payload)
	}
	close(ready)
	a, b := <-results, <-results
	for _, out := range []outcome{a, b} {
		if out.err != nil {
			t.Fatalf("request withTopic=%v: %v", out.withTopic, out.err)
		}
	}
	if (a.status != http.StatusCreated || b.status != http.StatusConflict) &&
		(a.status != http.StatusConflict || b.status != http.StatusCreated) {
		t.Fatalf("statuses: %d, %d; want one 201 and one 409", a.status, b.status)
	}
	winner := a
	if b.status == http.StatusCreated {
		winner = b
	}
	if winner.withTopic {
		if !winner.present || winner.topic != topic {
			t.Fatalf("created topic: present=%v topic=%q, want %q", winner.present, winner.topic, topic)
		}
	} else if winner.present {
		t.Fatalf("created booking includes topic: %q", winner.topic)
	}

	list := s.do(t, http.MethodGet, "/bookings", nil)
	items := readTopicJSON[[]map[string]json.RawMessage](t, list)
	if len(items) != 1 {
		t.Fatalf("bookings: %d, want 1", len(items))
	}
	stored, present := topicText(t, items[0])
	if present != winner.present || (present && stored != winner.topic) {
		t.Fatalf("stored topic: present=%v topic=%q, want present=%v topic=%q from the winning request",
			present, stored, winner.present, winner.topic)
	}
}
