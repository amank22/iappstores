package sponsors

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/dbconn"
)

func newTestStore(t *testing.T) *Store {
	t.Helper()
	db, err := dbconn.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewStore(db)
}

func listing(email string) Listing {
	return Listing{Name: "App", Tagline: "A very good app", URL: "https://example.com", Email: email}
}

// pay reserves a slot and applies the "active" event for it.
func pay(t *testing.T, s *Store, email, subscriptionID string, slots int, at time.Time) Sponsor {
	t.Helper()
	id, err := s.Reserve(listing(email), slots, at)
	if err != nil {
		t.Fatalf("reserve: %v", err)
	}
	sp, err := s.Activate(SubscriptionEvent{SponsorID: id, SubscriptionID: subscriptionID, Email: email, At: at}, slots, false)
	if err != nil {
		t.Fatalf("activate: %v", err)
	}
	return sp
}

func TestSlotsSellOutAndHoldsExpire(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()

	if _, err := s.Reserve(listing("a@example.com"), 2, now); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Reserve(listing("b@example.com"), 2, now); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Reserve(listing("c@example.com"), 2, now); !errors.Is(err, ErrSoldOut) {
		t.Fatalf("third reserve: err = %v, want ErrSoldOut", err)
	}
	// Unpaid holds free their slots once they expire.
	if _, err := s.Reserve(listing("c@example.com"), 2, now.Add(HoldTTL+time.Minute)); err != nil {
		t.Fatalf("reserve after hold expiry: %v", err)
	}
}

func TestPaidListingNeedsApprovalBeforeItIsLive(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()

	sp := pay(t, s, "a@example.com", "sub_1", 2, now)
	if sp.Status != StatusPendingReview {
		t.Fatalf("status = %s, want pending_review", sp.Status)
	}
	if live, _ := s.ListLive(now); len(live) != 0 {
		t.Fatalf("unreviewed listing is live: %+v", live)
	}
	if _, err := s.Approve(sp.ID, 2, now); err != nil {
		t.Fatal(err)
	}
	if live, _ := s.ListLive(now); len(live) != 1 || live[0].ID != sp.ID {
		t.Fatalf("live = %+v", live)
	}
}

func TestLatePaymentIsQueuedThenPromotedWhenASlotFrees(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()

	// A starts checkout, lets the hold lapse, and B buys the only slot meanwhile.
	lateID, err := s.Reserve(listing("late@example.com"), 1, now)
	if err != nil {
		t.Fatal(err)
	}
	later := now.Add(HoldTTL + time.Minute)
	winner := pay(t, s, "b@example.com", "sub_b", 1, later)

	late, err := s.Activate(SubscriptionEvent{SponsorID: lateID, SubscriptionID: "sub_late", At: later.Add(time.Minute)}, 1, false)
	if err != nil {
		t.Fatal(err)
	}
	if late.Status != StatusQueued {
		t.Fatalf("late payer status = %s, want queued", late.Status)
	}

	if _, err := s.End(SubscriptionEvent{SubscriptionID: "sub_b", At: later.Add(2 * time.Minute)}, nil); err != nil {
		t.Fatal(err)
	}
	if err := s.Sweep(1, false, later.Add(3*time.Minute)); err != nil {
		t.Fatal(err)
	}
	all, _ := s.ListAll()
	statuses := map[string]Status{}
	for _, sp := range all {
		statuses[sp.ID] = sp.Status
	}
	if statuses[winner.ID] != StatusEnded || statuses[lateID] != StatusPendingReview {
		t.Fatalf("statuses = %+v", statuses)
	}
}

func TestCancelledListingStaysLiveUntilPaidPeriodEnds(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()
	sp := pay(t, s, "a@example.com", "sub_1", 1, now)
	if _, err := s.Approve(sp.ID, 1, now); err != nil {
		t.Fatal(err)
	}

	paidUntil := now.Add(10 * 24 * time.Hour)
	if _, err := s.End(SubscriptionEvent{SubscriptionID: "sub_1", At: now.Add(time.Hour)}, &paidUntil); err != nil {
		t.Fatal(err)
	}
	if live, _ := s.ListLive(now.Add(2 * time.Hour)); len(live) != 1 {
		t.Fatal("cancelled listing disappeared before its paid period ended")
	}
	// An "active" event from before the cancellation must not undo it.
	if _, err := s.Activate(SubscriptionEvent{SubscriptionID: "sub_1", At: now.Add(time.Minute)}, 1, false); err != nil {
		t.Fatal(err)
	}
	after := paidUntil.Add(time.Minute)
	if live, _ := s.ListLive(after); len(live) != 0 {
		t.Fatal("listing still live after its paid period")
	}
	if taken, _ := s.Occupied(after); taken != 0 {
		t.Fatalf("occupied = %d after paid period, want 0", taken)
	}
}

func TestFailedRenewalHidesListingAndRecoveryRestoresIt(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()
	sp := pay(t, s, "a@example.com", "sub_1", 1, now)
	s.Approve(sp.ID, 1, now)

	if _, err := s.Pause(SubscriptionEvent{SubscriptionID: "sub_1", At: now.Add(time.Hour)}); err != nil {
		t.Fatal(err)
	}
	if live, _ := s.ListLive(now.Add(time.Hour)); len(live) != 0 {
		t.Fatal("paused listing is still shown")
	}
	if taken, _ := s.Occupied(now.Add(time.Hour)); taken != 1 {
		t.Fatalf("paused listing lost its slot: occupied = %d", taken)
	}
	back, err := s.Activate(SubscriptionEvent{SubscriptionID: "sub_1", At: now.Add(2 * time.Hour)}, 1, false)
	if err != nil || back.Status != StatusLive {
		t.Fatalf("after recovery: status = %s, err = %v", back.Status, err)
	}
}

func TestRejectedListingIsNotRevivedByLaterEvents(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()
	sp := pay(t, s, "a@example.com", "sub_1", 1, now)
	if _, err := s.Close(sp.ID, StatusRejected, now); err != nil {
		t.Fatal(err)
	}
	got, err := s.Activate(SubscriptionEvent{SubscriptionID: "sub_1", At: now.Add(time.Hour)}, 1, true)
	if err != nil || got.Status != StatusRejected {
		t.Fatalf("status = %s, err = %v, want rejected", got.Status, err)
	}
}

func TestClicksCountOnlyForLiveListings(t *testing.T) {
	s := newTestStore(t)
	now := time.Now()
	sp := pay(t, s, "a@example.com", "sub_1", 1, now)
	if _, err := s.RecordClick(sp.ID, now); !errors.Is(err, ErrNotFound) {
		t.Fatalf("click on unreviewed listing: err = %v", err)
	}
	s.Approve(sp.ID, 1, now)
	for i := 0; i < 3; i++ {
		if url, err := s.RecordClick(sp.ID, now); err != nil || url != "https://example.com" {
			t.Fatalf("click: url = %q, err = %v", url, err)
		}
	}
	all, _ := s.ListAll()
	if all[0].Clicks != 3 {
		t.Fatalf("clicks = %d, want 3", all[0].Clicks)
	}
}

func sign(secretKey []byte, id, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(id + "." + timestamp + "."))
	mac.Write(body)
	return "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

func TestVerifyWebhook(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	secret := "whsec_" + base64.StdEncoding.EncodeToString(key)
	now := time.Now()
	ts := strconv.FormatInt(now.Unix(), 10)
	body := []byte(`{"type":"subscription.active"}`)
	good := sign(key, "msg_1", ts, body)

	if err := VerifyWebhook(secret, "msg_1", ts, "v1,bogus "+good, body, now); err != nil {
		t.Fatalf("valid signature rejected: %v", err)
	}
	if err := VerifyWebhook(secret, "msg_1", ts, good, []byte(`{"type":"tampered"}`), now); err == nil {
		t.Fatal("tampered body accepted")
	}
	if err := VerifyWebhook(secret, "msg_2", ts, good, body, now); err == nil {
		t.Fatal("signature for another message id accepted")
	}
	if err := VerifyWebhook(secret, "msg_1", ts, good, body, now.Add(10*time.Minute)); err == nil {
		t.Fatal("stale timestamp accepted")
	}
	if err := VerifyWebhook("", "msg_1", ts, good, body, now); err == nil {
		t.Fatal("empty secret accepted")
	}
}
