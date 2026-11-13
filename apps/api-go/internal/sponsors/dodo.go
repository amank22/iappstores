package sponsors

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Dodo is a minimal Dodo Payments client: just the two calls sponsor slots need.
type Dodo struct {
	BaseURL string
	APIKey  string
	HTTP    *http.Client
}

// NewDodo returns a client for the live API, or the test API unless live is set.
func NewDodo(apiKey string, live bool) *Dodo {
	base := "https://test.dodopayments.com"
	if live {
		base = "https://live.dodopayments.com"
	}
	return &Dodo{BaseURL: base, APIKey: apiKey, HTTP: &http.Client{Timeout: 15 * time.Second}}
}

func (d *Dodo) do(ctx context.Context, method, path string, body, out interface{}) error {
	payload, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, d.BaseURL+path, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+d.APIKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := d.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("dodo %s %s: status %d: %s", method, path, resp.StatusCode, truncate(string(raw), 300))
	}
	if out == nil {
		return nil
	}
	return json.Unmarshal(raw, out)
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

type CheckoutRequest struct {
	ProductID string
	SponsorID string
	Email     string
	Name      string
	ReturnURL string
}

type CheckoutSession struct {
	SessionID   string `json:"session_id"`
	CheckoutURL string `json:"checkout_url"`
}

// CreateCheckout opens a hosted checkout for the sponsor subscription. The sponsor id
// travels in the metadata, which Dodo copies onto the subscription and its webhooks.
func (d *Dodo) CreateCheckout(ctx context.Context, in CheckoutRequest) (CheckoutSession, error) {
	var out CheckoutSession
	err := d.do(ctx, http.MethodPost, "/checkouts", map[string]interface{}{
		"product_cart": []map[string]interface{}{{"product_id": in.ProductID, "quantity": 1}},
		"customer":     map[string]string{"email": in.Email, "name": in.Name},
		"return_url":   in.ReturnURL,
		"metadata":     map[string]string{"sponsor_id": in.SponsorID},
	}, &out)
	if err == nil && out.CheckoutURL == "" {
		err = errors.New("dodo returned no checkout_url")
	}
	return out, err
}

// CancelSubscription stops a subscription now (used when a listing is rejected or ended
// by an admin). It does not refund; that is done in the Dodo dashboard.
func (d *Dodo) CancelSubscription(ctx context.Context, subscriptionID string) error {
	return d.do(ctx, http.MethodPatch, "/subscriptions/"+subscriptionID, map[string]string{"status": "cancelled"}, nil)
}

// webhookTolerance is how far a webhook's timestamp may be from now (replay protection).
const webhookTolerance = 5 * time.Minute

var ErrBadSignature = errors.New("webhook signature is not valid")

// VerifyWebhook checks a Standard Webhooks signature, the scheme Dodo signs with:
// base64(HMAC-SHA256(key, "<id>.<timestamp>.<body>")), where the key is the base64
// payload of the "whsec_..." secret. The header may carry several "v1,<sig>" entries.
func VerifyWebhook(secret, id, timestamp, signatures string, body []byte, now time.Time) error {
	if secret == "" || id == "" || timestamp == "" || signatures == "" {
		return ErrBadSignature
	}
	seconds, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return ErrBadSignature
	}
	if age := now.Sub(time.Unix(seconds, 0)); age > webhookTolerance || age < -webhookTolerance {
		return ErrBadSignature
	}
	key, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
	if err != nil {
		return ErrBadSignature
	}
	mac := hmac.New(sha256.New, key)
	mac.Write([]byte(id + "." + timestamp + "."))
	mac.Write(body)
	expected := mac.Sum(nil)

	for _, entry := range strings.Fields(signatures) {
		version, encoded, ok := strings.Cut(entry, ",")
		if !ok || version != "v1" {
			continue
		}
		got, err := base64.StdEncoding.DecodeString(encoded)
		if err == nil && hmac.Equal(got, expected) {
			return nil
		}
	}
	return ErrBadSignature
}

// WebhookEvent is the part of a Dodo webhook body the sponsor flow reads.
type WebhookEvent struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Data      struct {
		SubscriptionID  string                 `json:"subscription_id"`
		ProductID       string                 `json:"product_id"`
		Status          string                 `json:"status"`
		NextBillingDate string                 `json:"next_billing_date"`
		Metadata        map[string]interface{} `json:"metadata"`
		Customer        struct {
			CustomerID string `json:"customer_id"`
			Email      string `json:"email"`
		} `json:"customer"`
	} `json:"data"`
}

// ParseTime reads a Dodo timestamp (RFC 3339, with or without a zone). ok is false when
// the value is empty or unreadable.
func ParseTime(value string) (t time.Time, ok bool) {
	for _, layout := range []string{time.RFC3339Nano, "2006-01-02T15:04:05.999999999"} {
		if parsed, err := time.Parse(layout, value); err == nil {
			return parsed, true
		}
	}
	return time.Time{}, false
}
