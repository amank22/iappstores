// Package sponsors owns paid homepage sponsor slots: a fixed number of slots, each a
// monthly subscription billed through Dodo Payments. The store is the source of truth
// for who holds a slot; Dodo webhooks move a listing through its lifecycle (see the
// status list in migrations/0003_sponsors.sql).
package sponsors

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/iappstores/api-go/internal/dbconn"
)

type Status string

const (
	StatusCheckout      Status = "checkout"
	StatusPendingReview Status = "pending_review"
	StatusLive          Status = "live"
	StatusQueued        Status = "queued"
	StatusPaused        Status = "paused"
	StatusEnded         Status = "ended"
	StatusRejected      Status = "rejected"
)

var (
	// ErrSoldOut: every slot is live, in review or held by someone mid-checkout.
	ErrSoldOut = errors.New("all sponsor slots are taken")
	// ErrBusy: too many checkouts were started recently (see maxCheckoutsPerHour).
	ErrBusy     = errors.New("too many checkouts started recently")
	ErrNotFound = errors.New("sponsor not found")
	// ErrNoFreeSlot: approving or promoting would exceed the slot count.
	ErrNoFreeSlot = errors.New("no free sponsor slot")
)

// maxCheckoutsPerHour bounds how many slot holds can be created per hour. A hold takes a
// slot off sale for HoldTTL, so without a cap a script could keep every slot "sold out".
const maxCheckoutsPerHour = 20

// HoldTTL is how long a slot stays reserved for a buyer who has been sent to checkout.
const HoldTTL = 30 * time.Minute

// abandonedCheckoutTTL is how long an unpaid checkout row is kept. Dodo checkout links
// stay valid for 24 hours, so a late payment must still find its listing.
const abandonedCheckoutTTL = 48 * time.Hour

// occupiesSlot matches rows that count against the slot total at time ?.
const occupiesSlot = `(
	(status = 'checkout' AND hold_expires_at > ?1)
	OR status IN ('pending_review', 'paused')
	OR (status = 'live' AND (ends_at IS NULL OR ends_at > ?1))
)`

// Plan is what a sponsor bought.
type Plan string

const (
	// PlanSlot is a tile in the homepage sponsor row.
	PlanSlot Plan = "slot"
	// PlanPage is the tile plus a dedicated page at /sponsored/<slug>.
	PlanPage Plan = "page"
)

type Listing struct {
	Name    string
	Tagline string
	URL     string
	IconURL *string
	Email   string
	Plan    Plan
	// Description is the dedicated page's text (PlanPage only).
	Description *string
}

type Sponsor struct {
	ID             string
	Name           string
	Tagline        string
	URL            string
	IconURL        *string
	Email          string
	Plan           Plan
	Slug           *string
	Description    *string
	Status         Status
	SubscriptionID *string
	ApprovedAt     *int64
	EndsAt         *int64
	CreatedAt      int64
	UpdatedAt      int64
	Clicks         int64
}

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return "sp_" + hex.EncodeToString(b)
}

const sponsorColumns = `id, name, tagline, url, icon_url, email, plan, slug, description, status, subscription_id, approved_at, ends_at, created_at, updated_at`

type scanner interface {
	Scan(dest ...interface{}) error
}

func scanSponsor(row scanner, extra ...interface{}) (Sponsor, error) {
	var s Sponsor
	var iconURL, subscriptionID, slug, description sql.NullString
	var approvedAt, endsAt sql.NullInt64
	dest := []interface{}{&s.ID, &s.Name, &s.Tagline, &s.URL, &iconURL, &s.Email, &s.Plan, &slug, &description, &s.Status, &subscriptionID, &approvedAt, &endsAt, &s.CreatedAt, &s.UpdatedAt}
	if err := row.Scan(append(dest, extra...)...); err != nil {
		return s, err
	}
	if iconURL.Valid {
		s.IconURL = &iconURL.String
	}
	if subscriptionID.Valid {
		s.SubscriptionID = &subscriptionID.String
	}
	if slug.Valid {
		s.Slug = &slug.String
	}
	if description.Valid {
		s.Description = &description.String
	}
	if approvedAt.Valid {
		s.ApprovedAt = &approvedAt.Int64
	}
	if endsAt.Valid {
		s.EndsAt = &endsAt.Int64
	}
	return s, nil
}

// inTx runs fn in one write transaction (BEGIN IMMEDIATE, see dbconn), retrying the
// whole thing on SQLITE_BUSY. Slot accounting relies on it: the count and the insert or
// status change that depends on it must not interleave with another writer.
func (s *Store) inTx(fn func(tx *sql.Tx) error) error {
	return dbconn.RetryOnBusy(func() error {
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		if err := fn(tx); err != nil {
			return err
		}
		return tx.Commit()
	})
}

func occupied(tx *sql.Tx, now int64, excludeID string) (int, error) {
	var n int
	err := tx.QueryRow(`SELECT COUNT(*) FROM sponsors WHERE `+occupiesSlot+` AND id != ?2`, now, excludeID).Scan(&n)
	return n, err
}

// ListLive returns the sponsors shown on the homepage right now, oldest first.
func (s *Store) ListLive(now time.Time) ([]Sponsor, error) {
	rows, err := s.db.Query(`SELECT `+sponsorColumns+` FROM sponsors
		WHERE status = 'live' AND (ends_at IS NULL OR ends_at > ?) ORDER BY created_at`, now.UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Sponsor{}
	for rows.Next() {
		sp, err := scanSponsor(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sp)
	}
	return out, rows.Err()
}

// Occupied is how many slots are taken: live, in review, paused, or held for a checkout.
func (s *Store) Occupied(now time.Time) (int, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM sponsors WHERE `+occupiesSlot, now.UnixMilli()).Scan(&n)
	return n, err
}

// Reserve holds a slot for a buyer about to be sent to checkout and returns the new
// listing's id. It fails with ErrSoldOut when no slot is free.
func (s *Store) Reserve(in Listing, slots int, now time.Time) (string, error) {
	id := newID()
	nowMs := now.UnixMilli()
	err := s.inTx(func(tx *sql.Tx) error {
		taken, err := occupied(tx, nowMs, "")
		if err != nil {
			return err
		}
		if taken >= slots {
			return ErrSoldOut
		}
		var recent int
		if err := tx.QueryRow(`SELECT COUNT(*) FROM sponsors WHERE created_at > ?`, now.Add(-time.Hour).UnixMilli()).Scan(&recent); err != nil {
			return err
		}
		if recent >= maxCheckoutsPerHour {
			return ErrBusy
		}
		plan := in.Plan
		if plan == "" {
			plan = PlanSlot
		}
		var slug *string
		if plan == PlanPage {
			free, err := freeSlug(tx, in.Name, id)
			if err != nil {
				return err
			}
			slug = &free
		}
		_, err = tx.Exec(`INSERT INTO sponsors (id, name, tagline, url, icon_url, email, plan, slug, description, status, hold_expires_at, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'checkout', ?, ?, ?)`,
			id, in.Name, in.Tagline, in.URL, in.IconURL, in.Email, string(plan), slug, in.Description, now.Add(HoldTTL).UnixMilli(), nowMs, nowMs)
		return err
	})
	return id, err
}

// Slugify turns a name into a URL path segment: lowercase ASCII letters and digits
// joined by single hyphens. Names with nothing usable give "".
func Slugify(name string) string {
	var b strings.Builder
	pendingHyphen := false
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			if pendingHyphen && b.Len() > 0 {
				b.WriteByte('-')
			}
			pendingHyphen = false
			b.WriteRune(r)
		} else {
			pendingHyphen = true
		}
	}
	return b.String()
}

// freeSlug picks the page slug for a new listing: the slugified name, or that plus part
// of the listing id when another listing (even an ended one, whose URL may still be
// linked) already has it.
func freeSlug(tx *sql.Tx, name, id string) (string, error) {
	slug := Slugify(name)
	suffix := strings.TrimPrefix(id, "sp_")[:6]
	if slug == "" {
		return "app-" + suffix, nil
	}
	var taken int
	if err := tx.QueryRow(`SELECT COUNT(*) FROM sponsors WHERE slug = ?`, slug).Scan(&taken); err != nil {
		return "", err
	}
	if taken > 0 {
		return slug + "-" + suffix, nil
	}
	return slug, nil
}

// SetCheckoutSession records the Dodo checkout session created for a held slot.
func (s *Store) SetCheckoutSession(id, sessionID string) error {
	_, err := s.db.Exec(`UPDATE sponsors SET checkout_session_id = ? WHERE id = ?`, sessionID, id)
	return err
}

// Release drops a hold whose checkout could not be created.
func (s *Store) Release(id string) error {
	_, err := s.db.Exec(`DELETE FROM sponsors WHERE id = ? AND status = 'checkout'`, id)
	return err
}

// SubscriptionEvent is what the store needs from a Dodo subscription webhook.
type SubscriptionEvent struct {
	// SponsorID comes from the checkout metadata; empty when Dodo did not echo it.
	SponsorID      string
	SubscriptionID string
	CustomerID     string
	Email          string
	// At is the event's own timestamp, used to drop events delivered out of order.
	At time.Time
}

// find locates the listing for an event: by subscription id, then by the sponsor id in
// the checkout metadata, then by the buyer's email on a listing still awaiting payment.
func find(tx *sql.Tx, ev SubscriptionEvent) (Sponsor, int64, error) {
	var lastEventAt int64
	queries := []struct {
		sql string
		arg string
	}{
		{`SELECT ` + sponsorColumns + `, last_event_at FROM sponsors WHERE subscription_id = ?`, ev.SubscriptionID},
		{`SELECT ` + sponsorColumns + `, last_event_at FROM sponsors WHERE id = ? AND (subscription_id IS NULL OR subscription_id = '')`, ev.SponsorID},
		{`SELECT ` + sponsorColumns + `, last_event_at FROM sponsors WHERE status = 'checkout' AND lower(email) = lower(?) ORDER BY created_at DESC LIMIT 1`, ev.Email},
	}
	for _, q := range queries {
		if q.arg == "" {
			continue
		}
		sp, err := scanSponsor(tx.QueryRow(q.sql, q.arg), &lastEventAt)
		if err == nil {
			return sp, lastEventAt, nil
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return sp, 0, err
		}
	}
	return Sponsor{}, 0, ErrNotFound
}

// applyEvent finds the event's listing and, unless the event is older than one already
// applied, hands it to fn to compute the next status. fn returns the new status, the
// new ends_at and whether approved_at should be stamped.
func (s *Store) applyEvent(ev SubscriptionEvent, fn func(tx *sql.Tx, sp Sponsor) (Status, *int64, bool, error)) (Sponsor, error) {
	var out Sponsor
	err := s.inTx(func(tx *sql.Tx) error {
		sp, lastEventAt, err := find(tx, ev)
		if err != nil {
			return err
		}
		out = sp
		if ev.At.UnixMilli() < lastEventAt {
			return nil
		}
		status, endsAt, approve, err := fn(tx, sp)
		if err != nil {
			return err
		}
		approvedAt := sp.ApprovedAt
		if approve && approvedAt == nil {
			t := ev.At.UnixMilli()
			approvedAt = &t
		}
		out.Status, out.EndsAt, out.ApprovedAt = status, endsAt, approvedAt
		_, err = tx.Exec(`UPDATE sponsors SET status = ?, ends_at = ?, approved_at = ?, hold_expires_at = NULL,
				subscription_id = COALESCE(NULLIF(?, ''), subscription_id), customer_id = COALESCE(NULLIF(?, ''), customer_id),
				last_event_at = ?, updated_at = ? WHERE id = ?`,
			string(status), endsAt, approvedAt, ev.SubscriptionID, ev.CustomerID, ev.At.UnixMilli(), time.Now().UnixMilli(), sp.ID)
		return err
	})
	return out, err
}

// Activate applies an active subscription: a new payment takes its slot (in review, or
// live straight away with autoApprove), and a paused listing comes back. If every slot
// was taken by the time the payment landed, the listing is queued instead.
func (s *Store) Activate(ev SubscriptionEvent, slots int, autoApprove bool) (Sponsor, error) {
	return s.applyEvent(ev, func(tx *sql.Tx, sp Sponsor) (Status, *int64, bool, error) {
		switch sp.Status {
		case StatusCheckout:
			taken, err := occupied(tx, ev.At.UnixMilli(), sp.ID)
			if err != nil {
				return "", nil, false, err
			}
			if taken >= slots {
				return StatusQueued, nil, false, nil
			}
			if autoApprove {
				return StatusLive, nil, true, nil
			}
			return StatusPendingReview, nil, false, nil
		case StatusPaused:
			if sp.ApprovedAt != nil {
				return StatusLive, nil, false, nil
			}
			return StatusPendingReview, nil, false, nil
		case StatusLive:
			// A renewal, or a cancellation that was undone: clear any scheduled end.
			return StatusLive, nil, false, nil
		}
		// pending_review, queued, ended, rejected: an "active" event changes nothing.
		return sp.Status, sp.EndsAt, false, nil
	})
}

// Pause hides a listing whose renewal failed or whose subscription is paused. It keeps
// its slot so a retried payment can bring it back.
func (s *Store) Pause(ev SubscriptionEvent) (Sponsor, error) {
	return s.applyEvent(ev, func(tx *sql.Tx, sp Sponsor) (Status, *int64, bool, error) {
		if sp.Status == StatusLive || sp.Status == StatusPendingReview {
			return StatusPaused, nil, false, nil
		}
		return sp.Status, sp.EndsAt, false, nil
	})
}

// End applies a cancelled, expired or failed subscription. A live listing stays up until
// paidUntil (the period already paid for) when that is still in the future.
func (s *Store) End(ev SubscriptionEvent, paidUntil *time.Time) (Sponsor, error) {
	return s.applyEvent(ev, func(tx *sql.Tx, sp Sponsor) (Status, *int64, bool, error) {
		switch sp.Status {
		case StatusRejected, StatusEnded:
			return sp.Status, sp.EndsAt, false, nil
		case StatusLive:
			if paidUntil != nil && paidUntil.After(ev.At) {
				t := paidUntil.UnixMilli()
				return StatusLive, &t, false, nil
			}
		}
		return StatusEnded, nil, false, nil
	})
}

// Sweep does the store's periodic housekeeping: closes listings whose paid period ran
// out, drops abandoned checkouts, and gives freed slots to queued (oversold) listings,
// oldest first.
func (s *Store) Sweep(slots int, autoApprove bool, now time.Time) error {
	nowMs := now.UnixMilli()
	return s.inTx(func(tx *sql.Tx) error {
		if _, err := tx.Exec(`UPDATE sponsors SET status = 'ended', updated_at = ?1 WHERE status = 'live' AND ends_at IS NOT NULL AND ends_at <= ?1`, nowMs); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM sponsors WHERE status = 'checkout' AND created_at < ?`, now.Add(-abandonedCheckoutTTL).UnixMilli()); err != nil {
			return err
		}
		if _, err := tx.Exec(`DELETE FROM sponsor_webhook_events WHERE received_at < ?`, now.Add(-30*24*time.Hour).UnixMilli()); err != nil {
			return err
		}
		taken, err := occupied(tx, nowMs, "")
		if err != nil {
			return err
		}
		if taken >= slots {
			return nil
		}
		next := StatusPendingReview
		var approvedAt interface{}
		if autoApprove {
			next, approvedAt = StatusLive, nowMs
		}
		res, err := tx.Exec(`UPDATE sponsors SET status = ?, approved_at = COALESCE(approved_at, ?), updated_at = ?
			WHERE id IN (SELECT id FROM sponsors WHERE status = 'queued' ORDER BY created_at LIMIT ?)`,
			string(next), approvedAt, nowMs, slots-taken)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n > 0 {
			log.Printf("sponsors: moved %d queued listing(s) into free slots as %s", n, next)
		}
		return nil
	})
}

// --- admin ---

// ListAll returns every listing, newest first, with its total click count.
func (s *Store) ListAll() ([]Sponsor, error) {
	rows, err := s.db.Query(`SELECT ` + sponsorColumns + `,
			COALESCE((SELECT SUM(clicks) FROM sponsor_clicks WHERE sponsor_id = sponsors.id), 0)
		FROM sponsors ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Sponsor{}
	for rows.Next() {
		var clicks int64
		sp, err := scanSponsor(rows, &clicks)
		if err != nil {
			return nil, err
		}
		sp.Clicks = clicks
		out = append(out, sp)
	}
	return out, rows.Err()
}

// Approve publishes a listing that is in review, or a queued one if a slot is free.
func (s *Store) Approve(id string, slots int, now time.Time) (Sponsor, error) {
	return s.adminUpdate(id, func(tx *sql.Tx, sp Sponsor) (Status, error) {
		switch sp.Status {
		case StatusPendingReview:
			return StatusLive, nil
		case StatusQueued:
			taken, err := occupied(tx, now.UnixMilli(), sp.ID)
			if err != nil {
				return "", err
			}
			if taken >= slots {
				return "", ErrNoFreeSlot
			}
			return StatusLive, nil
		}
		return sp.Status, nil
	}, now)
}

// Close takes a listing down for good, as rejected (failed review) or ended.
func (s *Store) Close(id string, status Status, now time.Time) (Sponsor, error) {
	return s.adminUpdate(id, func(tx *sql.Tx, sp Sponsor) (Status, error) {
		return status, nil
	}, now)
}

func (s *Store) adminUpdate(id string, fn func(tx *sql.Tx, sp Sponsor) (Status, error), now time.Time) (Sponsor, error) {
	var out Sponsor
	err := s.inTx(func(tx *sql.Tx) error {
		sp, err := scanSponsor(tx.QueryRow(`SELECT `+sponsorColumns+` FROM sponsors WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return err
		}
		status, err := fn(tx, sp)
		if err != nil {
			return err
		}
		nowMs := now.UnixMilli()
		if status == StatusLive && sp.ApprovedAt == nil {
			sp.ApprovedAt = &nowMs
		}
		sp.Status, sp.UpdatedAt = status, nowMs
		out = sp
		_, err = tx.Exec(`UPDATE sponsors SET status = ?, approved_at = ?, hold_expires_at = NULL, updated_at = ? WHERE id = ?`,
			string(status), sp.ApprovedAt, nowMs, id)
		return err
	})
	return out, err
}

// --- clicks, waitlist, webhook de-duplication ---

// RecordClick counts a click on a live sponsor and returns the URL to send the visitor to.
func (s *Store) RecordClick(id string, now time.Time) (string, error) {
	var url string
	err := s.db.QueryRow(`SELECT url FROM sponsors WHERE id = ? AND status = 'live' AND (ends_at IS NULL OR ends_at > ?)`, id, now.UnixMilli()).Scan(&url)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil {
		return "", err
	}
	if _, err := s.db.Exec(`INSERT INTO sponsor_clicks (sponsor_id, day, clicks) VALUES (?, ?, 1)
		ON CONFLICT(sponsor_id, day) DO UPDATE SET clicks = clicks + 1`, id, now.UTC().Format("2006-01-02")); err != nil {
		// The click still goes through; only the count is lost.
		log.Printf("sponsors: could not record click for %s: %v", id, err)
	}
	return url, nil
}

func (s *Store) AddToWaitlist(email string, now time.Time) error {
	_, err := s.db.Exec(`INSERT INTO sponsor_waitlist (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO NOTHING`, email, now.UnixMilli())
	return err
}

type WaitlistEntry struct {
	Email     string
	CreatedAt int64
}

func (s *Store) Waitlist() ([]WaitlistEntry, error) {
	rows, err := s.db.Query(`SELECT email, created_at FROM sponsor_waitlist ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WaitlistEntry{}
	for rows.Next() {
		var e WaitlistEntry
		if err := rows.Scan(&e.Email, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// WebhookSeen reports whether this webhook id was already handled.
func (s *Store) WebhookSeen(webhookID string) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM sponsor_webhook_events WHERE webhook_id = ?`, webhookID).Scan(&n)
	return n > 0, err
}

// MarkWebhookHandled records a webhook id once its event has been applied.
func (s *Store) MarkWebhookHandled(webhookID string, now time.Time) error {
	_, err := s.db.Exec(`INSERT INTO sponsor_webhook_events (webhook_id, received_at) VALUES (?, ?) ON CONFLICT(webhook_id) DO NOTHING`, webhookID, now.UnixMilli())
	return err
}
