package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/iappstores/api-go/internal/config"
	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/sponsors"
)

// Sponsor slots: a fixed number of paid homepage placements (internal/sponsors). The
// public endpoints list them, sell them through a Dodo Payments checkout and count
// clicks; the webhook keeps each listing in step with its subscription; the admin
// endpoints (behind SPONSOR_ADMIN_TOKEN) review listings before they go live.

func (s *Server) registerSponsorRoutes(mux *http.ServeMux) {
	if s.Sponsors == nil {
		return
	}
	mux.HandleFunc("GET /api/sponsors", s.handleSponsors)
	mux.HandleFunc("POST /api/sponsors/checkout", s.handleSponsorCheckout)
	mux.HandleFunc("POST /api/sponsors/waitlist", s.handleSponsorWaitlist)
	mux.HandleFunc("POST /api/sponsors/webhook", s.handleSponsorWebhook)
	mux.HandleFunc("GET /api/sponsors/{id}/go", s.handleSponsorClick)
	mux.HandleFunc("GET /api/sponsors/admin", s.handleSponsorAdminList)
	mux.HandleFunc("POST /api/sponsors/admin/{id}/{action}", s.handleSponsorAdminAction)
}

// sponsorCheckoutEnabled reports whether slots can be bought: it needs the API key, the
// product to sell and the webhook secret (without it a payment could never be recorded).
func (s *Server) sponsorCheckoutEnabled() bool {
	return s.Dodo != nil && config.DodoSponsorProductID() != "" && config.DodoWebhookSecret() != ""
}

func sponsorDto(sp sponsors.Sponsor) contracts.SponsorDto {
	return contracts.SponsorDto{ID: sp.ID, Name: sp.Name, Tagline: sp.Tagline, URL: sp.URL, IconURL: sp.IconURL}
}

func (s *Server) sponsorSlots(now time.Time) (contracts.SponsorSlots, error) {
	total := config.SponsorSlots()
	taken, err := s.Sponsors.Occupied(now)
	if err != nil {
		return contracts.SponsorSlots{}, err
	}
	return contracts.SponsorSlots{Total: total, Available: max(0, total-taken)}, nil
}

func (s *Server) handleSponsors(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	live, err := s.Sponsors.ListLive(now)
	if err != nil {
		sendError(w, 500, "sponsors_unavailable", "Could not load sponsors.", errDetails(err))
		return
	}
	slots, err := s.sponsorSlots(now)
	if err != nil {
		sendError(w, 500, "sponsors_unavailable", "Could not load sponsors.", errDetails(err))
		return
	}
	dtos := make([]contracts.SponsorDto, 0, len(live))
	for _, sp := range live {
		dtos = append(dtos, sponsorDto(sp))
	}
	writeJSON(w, 200, contracts.SponsorsResponse{
		Sponsors:        dtos,
		Slots:           slots,
		PriceUSD:        config.SponsorPriceUSD(),
		CheckoutEnabled: s.sponsorCheckoutEnabled(),
	})
}

// cleanText trims, collapses runs of whitespace and rejects control characters.
func cleanText(value string) (string, bool) {
	for _, r := range value {
		if unicode.IsControl(r) && !unicode.IsSpace(r) {
			return "", false
		}
	}
	return strings.Join(strings.Fields(value), " "), true
}

// cleanHTTPSURL accepts only absolute https URLs on a real-looking host: the value ends
// up in an href and an <img src>, so javascript:, data: and friends must never pass.
func cleanHTTPSURL(value string, maxLen int) (string, bool) {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > maxLen {
		return "", false
	}
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "https" || u.User != nil || !strings.Contains(u.Hostname(), ".") {
		return "", false
	}
	return u.String(), true
}

func cleanEmail(value string) (string, bool) {
	value = strings.TrimSpace(value)
	addr, err := mail.ParseAddress(value)
	if err != nil || addr.Address != value || len(value) > 254 || !strings.Contains(value[strings.LastIndex(value, "@")+1:], ".") {
		return "", false
	}
	return value, true
}

type sponsorCheckoutRequest struct {
	Name    string `json:"name"`
	Tagline string `json:"tagline"`
	URL     string `json:"url"`
	IconURL string `json:"iconUrl"`
	Email   string `json:"email"`
}

// Limits for a listing's text. Keep in step with SponsorCheckoutRequestSchema in
// packages/contracts.
const (
	sponsorNameMin, sponsorNameMax       = 2, 40
	sponsorTaglineMin, sponsorTaglineMax = 10, 90
)

func parseSponsorListing(in sponsorCheckoutRequest) (sponsors.Listing, map[string]string) {
	problems := map[string]string{}
	var listing sponsors.Listing

	name, ok := cleanText(in.Name)
	if n := utf8.RuneCountInString(name); !ok || n < sponsorNameMin || n > sponsorNameMax {
		problems["name"] = "Name must be 2 to 40 characters."
	}
	tagline, ok := cleanText(in.Tagline)
	if n := utf8.RuneCountInString(tagline); !ok || n < sponsorTaglineMin || n > sponsorTaglineMax {
		problems["tagline"] = "Tagline must be 10 to 90 characters."
	}
	link, ok := cleanHTTPSURL(in.URL, 300)
	if !ok {
		problems["url"] = "Link must be a full https:// URL."
	}
	if strings.TrimSpace(in.IconURL) != "" {
		icon, ok := cleanHTTPSURL(in.IconURL, 500)
		if !ok {
			problems["iconUrl"] = "Icon must be a full https:// image URL."
		}
		listing.IconURL = &icon
	}
	email, ok := cleanEmail(in.Email)
	if !ok {
		problems["email"] = "Enter a valid email address."
	}

	listing.Name, listing.Tagline, listing.URL, listing.Email = name, tagline, link, email
	return listing, problems
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, out interface{}) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(out); err != nil {
		sendError(w, 400, "invalid_body", "Request body must be JSON.", nil)
		return false
	}
	return true
}

func (s *Server) handleSponsorCheckout(w http.ResponseWriter, r *http.Request) {
	if !s.sponsorCheckoutEnabled() {
		sendError(w, 503, "sponsor_checkout_unavailable", "Sponsor checkout is not open yet.", nil)
		return
	}
	var body sponsorCheckoutRequest
	if !decodeJSONBody(w, r, &body) {
		return
	}
	listing, problems := parseSponsorListing(body)
	if len(problems) > 0 {
		sendError(w, 400, "invalid_sponsor", "Some details need fixing.", problems)
		return
	}

	id, err := s.Sponsors.Reserve(listing, config.SponsorSlots(), time.Now())
	switch {
	case errors.Is(err, sponsors.ErrSoldOut):
		sendError(w, 409, "sponsor_sold_out", "All sponsor slots are taken right now. Join the waitlist to hear when one frees up.", nil)
		return
	case errors.Is(err, sponsors.ErrBusy):
		sendError(w, 429, "sponsor_checkout_busy", "Too many checkouts were started just now. Try again in a little while.", nil)
		return
	case err != nil:
		sendError(w, 500, "sponsor_checkout_failed", "Could not start checkout.", errDetails(err))
		return
	}

	session, err := s.Dodo.CreateCheckout(r.Context(), sponsors.CheckoutRequest{
		ProductID: config.DodoSponsorProductID(),
		SponsorID: id,
		Email:     listing.Email,
		Name:      listing.Name,
		ReturnURL: config.SiteURL() + "/sponsor/thanks",
	})
	if err != nil {
		log.Printf("sponsors: could not create checkout for %s: %v", id, err)
		if err := s.Sponsors.Release(id); err != nil {
			log.Printf("sponsors: could not release hold %s: %v", id, err)
		}
		sendError(w, 502, "sponsor_checkout_failed", "Could not start checkout. Try again in a moment.", nil)
		return
	}
	if err := s.Sponsors.SetCheckoutSession(id, session.SessionID); err != nil {
		log.Printf("sponsors: could not store checkout session for %s: %v", id, err)
	}
	writeJSON(w, 200, contracts.SponsorCheckoutResponse{CheckoutURL: session.CheckoutURL})
}

func (s *Server) handleSponsorWaitlist(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	email, ok := cleanEmail(body.Email)
	if !ok {
		sendError(w, 400, "invalid_sponsor", "Enter a valid email address.", nil)
		return
	}
	if err := s.Sponsors.AddToWaitlist(email, time.Now()); err != nil {
		sendError(w, 500, "sponsor_waitlist_failed", "Could not join the waitlist.", errDetails(err))
		return
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

// handleSponsorClick counts a click and forwards the visitor to the sponsor's site.
func (s *Server) handleSponsorClick(w http.ResponseWriter, r *http.Request) {
	target, err := s.Sponsors.RecordClick(r.PathValue("id"), time.Now())
	if err != nil {
		sendError(w, 404, "sponsor_not_found", "This sponsor listing is no longer active.", nil)
		return
	}
	if u, err := url.Parse(target); err == nil {
		q := u.Query()
		if !q.Has("utm_source") {
			q.Set("utm_source", "iappstores")
			q.Set("utm_medium", "sponsor_slot")
			u.RawQuery = q.Encode()
		}
		target = u.String()
	}
	w.Header().Set("Cache-Control", "no-store")
	http.Redirect(w, r, target, http.StatusFound)
}

// handleSponsorWebhook applies Dodo subscription events. It answers 2xx for anything it
// has handled or can ignore, and 5xx only when a retry could succeed.
func (s *Server) handleSponsorWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 1<<20))
	if err != nil {
		sendError(w, 400, "invalid_body", "Could not read the request body.", nil)
		return
	}
	now := time.Now()
	webhookID := r.Header.Get("webhook-id")
	if err := sponsors.VerifyWebhook(config.DodoWebhookSecret(), webhookID, r.Header.Get("webhook-timestamp"), r.Header.Get("webhook-signature"), body, now); err != nil {
		sendError(w, 401, "invalid_signature", "Webhook signature is not valid.", nil)
		return
	}

	var event sponsors.WebhookEvent
	if err := json.Unmarshal(body, &event); err != nil {
		sendError(w, 400, "invalid_body", "Webhook body is not valid JSON.", nil)
		return
	}
	ignored := map[string]bool{"ok": true, "ignored": true}
	// The Dodo account may sell other products too; only this one is a sponsor slot.
	if !strings.HasPrefix(event.Type, "subscription.") || event.Data.ProductID != config.DodoSponsorProductID() {
		writeJSON(w, 200, ignored)
		return
	}
	if seen, err := s.Sponsors.WebhookSeen(webhookID); err != nil {
		sendError(w, 500, "sponsor_webhook_failed", "Could not process the webhook.", nil)
		return
	} else if seen {
		writeJSON(w, 200, ignored)
		return
	}

	at, ok := sponsors.ParseTime(event.Timestamp)
	if !ok {
		at = now
	}
	sponsorID, _ := event.Data.Metadata["sponsor_id"].(string)
	ev := sponsors.SubscriptionEvent{
		SponsorID:      sponsorID,
		SubscriptionID: event.Data.SubscriptionID,
		CustomerID:     event.Data.Customer.CustomerID,
		Email:          event.Data.Customer.Email,
		At:             at,
	}

	// The subscription's status, not the event name, decides what happens: every
	// subscription.* event carries the full object, so this also covers "updated".
	var sp sponsors.Sponsor
	switch event.Data.Status {
	case "active":
		sp, err = s.Sponsors.Activate(ev, config.SponsorSlots(), config.SponsorAutoApprove())
	case "on_hold", "paused":
		sp, err = s.Sponsors.Pause(ev)
	case "cancelled", "expired", "failed":
		var paidUntil *time.Time
		if t, ok := sponsors.ParseTime(event.Data.NextBillingDate); ok && event.Data.Status == "cancelled" {
			paidUntil = &t
		}
		sp, err = s.Sponsors.End(ev, paidUntil)
		if err == nil {
			s.sweepSponsors()
		}
	default: // pending, past_due: nothing changes yet.
		writeJSON(w, 200, ignored)
		return
	}

	if errors.Is(err, sponsors.ErrNotFound) {
		log.Printf("sponsors: %s for subscription %s (%s) matches no listing; check it in the Dodo dashboard", event.Type, ev.SubscriptionID, ev.Email)
	} else if err != nil {
		log.Printf("sponsors: could not apply %s for subscription %s: %v", event.Type, ev.SubscriptionID, err)
		sendError(w, 500, "sponsor_webhook_failed", "Could not process the webhook.", nil)
		return
	} else {
		log.Printf("sponsors: %s -> listing %s %q (%s) is now %s", event.Type, sp.ID, sp.Name, sp.Email, sp.Status)
		if sp.Status == sponsors.StatusQueued {
			log.Printf("sponsors: OVERSOLD: %s paid after every slot was taken. Raise SPONSOR_SLOTS, or end the listing and refund it.", sp.ID)
		}
	}
	if err := s.Sponsors.MarkWebhookHandled(webhookID, now); err != nil {
		log.Printf("sponsors: could not record webhook %s: %v", webhookID, err)
	}
	writeJSON(w, 200, map[string]bool{"ok": true})
}

func (s *Server) sweepSponsors() {
	if err := s.Sponsors.Sweep(config.SponsorSlots(), config.SponsorAutoApprove(), time.Now()); err != nil {
		log.Printf("sponsors: sweep failed: %v", err)
	}
}

// RunSponsorSweeper runs the store's housekeeping every few minutes until ctx ends.
func (s *Server) RunSponsorSweeper(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		s.sweepSponsors()
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// --- admin ---

// sponsorAdminAllowed checks the bearer token. With no token configured the admin
// endpoints answer 404, as if they did not exist.
func sponsorAdminAllowed(w http.ResponseWriter, r *http.Request) bool {
	token := config.SponsorAdminToken()
	if token == "" {
		sendError(w, 404, "not_found", "Not found.", nil)
		return false
	}
	given := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if subtle.ConstantTimeCompare([]byte(given), []byte(token)) != 1 {
		sendError(w, 401, "unauthorized", "Admin token is missing or wrong.", nil)
		return false
	}
	return true
}

func (s *Server) writeSponsorAdmin(w http.ResponseWriter, warning string) {
	all, err := s.Sponsors.ListAll()
	if err != nil {
		sendError(w, 500, "sponsors_unavailable", "Could not load sponsors.", errDetails(err))
		return
	}
	waitlist, err := s.Sponsors.Waitlist()
	if err != nil {
		sendError(w, 500, "sponsors_unavailable", "Could not load the waitlist.", errDetails(err))
		return
	}
	slots, err := s.sponsorSlots(time.Now())
	if err != nil {
		sendError(w, 500, "sponsors_unavailable", "Could not load sponsors.", errDetails(err))
		return
	}
	out := contracts.SponsorAdminResponse{
		Sponsors: make([]contracts.SponsorAdminItem, 0, len(all)),
		Waitlist: make([]contracts.SponsorWaitlistItem, 0, len(waitlist)),
		Slots:    slots,
	}
	if warning != "" {
		out.Warning = &warning
	}
	for _, sp := range all {
		out.Sponsors = append(out.Sponsors, contracts.SponsorAdminItem{
			SponsorDto:     sponsorDto(sp),
			Email:          sp.Email,
			Status:         string(sp.Status),
			SubscriptionID: sp.SubscriptionID,
			CreatedAt:      sp.CreatedAt,
			EndsAt:         sp.EndsAt,
			Clicks:         sp.Clicks,
		})
	}
	for _, entry := range waitlist {
		out.Waitlist = append(out.Waitlist, contracts.SponsorWaitlistItem{Email: entry.Email, CreatedAt: entry.CreatedAt})
	}
	writeJSON(w, 200, out)
}

func (s *Server) handleSponsorAdminList(w http.ResponseWriter, r *http.Request) {
	if !sponsorAdminAllowed(w, r) {
		return
	}
	s.writeSponsorAdmin(w, "")
}

// handleSponsorAdminAction approves, rejects or ends a listing. Rejecting or ending also
// cancels the subscription in Dodo; refunds stay a manual step in the Dodo dashboard.
func (s *Server) handleSponsorAdminAction(w http.ResponseWriter, r *http.Request) {
	if !sponsorAdminAllowed(w, r) {
		return
	}
	id, action, now := r.PathValue("id"), r.PathValue("action"), time.Now()

	var sp sponsors.Sponsor
	var err error
	switch action {
	case "approve":
		sp, err = s.Sponsors.Approve(id, config.SponsorSlots(), now)
	case "reject":
		sp, err = s.Sponsors.Close(id, sponsors.StatusRejected, now)
	case "end":
		sp, err = s.Sponsors.Close(id, sponsors.StatusEnded, now)
	default:
		sendError(w, 400, "invalid_action", "Action must be approve, reject or end.", nil)
		return
	}
	switch {
	case errors.Is(err, sponsors.ErrNotFound):
		sendError(w, 404, "sponsor_not_found", "No such sponsor listing.", nil)
		return
	case errors.Is(err, sponsors.ErrNoFreeSlot):
		sendError(w, 409, "sponsor_sold_out", "No slot is free for this listing. End another one or raise SPONSOR_SLOTS.", nil)
		return
	case err != nil:
		sendError(w, 500, "sponsor_update_failed", "Could not update the listing.", errDetails(err))
		return
	}
	log.Printf("sponsors: admin %s -> listing %s %q is now %s", action, sp.ID, sp.Name, sp.Status)

	warning := ""
	if action != "approve" {
		if sp.SubscriptionID != nil && s.Dodo != nil {
			if err := s.Dodo.CancelSubscription(r.Context(), *sp.SubscriptionID); err != nil {
				log.Printf("sponsors: could not cancel subscription %s: %v", *sp.SubscriptionID, err)
				warning = "The listing was taken down, but cancelling subscription " + *sp.SubscriptionID + " in Dodo failed. Cancel it in the Dodo dashboard."
			}
		}
		s.sweepSponsors()
	}
	s.writeSponsorAdmin(w, warning)
}
