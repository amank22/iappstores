package normalizer

import (
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type anyMap = map[string]interface{}

func isRecord(v interface{}) (anyMap, bool) {
	m, ok := v.(anyMap)
	return m, ok
}

// asString mirrors asString(): trims, requires non-empty, returns nil otherwise.
func asString(v interface{}) *string {
	s, ok := v.(string)
	if !ok {
		return nil
	}
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func asStringVal(v interface{}) string {
	if p := asString(v); p != nil {
		return *p
	}
	return ""
}

// asNumber mirrors asNumber(): accepts a non-negative finite number (JSON numbers decode
// to float64) or a numeric string, truncating toward zero.
func asNumber(v interface{}) *int64 {
	switch t := v.(type) {
	case float64:
		if t >= 0 {
			n := int64(t)
			return &n
		}
	case string:
		trimmed := strings.TrimSpace(t)
		if trimmed == "" {
			return nil
		}
		if f, err := strconv.ParseFloat(trimmed, 64); err == nil && f >= 0 {
			n := int64(f)
			return &n
		}
	}
	return nil
}

// asURL mirrors asUrl(): must parse as an absolute URL (JS `new URL(text)` throws for
// anything without a scheme+host); returns the normalized string form.
func asURL(v interface{}) *string {
	text := asString(v)
	if text == nil {
		return nil
	}
	u, err := url.Parse(*text)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return nil
	}
	out := u.String()
	return &out
}

// firstNonNil returns the first non-nil value among candidates, mirroring JS's `a ?? b ?? c`.
func firstNonNil(candidates ...interface{}) interface{} {
	for _, c := range candidates {
		if c == nil {
			continue
		}
		if s, ok := c.(string); ok && s == "" {
			continue
		}
		return c
	}
	return nil
}

func pickAppStoreURL(app anyMap) *string {
	return asURL(firstNonNil(
		app["appStoreURL"], app["appStoreUrl"], app["appstoreURL"], app["appstoreUrl"],
		app["storeURL"], app["storeUrl"], app["itunesURL"], app["itunesUrl"],
		app["marketplaceURL"], app["marketplaceUrl"],
	))
}

func asURLArray(v interface{}) []string {
	arr, ok := v.([]interface{})
	if !ok {
		return []string{}
	}
	out := []string{}
	for _, item := range arr {
		if s, ok := item.(string); ok {
			if u := asURL(s); u != nil {
				out = append(out, *u)
			}
			continue
		}
		if m, ok := isRecord(item); ok {
			if u := asURL(firstNonNil(m["url"], m["imageURL"], m["imageUrl"])); u != nil {
				out = append(out, *u)
			}
		}
	}
	return out
}

var slugifyNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)
var slugifyTrim = regexp.MustCompile(`(^-|-$)`)

func slugify(value string) string {
	s := strings.ToLower(value)
	s = slugifyNonAlnum.ReplaceAllString(s, "-")
	s = slugifyTrim.ReplaceAllString(s, "")
	return s
}
