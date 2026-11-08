package normalizer

import (
	"regexp"
	"sync"

	"golang.org/x/text/collate"
	"golang.org/x/text/language"
)

// JS's String.prototype.localeCompare is locale-aware Unicode collation, not a byte
// compare -- a naive strings.Compare would reorder accented/non-Latin app names
// (e.g. sorting "Ä" far away from "A"). golang.org/x/text/collate gives us the same kind
// of tailored Unicode Collation Algorithm ordering.
//
//   - BaseCompare mirrors `localeCompare(other, undefined, { sensitivity: "base" })`:
//     case- and accent/diacritic-insensitive (used by sortApps' name-asc/name-desc).
//   - DefaultCompare mirrors a bare `localeCompare(other)` call (default "variant"
//     sensitivity: case- and accent-sensitive, but still locale-tailored ordering) --
//     used for every other localeCompare call site (grouped-app tie-break, download
//     option/source-name ordering, id tie-break).
//
// A *collate.Collator keeps scratch buffers and is not safe for concurrent use. A single
// shared collator behind a mutex made every sort on every request queue on one lock, so
// each goroutine borrows its own collator from a pool instead.
var (
	baseCollators = sync.Pool{New: func() any {
		return collate.New(language.Und, collate.IgnoreCase, collate.IgnoreDiacritics, collate.IgnoreWidth)
	}}
	defaultCollators = sync.Pool{New: func() any { return collate.New(language.Und) }}
)

func BaseCompare(a, b string) int {
	c := baseCollators.Get().(*collate.Collator)
	defer baseCollators.Put(c)
	return c.CompareString(a, b)
}

func DefaultCompare(a, b string) int {
	c := defaultCollators.Get().(*collate.Collator)
	defer defaultCollators.Put(c)
	return c.CompareString(a, b)
}

// collationKeys returns one sort key per string such that bytes.Compare on two keys
// orders them exactly as Compare on the strings would. Sorting by precomputed keys
// avoids running the collation algorithm O(n log n) times.
func collationKeys(pool *sync.Pool, values []string) [][]byte {
	c := pool.Get().(*collate.Collator)
	defer pool.Put(c)
	var buf collate.Buffer
	keys := make([][]byte, len(values))
	for i, v := range values {
		k := c.KeyFromString(&buf, v)
		keys[i] = append([]byte(nil), k...)
		buf.Reset()
	}
	return keys
}

func regexpMustCompileIosVersion() *regexp.Regexp {
	return regexp.MustCompile(`\d+(?:\.\d+){0,2}`)
}
