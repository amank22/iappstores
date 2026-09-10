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
var (
	baseCollator    = collate.New(language.Und, collate.IgnoreCase, collate.IgnoreDiacritics, collate.IgnoreWidth)
	defaultCollator = collate.New(language.Und)
	collatorMu      sync.Mutex
)

func BaseCompare(a, b string) int {
	collatorMu.Lock()
	defer collatorMu.Unlock()
	return baseCollator.CompareString(a, b)
}

func DefaultCompare(a, b string) int {
	collatorMu.Lock()
	defer collatorMu.Unlock()
	return defaultCollator.CompareString(a, b)
}

func regexpMustCompileIosVersion() *regexp.Regexp {
	return regexp.MustCompile(`\d+(?:\.\d+){0,2}`)
}
