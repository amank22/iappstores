package httpapi

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/iappstores/api-go/internal/contracts"
	"github.com/iappstores/api-go/internal/sponsors"
)

const testProductID = "pdt_sponsor"

var testWebhookKey = []byte("0123456789abcdef0123456789abcdef")

// newSponsorServer returns a server whose Dodo client talks to a fake that hands out
// checkout sessions and records which subscriptions were cancelled.
func newSponsorServer(t *testing.T, slots int) (*Server, *[]string) {
	t.Helper()
	cancelled := &[]string{}
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			*cancelled = append(*cancelled, strings.TrimPrefix(r.URL.Path, "/subscriptions/"))
			w.Write([]byte(`{}`))
			return
		}
		var body struct {
			Metadata map[string]string `json:"metadata"`
		}
		json.NewDecoder(r.Body).Decode(&body)
		fmt.Fprintf(w, `{"session_id":"cks_1","checkout_url":"https://checkout.test/%s"}`, body.Metadata["sponsor_id"])
	}))
	t.Cleanup(fake.Close)

	t.Setenv("SPONSOR_SLOTS", strconv.Itoa(slots))
	t.Setenv("SPONSOR_ADMIN_TOKEN", "admin-secret")
	t.Setenv("DODO_SPONSOR_PRODUCT_ID", testProductID)
	t.Setenv("DODO_PAYMENTS_WEBHOOK_SECRET", "whsec_"+base64.StdEncoding.EncodeToString(testWebhookKey))
	s := newTestServer(t)
	s.Dodo = &sponsors.Dodo{BaseURL: fake.URL, APIKey: "test", HTTP: fake.Client()}
	return s, cancelled
}

func call(t *testing.T, s *Server, method, path string, body interface{}, headers map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	var raw []byte
	switch v := body.(type) {
	case nil:
	case []byte:
		raw = v
	default:
		raw, _ = json.Marshal(v)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(raw))
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	w := httptest.NewRecorder()
	s.Routes().ServeHTTP(w, req)
	return w
}

func startCheckout(t *testing.T, s *Server, email string) (sponsorID string, w *httptest.ResponseRecorder) {
	t.Helper()
	w = call(t, s, "POST", "/api/sponsors/checkout", map[string]string{
		"name": "Good App", "tagline": "The best app there is", "url": "https://good.example", "email": email,
	}, nil)
	var out contracts.SponsorCheckoutResponse
	json.Unmarshal(w.Body.Bytes(), &out)
	return strings.TrimPrefix(out.CheckoutURL, "https://checkout.test/"), w
}

var webhookSeq int

func sendWebhook(t *testing.T, s *Server, sponsorID, subscriptionID, status, productID string) *httptest.ResponseRecorder {
	t.Helper()
	webhookSeq++
	body, _ := json.Marshal(map[string]interface{}{
		"type":      "subscription." + status,
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"data": map[string]interface{}{
			"subscription_id": subscriptionID,
			"product_id":      productID,
			"status":          status,
			"metadata":        map[string]string{"sponsor_id": sponsorID},
			"customer":        map[string]string{"customer_id": "cus_1", "email": "buyer@example.com"},
		},
	})
	id, ts := "msg_"+strconv.Itoa(webhookSeq), strconv.FormatInt(time.Now().Unix(), 10)
	mac := hmac.New(sha256.New, testWebhookKey)
	mac.Write([]byte(id + "." + ts + "."))
	mac.Write(body)
	return call(t, s, "POST", "/api/sponsors/webhook", body, map[string]string{
		"webhook-id": id, "webhook-timestamp": ts,
		"webhook-signature": "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil)),
	})
}

func readSponsors(t *testing.T, s *Server) contracts.SponsorsResponse {
	t.Helper()
	var out contracts.SponsorsResponse
	json.Unmarshal(call(t, s, "GET", "/api/sponsors", nil, nil).Body.Bytes(), &out)
	return out
}

var adminAuth = map[string]string{"Authorization": "Bearer admin-secret"}

func TestSponsorPurchaseReviewAndCancelFlow(t *testing.T) {
	s, cancelled := newSponsorServer(t, 2)

	if got := readSponsors(t, s); got.Slots.Available != 2 || !got.CheckoutEnabled || got.PriceUSD != 30 {
		t.Fatalf("initial sponsors = %+v", got)
	}

	id, w := startCheckout(t, s, "buyer@example.com")
	if w.Code != 200 || id == "" {
		t.Fatalf("checkout: %d %s", w.Code, w.Body)
	}
	if got := readSponsors(t, s); got.Slots.Available != 1 || len(got.Sponsors) != 0 {
		t.Fatalf("slot not held during checkout: %+v", got)
	}

	if w := sendWebhook(t, s, id, "sub_1", "active", testProductID); w.Code != 200 {
		t.Fatalf("webhook: %d %s", w.Code, w.Body)
	}
	if got := readSponsors(t, s); len(got.Sponsors) != 0 {
		t.Fatalf("paid listing went live without review: %+v", got)
	}

	if w := call(t, s, "POST", "/api/sponsors/admin/"+id+"/approve", nil, adminAuth); w.Code != 200 {
		t.Fatalf("approve: %d %s", w.Code, w.Body)
	}
	got := readSponsors(t, s)
	if len(got.Sponsors) != 1 || got.Sponsors[0].Name != "Good App" || got.Slots.Available != 1 {
		t.Fatalf("after approval: %+v", got)
	}

	click := call(t, s, "GET", "/api/sponsors/"+id+"/go", nil, nil)
	if click.Code != 302 || !strings.HasPrefix(click.Header().Get("Location"), "https://good.example?utm_") {
		t.Fatalf("click: %d -> %q", click.Code, click.Header().Get("Location"))
	}

	if w := call(t, s, "POST", "/api/sponsors/admin/"+id+"/end", nil, adminAuth); w.Code != 200 {
		t.Fatalf("end: %d %s", w.Code, w.Body)
	}
	if len(*cancelled) != 1 || (*cancelled)[0] != "sub_1" {
		t.Fatalf("ending a listing should cancel its subscription, cancelled = %v", *cancelled)
	}
	if got := readSponsors(t, s); len(got.Sponsors) != 0 || got.Slots.Available != 2 {
		t.Fatalf("after end: %+v", got)
	}
}

func TestSponsorCheckoutRefusedWhenSoldOut(t *testing.T) {
	s, _ := newSponsorServer(t, 1)
	if _, w := startCheckout(t, s, "a@example.com"); w.Code != 200 {
		t.Fatalf("first checkout: %d %s", w.Code, w.Body)
	}
	if _, w := startCheckout(t, s, "b@example.com"); w.Code != 409 {
		t.Fatalf("second checkout: %d, want 409", w.Code)
	}
	if w := call(t, s, "POST", "/api/sponsors/waitlist", map[string]string{"email": "b@example.com"}, nil); w.Code != 200 {
		t.Fatalf("waitlist: %d %s", w.Code, w.Body)
	}
	var admin contracts.SponsorAdminResponse
	json.Unmarshal(call(t, s, "GET", "/api/sponsors/admin", nil, adminAuth).Body.Bytes(), &admin)
	if len(admin.Waitlist) != 1 || admin.Waitlist[0].Email != "b@example.com" {
		t.Fatalf("waitlist = %+v", admin.Waitlist)
	}
}

func TestSponsorCheckoutRejectsUnsafeListings(t *testing.T) {
	s, _ := newSponsorServer(t, 2)
	for field, value := range map[string]string{
		"url":     "javascript:alert(1)",
		"iconUrl": "http://insecure.example/icon.png",
		"email":   "not-an-email",
		"name":    "x",
	} {
		body := map[string]string{"name": "Good App", "tagline": "The best app there is", "url": "https://good.example", "email": "a@example.com"}
		body[field] = value
		if w := call(t, s, "POST", "/api/sponsors/checkout", body, nil); w.Code != 400 {
			t.Errorf("%s=%q: status %d, want 400", field, value, w.Code)
		}
	}
	if got := readSponsors(t, s); got.Slots.Available != 2 {
		t.Fatalf("invalid submissions held slots: %+v", got.Slots)
	}
}

func TestSponsorWebhookRejectsBadSignatureAndIgnoresOtherProducts(t *testing.T) {
	s, _ := newSponsorServer(t, 2)
	id, _ := startCheckout(t, s, "buyer@example.com")

	w := call(t, s, "POST", "/api/sponsors/webhook", []byte(`{"type":"subscription.active"}`), map[string]string{
		"webhook-id": "msg_x", "webhook-timestamp": strconv.FormatInt(time.Now().Unix(), 10), "webhook-signature": "v1,AAAA",
	})
	if w.Code != 401 {
		t.Fatalf("forged webhook: %d, want 401", w.Code)
	}

	// Another product sold from the same Dodo account must not touch sponsor slots.
	if w := sendWebhook(t, s, id, "sub_other", "active", "pdt_something_else"); w.Code != 200 {
		t.Fatalf("other product webhook: %d", w.Code)
	}
	var admin contracts.SponsorAdminResponse
	json.Unmarshal(call(t, s, "GET", "/api/sponsors/admin", nil, adminAuth).Body.Bytes(), &admin)
	if len(admin.Sponsors) != 1 || admin.Sponsors[0].Status != "checkout" {
		t.Fatalf("listing changed by another product's webhook: %+v", admin.Sponsors)
	}
}

func TestSponsorAdminRequiresToken(t *testing.T) {
	s, _ := newSponsorServer(t, 2)
	if w := call(t, s, "GET", "/api/sponsors/admin", nil, nil); w.Code != 401 {
		t.Fatalf("no token: %d, want 401", w.Code)
	}
	if w := call(t, s, "GET", "/api/sponsors/admin", nil, map[string]string{"Authorization": "Bearer wrong"}); w.Code != 401 {
		t.Fatalf("wrong token: %d, want 401", w.Code)
	}
	t.Setenv("SPONSOR_ADMIN_TOKEN", "")
	if w := call(t, s, "GET", "/api/sponsors/admin", nil, map[string]string{"Authorization": "Bearer "}); w.Code != 404 {
		t.Fatalf("admin with no token configured: %d, want 404", w.Code)
	}
}
