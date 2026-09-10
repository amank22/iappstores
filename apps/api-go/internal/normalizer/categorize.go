package normalizer

import (
	"regexp"
	"strings"

	"github.com/iappstores/api-go/internal/contracts"
)

// categoryRule is one step of the ordered regex cascade from normalizer.ts's
// categorizeApp. Order matters: the first matching rule wins, so e.g. an app whose text
// matches both "emulator" and "game" regexes is categorized as an emulator (checked first).
type categoryRule struct {
	pattern  *regexp.Regexp
	category contracts.DerivedAppCategory
}

var categoryRules = []categoryRule{
	{regexp.MustCompile(`(?i)\b(emulator|emulators|retroarch|delta|provenance|ppsspp|folium|gba|gbc|snes|nes|nintendo|playstation|psp|roms?)\b`), contracts.CategoryEmulators},
	{regexp.MustCompile(`(?i)\b(game|games|gaming|arcade|minecraft|pokemon|controller|puzzle|racing)\b`), contracts.CategoryGames},
	{regexp.MustCompile(`(?i)\b(discord|instagram|reddit|telegram|whatsapp|tiktok|social|chat|messenger|mastodon|bluesky)\b`), contracts.CategorySocial},
	{regexp.MustCompile(`(?i)\b(music|audio|podcast|sound|radio|spotify|piano|guitar|lyrics)\b`), contracts.CategoryMusic},
	{regexp.MustCompile(`(?i)\b(video|photo|camera|movie|stream|youtube|twitch|recorder|editor|cinema)\b`), contracts.CategoryPhotoVideo},
	{regexp.MustCompile(`(?i)\b(media|anime|tv|television|entertainment|player)\b`), contracts.CategoryMedia},
	{regexp.MustCompile(`(?i)\b(learn|learning|education|school|language|math|course|study)\b`), contracts.CategoryEducation},
	{regexp.MustCompile(`(?i)\b(book|books|manga|comic|reader|novel|pdf|ebook|library)\b`), contracts.CategoryBooks},
	{regexp.MustCompile(`(?i)\b(code|coding|developer|terminal|ssh|git|api|json|script|console|debug)\b`), contracts.CategoryDeveloper},
	{regexp.MustCompile(`(?i)\b(note|notes|calendar|todo|task|document|office|scan|scanner|mail|email|productivity)\b`), contracts.CategoryProductivity},
	{regexp.MustCompile(`(?i)\b(vpn|file|files|manager|sign|signing|utility|utilities|system|keyboard|adblock|dns|browser|backup|cleaner|settings|shortcut)\b`), contracts.CategoryUtilities},
	{regexp.MustCompile(`(?i)\b(fitness|health|weather|travel|food|shopping|finance|wallet|lifestyle|sleep|habit)\b`), contracts.CategoryLifestyle},
}

// categorizeApp ports categorizeApp() from normalizer.ts exactly, including field order
// (name, bundleIdentifier, developerName, subtitle, localizedDescription, description)
// and the final "tools" catch-all.
func categorizeApp(app anyMap) contracts.DerivedAppCategory {
	parts := []string{}
	for _, key := range []string{"name", "bundleIdentifier", "developerName", "subtitle", "localizedDescription", "description"} {
		if v, ok := app[key]; ok {
			if s, ok := v.(string); ok && s != "" {
				parts = append(parts, s)
			}
		}
	}
	text := strings.ToLower(strings.Join(parts, " "))

	for _, rule := range categoryRules {
		if rule.pattern.MatchString(text) {
			return rule.category
		}
	}

	return contracts.CategoryTools
}

// RecategorizeApps reruns categorizeApp against each app's already-normalized fields
// (mirrors recategorizeApps(), used when hydrating apps read back from the SQLite
// source-cache, whose category may have been computed by an older ruleset).
func RecategorizeApps(apps []contracts.AppDto) []contracts.AppDto {
	out := make([]contracts.AppDto, len(apps))
	for i, app := range apps {
		m := anyMap{
			"name":                 app.Name,
			"bundleIdentifier":     derefStr(app.BundleIdentifier),
			"developerName":        derefStr(app.DeveloperName),
			"subtitle":             derefStr(app.Subtitle),
			"localizedDescription": derefStr(app.Description),
		}
		app.Category = categorizeApp(m)
		out[i] = app
	}
	return out
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
