package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"
)

func readTopicJSON[T any](t *testing.T, response *http.Response) T {
	t.Helper()
	value, err := readJSON[T](response)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

// readJSON decodes a response body without failing the test, so worker
// goroutines can report the failure to the test goroutine.
func readJSON[T any](response *http.Response) (T, error) {
	var value T
	content, err := io.ReadAll(response.Body)
	if err != nil {
		return value, fmt.Errorf("read response: %w", err)
	}
	if err := json.Unmarshal(content, &value); err != nil {
		return value, fmt.Errorf("decode response (%s): %w\n%s", response.Status, err, content)
	}
	return value, nil
}

func topicText(t *testing.T, object map[string]json.RawMessage) (string, bool) {
	t.Helper()
	topic, present, err := topicField(object)
	if err != nil {
		t.Fatal(err)
	}
	return topic, present
}

// topicField reads the optional topic without failing the test.
func topicField(object map[string]json.RawMessage) (string, bool, error) {
	raw, present := object["topic"]
	if !present {
		return "", false, nil
	}
	var topic string
	if err := json.Unmarshal(raw, &topic); err != nil {
		return "", false, fmt.Errorf("decode topic: %w", err)
	}
	return topic, true, nil
}

func TestBookingTopicAppearsForOwner(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-12-31T05:00:00Z")
	s := bookingAcceptanceServer(t, func() time.Time { return now })
	typ := s.createType(t, "Встреча", "Описание", 30)
	payload := map[string]any{
		"meetingTypeId": typ.ID, "start": "2026-12-31T10:00:00+03:00",
		"name": "Гость", "email": "guest@example.test", "topic": "Обсудить проект",
	}
	r := s.do(t, http.MethodPost, "/bookings", payload)
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("create booking: %s", r.Status)
	}
	if topic, present := topicText(t, readTopicJSON[map[string]json.RawMessage](t, r)); !present || topic != "Обсудить проект" {
		t.Fatalf("created topic: present=%v topic=%q", present, topic)
	}

	// A taken interval stays unavailable and rejects a second booking with a topic.
	if r := s.do(t, http.MethodPost, "/bookings", payload); r.StatusCode != http.StatusConflict {
		t.Fatalf("conflicting booking: %s, want 409", r.Status)
	}

	r = s.do(t, http.MethodGet, "/bookings", nil)
	items := readTopicJSON[[]map[string]json.RawMessage](t, r)
	if len(items) != 1 {
		t.Fatalf("bookings: %d, want 1", len(items))
	}
	if topic, present := topicText(t, items[0]); !present || topic != "Обсудить проект" {
		t.Fatalf("listed topic: present=%v topic=%q", present, topic)
	}
}

func TestBookingWithoutTopicOmitsField(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-12-31T05:00:00Z")
	s := bookingAcceptanceServer(t, func() time.Time { return now })
	typ := s.createType(t, "Встреча", "Описание", 30)
	r := s.do(t, http.MethodPost, "/bookings", map[string]any{
		"meetingTypeId": typ.ID, "start": "2026-12-31T09:00:00+03:00",
		"name": "Гость", "email": "guest@example.test",
	})
	if r.StatusCode != http.StatusCreated {
		t.Fatalf("create booking: %s", r.Status)
	}
	if _, present := topicText(t, readTopicJSON[map[string]json.RawMessage](t, r)); present {
		t.Fatal("created booking includes topic when none was provided")
	}
	r = s.do(t, http.MethodGet, "/bookings", nil)
	items := readTopicJSON[[]map[string]json.RawMessage](t, r)
	if len(items) != 1 {
		t.Fatalf("bookings: %d, want 1", len(items))
	}
	if _, present := topicText(t, items[0]); present {
		t.Fatal("listed booking includes topic when none was provided")
	}
}
