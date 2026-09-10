// query.go replicates the exact coercion rules of the zod query schemas in
// packages/contracts/src/index.ts's QueryStringSchema / QueryPositiveIntegerSchema /
// QueryBooleanSchema / IosVersionQuerySchema helpers, since net/http's url.Values gives
// us the raw ?a=1&a=2 multi-value semantics zod's preprocessors were written against.
package httpapi

import (
	"errors"
	"fmt"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// queryString mirrors QueryStringSchema: array values take [0] (Express's qs library
// parses repeated ?a=1&a=2 into an array); a string is trimmed and must be non-empty.
func queryString(values url.Values, key string) (string, bool) {
	v := firstQueryValue(values, key)
	if v == nil {
		return "", false
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
}

func firstQueryValue(values url.Values, key string) *string {
	vs, ok := values[key]
	if !ok || len(vs) == 0 {
		return nil
	}
	return &vs[0]
}

// queryOptionalString is queryString but returns (nil, nil) instead of failing when the
// param is absent/blank -- mirrors `.optional()` on a QueryStringSchema field.
func queryOptionalString(values url.Values, key string) *string {
	if v, ok := queryString(values, key); ok {
		return &v
	}
	return nil
}

// queryPositiveInt mirrors QueryPositiveIntegerSchema(defaultValue, maxValue): absent/
// empty falls back to defaultValue; otherwise the value must parse as an integer in
// [1, maxValue] or the whole request is invalid.
func queryPositiveInt(values url.Values, key string, defaultValue, maxValue int) (int, error) {
	v := firstQueryValue(values, key)
	if v == nil || strings.TrimSpace(*v) == "" {
		return defaultValue, nil
	}
	f, err := strconv.ParseFloat(strings.TrimSpace(*v), 64)
	if err != nil {
		return 0, fmt.Errorf("%s must be a number", key)
	}
	n := int(f)
	if float64(n) != f || n < 1 || n > maxValue {
		return 0, fmt.Errorf("%s must be an integer between 1 and %d", key, maxValue)
	}
	return n, nil
}

var truthyValues = map[string]bool{"true": true, "1": true, "yes": true}
var falsyValues = map[string]bool{"false": true, "0": true, "no": true}

// queryBool mirrors QueryBooleanSchema(defaultValue): accepts true/false/1/0/yes/no
// case-insensitively (after trimming); absent/empty falls back to defaultValue; anything
// else fails validation (zod's final z.boolean() rejects a non-boolean coercion result).
func queryBool(values url.Values, key string, defaultValue bool) (bool, error) {
	v := firstQueryValue(values, key)
	if v == nil || strings.TrimSpace(*v) == "" {
		return defaultValue, nil
	}
	normalized := strings.ToLower(strings.TrimSpace(*v))
	if truthyValues[normalized] {
		return true, nil
	}
	if falsyValues[normalized] {
		return false, nil
	}
	return false, fmt.Errorf("%s must be a boolean", key)
}

var iosVersionPattern = regexp.MustCompile(`^\d+(?:\.\d+){0,2}$`)

// queryIosVersion mirrors IosVersionQuerySchema: absent/blank -> nil (optional); present
// must match \d+(\.\d+){0,2} exactly or the request is invalid.
func queryIosVersion(values url.Values, key string) (*string, error) {
	v := firstQueryValue(values, key)
	if v == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*v)
	if trimmed == "" {
		return nil, nil
	}
	if !iosVersionPattern.MatchString(trimmed) {
		return nil, errors.New("iosVersion must look like 17, 17.2, or 17.2.1")
	}
	return &trimmed, nil
}

var validCategories = map[string]bool{
	"all": true, "recent": true, "games": true, "emulators": true, "tools": true,
	"productivity": true, "utilities": true, "media": true, "music": true,
	"photo-video": true, "social": true, "education": true, "books": true,
	"developer": true, "lifestyle": true,
}

func queryCategory(values url.Values, key string) (string, error) {
	v := firstQueryValue(values, key)
	if v == nil || strings.TrimSpace(*v) == "" {
		return "all", nil
	}
	val := strings.TrimSpace(*v)
	if !validCategories[val] {
		return "", fmt.Errorf("invalid category %q", val)
	}
	return val, nil
}

var validSorts = map[string]bool{"recent": true, "name-asc": true, "name-desc": true}

func querySort(values url.Values, key string) (string, error) {
	v := firstQueryValue(values, key)
	if v == nil || strings.TrimSpace(*v) == "" {
		return "recent", nil
	}
	val := strings.TrimSpace(*v)
	if !validSorts[val] {
		return "", fmt.Errorf("invalid sort %q", val)
	}
	return val, nil
}

func queryIosOperator(values url.Values, key string) (string, error) {
	v := firstQueryValue(values, key)
	if v == nil || strings.TrimSpace(*v) == "" {
		return "lte", nil
	}
	val := strings.TrimSpace(*v)
	if val != "lte" && val != "gte" {
		return "", fmt.Errorf("invalid iosVersionOperator %q", val)
	}
	return val, nil
}
