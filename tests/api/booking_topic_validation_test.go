package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"
)

func requireTopicFieldError(t *testing.T, response *http.Response) {
	t.Helper()
	var problem problemJSON
	mustRead(t, response, &problem)
	requireFieldProblem(t, problem, "topic")
}

func TestBookingTopicValidation(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-12-31T05:00:00Z")
	s := bookingAcceptanceServer(t, func() time.Time { return now })
	typ := s.createType(t, "Встреча", "Описание", 30)

	post := func(start, topic string) *http.Response {
		t.Helper()
		return s.do(t, http.MethodPost, "/bookings", map[string]any{
			"meetingTypeId": typ.ID, "start": start,
			"name": "Гость", "email": "guest@example.test", "topic": topic,
		})
	}
	bookingsAt := func(value string) int {
		t.Helper()
		start, err := time.Parse(time.RFC3339, value)
		if err != nil {
			t.Fatal(err)
		}
		r := s.do(t, http.MethodGet, "/bookings", nil)
		var items []struct {
			Start time.Time `json:"start"`
		}
		mustRead(t, r, &items)
		count := 0
		for _, item := range items {
			if item.Start.Equal(start) {
				count++
			}
		}
		return count
	}

	// Exactly 200 Unicode code points are accepted even though they take 400 bytes.
	exact := strings.Repeat("я", 200)
	r := post("2026-12-31T09:00:00+03:00", exact)
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("200 code points: %s, want 201", r.Status)
	}
	topic, present := topicText(t, readTopicJSON[map[string]json.RawMessage](t, r))
	if !present || topic != exact {
		t.Fatalf("200 code points returned: present=%v runes=%d", present, len([]rune(topic)))
	}

	// One code point beyond the limit is rejected and creates no booking.
	r = post("2026-12-31T09:30:00+03:00", strings.Repeat("я", 201))
	if r.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("201 code points: %s, want 422", r.Status)
	}
	requireTopicFieldError(t, r)
	if count := bookingsAt("2026-12-31T09:30:00+03:00"); count != 0 {
		t.Fatalf("rejected topic created %d bookings", count)
	}

	// Internal line breaks are rejected and create no booking.
	r = post("2026-12-31T10:00:00+03:00", "Первая строка\nВторая строка")
	if r.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("newline topic: %s, want 422", r.Status)
	}
	requireTopicFieldError(t, r)
	if count := bookingsAt("2026-12-31T10:00:00+03:00"); count != 0 {
		t.Fatalf("newline topic created %d bookings", count)
	}
	r = post("2026-12-31T10:30:00+03:00", "Первая строка\r\nВторая строка")
	if r.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("CRLF topic: %s, want 422", r.Status)
	}
	requireTopicFieldError(t, r)
	if count := bookingsAt("2026-12-31T10:30:00+03:00"); count != 0 {
		t.Fatalf("CRLF topic created %d bookings", count)
	}
	for _, tc := range []struct {
		start string
		topic string
	}{
		{"2026-12-31T14:00:00+03:00", "Первая\vВторая"},
		{"2026-12-31T14:30:00+03:00", "Первая\fВторая"},
	} {
		r = post(tc.start, tc.topic)
		if r.StatusCode != http.StatusUnprocessableEntity {
			t.Fatalf("vertical whitespace topic: %s, want 422", r.Status)
		}
		requireTopicFieldError(t, r)
		if count := bookingsAt(tc.start); count != 0 {
			t.Fatalf("vertical whitespace topic created %d bookings", count)
		}
	}

	// Edge whitespace and newlines are removed before the length is measured.
	r = post("2026-12-31T11:00:00+03:00", "\n  "+exact+" \t\n")
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("padded 200 code points: %s, want 201", r.Status)
	}
	topic, present = topicText(t, readTopicJSON[map[string]json.RawMessage](t, r))
	if !present || topic != exact {
		t.Fatalf("padded 200 code points returned: present=%v runes=%d", present, len([]rune(topic)))
	}
	r = post("2026-12-31T11:30:00+03:00", "  "+strings.Repeat("я", 201)+"\n")
	if r.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("padded 201 code points: %s, want 422", r.Status)
	}
	requireTopicFieldError(t, r)
	if count := bookingsAt("2026-12-31T11:30:00+03:00"); count != 0 {
		t.Fatalf("padded overlong topic created %d bookings", count)
	}

	// A topic made only of whitespace means no topic at all.
	r = post("2026-12-31T12:00:00+03:00", " \n\t ")
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("whitespace-only topic: %s, want 201", r.Status)
	}
	if _, present := topicText(t, readTopicJSON[map[string]json.RawMessage](t, r)); present {
		t.Fatal("whitespace-only topic was stored")
	}

	// Topic validation runs before the occupied-time check.
	occupied := "2026-12-31T13:00:00+03:00"
	if r := post(occupied, "План"); r.StatusCode != http.StatusCreated {
		t.Fatalf("existing booking: %s, want 201", r.Status)
	} else {
		_ = r.Body.Close()
	}
	r = post(occupied, strings.Repeat("я", 201))
	if r.StatusCode != http.StatusUnprocessableEntity {
		t.Fatalf("invalid topic on occupied time: %s, want 422", r.Status)
	}
	requireTopicFieldError(t, r)
	if count := bookingsAt(occupied); count != 1 {
		t.Fatalf("invalid topic changed bookings: %d", count)
	}
	r = post(occupied, "Другой план")
	if r.StatusCode != http.StatusConflict {
		t.Fatalf("valid topic on occupied time: %s, want 409", r.Status)
	}
	if count := bookingsAt(occupied); count != 1 {
		t.Fatalf("conflicting booking changed bookings: %d", count)
	}
}
