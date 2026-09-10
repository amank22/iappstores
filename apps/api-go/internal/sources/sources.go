// Package sources holds the static list of 56 third-party AltStore-compatible
// repositories this service aggregates, mirroring apps/api/src/sources.ts.
package sources

import (
	_ "embed"

	"github.com/iappstores/api-go/internal/contracts"
)

//go:embed data/json-ipa-repos.json
var jsonIpaReposTreeFile []byte

// SourceKind distinguishes plain AltStore JSON repos from GitHub-tree aggregator sources.
type SourceKind string

const (
	KindAltStore   SourceKind = "altstore"
	KindGithubTree SourceKind = "github-tree"
)

type SourceDefinition struct {
	ID       string
	Name     string
	Subtitle *string
	URL      string
	Website  *string
	Kind     SourceKind
	TreeFile string
}

func strp(s string) *string { return &s }

var Sources = []SourceDefinition{
	{ID: "fastsign-altstore", Name: "FastSign Full", Subtitle: strp("Full AltStore and SideStore compatible FastSign repository"), URL: "https://fastsign.dev/repo.json", Website: strp("https://fastsign.dev"), Kind: KindAltStore, TreeFile: ""},
	{ID: "crystall1ne", Name: "crystall1ne.dev", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://alt.crystall1ne.dev/", Website: strp("https://alt.crystall1ne.dev"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ignited", Name: "Ignited Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://altstore.ignitedemulator.com/", Website: strp("https://altstore.ignitedemulator.com"), Kind: KindAltStore, TreeFile: ""},
	{ID: "oatmealdome", Name: "OatmealDome's AltStore Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://altstore.oatmealdome.me/", Website: strp("https://altstore.oatmealdome.me"), Kind: KindAltStore, TreeFile: ""},
	{ID: "sidelix", Name: "Sidelix App Store", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://apps.sidelix.vip/repos/altstore.php", Website: strp("https://apps.nabzclan.vip"), Kind: KindAltStore, TreeFile: ""},
	{ID: "sidestore-official", Name: "SideStore Official", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://apps.sidestore.io/", Website: strp("https://apps.sidestore.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "appmarket", Name: "AppMarket AltStore", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://appmarket.tech/altstore.json", Website: strp("https://appmarket.tech"), Kind: KindAltStore, TreeFile: ""},
	{ID: "azu0609", Name: "azu0609's Alt Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://azu0609.github.io/repo/altstore_repo.json", Website: strp("https://azu0609.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "altstore-complete", Name: "AltStore Complete", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://quarksources.github.io/altstore-complete.json", Website: strp("https://quarksources.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "burrito", Name: "Burrito's AltStore", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://website.burrito.software/altstore/channels/burritosource.json", Website: strp("https://website.burrito.software"), Kind: KindAltStore, TreeFile: ""},
	{ID: "sidestore-community", Name: "SideStore Team Picks", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://community-apps.sidestore.io/sidecommunity.json", Website: strp("https://community-apps.sidestore.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "sidestore-connect", Name: "SideStore Connect", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://connect.sidestore.io/apps.json", Website: strp("https://connect.sidestore.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "driftywinds-esign", Name: "driftywinds' ESign Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://driftywinds.github.io/repos/esign.json", Website: strp("https://driftywinds.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "esign-yyyue", Name: "ESign yyyue", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://esign.yyyue.xyz/app.json", Website: strp("https://esign.yyyue.xyz"), Kind: KindAltStore, TreeFile: ""},
	{ID: "flycast", Name: "Flyinghead", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://flyinghead.github.io/flycast-builds/altstore.json", Website: strp("https://flyinghead.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "dans-workshop", Name: "Dan's Workshop", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/dvntm0/AltStore/refs/heads/main/feather.json", Website: strp("https://github.com/dvntm0/AltStore"), Kind: KindAltStore, TreeFile: ""},
	{ID: "feather", Name: "Feather Repository", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/khcrysalis/Feather/refs/heads/main/app-repo.json", Website: strp("https://github.com/khcrysalis/Feather"), Kind: KindAltStore, TreeFile: ""},
	{ID: "hottub", Name: "Hot Tub", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://hottubapp.io/altstore", Website: strp("https://hottubapp.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "cypwn", Name: "CyPwn IPA Library", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://ipa.cypwn.xyz/cypwn.json", Website: strp("https://ipa.cypwn.xyz"), Kind: KindAltStore, TreeFile: ""},
	{ID: "cypwn-trollstore", Name: "CyPwn TrollStore Library", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://ipa.cypwn.xyz/cypwn_ts.json", Website: strp("https://ipa.cypwn.xyz"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ttjb", Name: "TTJB IPA Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://ipa.thuthuatjb.com/repo/", Website: strp("https://ipa.thuthuatjb.com"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ish", Name: "iSH", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://ish.app/altstore.json", Website: strp("https://ish.app"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ittza7aa", Name: "Ittz A7aa VIP", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://ittza7aa.com/repo.json", Website: strp("https://ittza7aa.com"), Kind: KindAltStore, TreeFile: ""},
	{ID: "pokemmo", Name: "PokeMMO", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://pokemmo.com/altstore/", Website: strp("https://pokemmo.com"), Kind: KindAltStore, TreeFile: ""},
	{ID: "qnblackcat", Name: "Qn_'s AltStore Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/qnblackcat/AltStore/gh-pages/apps.json", Website: strp("https://github.com/qnblackcat/AltStore"), Kind: KindAltStore, TreeFile: ""},
	{ID: "qingsongqian", Name: "Qingsongqian Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://qingsongqian.github.io/all.html", Website: strp("https://qingsongqian.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "quantumsource-plus", Name: "Quantum Source++", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://quarksources.github.io/quantumsource++.json", Website: strp("https://quarksources.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "quantumsource", Name: "Quantum Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://quarksources.github.io/quantumsource.json", Website: strp("https://quarksources.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "randomsource", Name: "RandomSource", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://randomblock1.com/altstore/apps.json", Website: strp("https://randomblock1.com"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ytliteplus", Name: "YTLitePlus", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/Balackburn/YTLitePlusAltstore/main/apps.json", Website: strp("https://github.com/Balackburn/YTLitePlusAltstore"), Kind: KindAltStore, TreeFile: ""},
	{ID: "omni", Name: "Omni-Development IPA Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/Omni-Development/The-Omni-Repository/refs/heads/main/app-repo.json", Website: strp("https://github.com/Omni-Development/The-Omni-Repository"), Kind: KindAltStore, TreeFile: ""},
	{ID: "celestial", Name: "Celestial iOS Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/RealBlackAstronaut/CelestialRepo/main/CelestialRepo.json", Website: strp("https://github.com/RealBlackAstronaut/CelestialRepo"), Kind: KindAltStore, TreeFile: ""},
	{ID: "chromium-ios", Name: "Chromium for iOS", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/TheNightmanCodeth/chromium-ios/master/altstore-source.json", Website: strp("https://github.com/TheNightmanCodeth/chromium-ios"), Kind: KindAltStore, TreeFile: ""},
	{ID: "wsf", Name: "WSF Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/WhySooooFurious/Ultimate-Sideloading-Guide/refs/heads/main/app-repo.json", Website: strp("https://github.com/WhySooooFurious/Ultimate-Sideloading-Guide"), Kind: KindAltStore, TreeFile: ""},
	{ID: "system-apps", Name: "Accessible System Apps", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/YourName028/System-Apps/main/repo.json", Website: strp("https://github.com/YourName028/System-Apps"), Kind: KindAltStore, TreeFile: ""},
	{ID: "neofreebird", Name: "NeoFreeBird", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/actuallyaridan/NeoFreeBird/refs/heads/main/AltSource.json", Website: strp("https://github.com/actuallyaridan/NeoFreeBird"), Kind: KindAltStore, TreeFile: ""},
	{ID: "driftywinds-altstore", Name: "driftywinds' AltStore Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/driftywinds/driftywinds.github.io/master/AltStore/apps.json", Website: strp("https://github.com/driftywinds/driftywinds.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "samhub", Name: "SamHub Apps", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/jay-goobuh/samhub/main/apps", Website: strp("https://github.com/jay-goobuh/samhub"), Kind: KindAltStore, TreeFile: ""},
	{ID: "lo-cafe", Name: "lo.cafe Repository", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/lo-cafe/winston-altstore/main/apps.json", Website: strp("https://github.com/lo-cafe/winston-altstore"), Kind: KindAltStore, TreeFile: ""},
	{ID: "neoncat", Name: "Neoncat-OG IPA Library", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/Neoncat-OG/TrollStore-IPAs/main/apps_esign.json", Website: strp("https://github.com/Neoncat-OG/TrollStore-IPAs"), Kind: KindAltStore, TreeFile: ""},
	{ID: "riftys", Name: "Riftys Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/notrifty1/riftysrepo/refs/heads/main/reposource.json", Website: strp("https://github.com/notrifty1/riftysrepo"), Kind: KindAltStore, TreeFile: ""},
	{ID: "swaggyp36000", Name: "swaggyP36000 IPA Library", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/swaggyP36000/TrollStore-IPAs/main/apps_esign.json", Website: strp("https://github.com/swaggyP36000/TrollStore-IPAs"), Kind: KindAltStore, TreeFile: ""},
	{ID: "altstorerus", Name: "Panda App Ru++", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://raw.githubusercontent.com/vizunchik/AltStoreRus/master/apps.json", Website: strp("https://github.com/vizunchik/AltStoreRus"), Kind: KindAltStore, TreeFile: ""},
	{ID: "madari", Name: "Madari Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://repo.madari.media/nightly/repo.json", Website: strp("https://repo.madari.media"), Kind: KindAltStore, TreeFile: ""},
	{ID: "ucerts", Name: "UCerts Apps", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://repo.ucerts.io/", Website: strp("https://repo.ucerts.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "apptesters", Name: "AppTesters IPA Repo", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://repository.apptesters.org/", Website: strp("https://repository.apptesters.org"), Kind: KindAltStore, TreeFile: ""},
	{ID: "spotcompiled", Name: "SpotCompiled", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://spotc-repo.yodaluca.dev/AltStore%20Repo.json", Website: strp("https://spotc-repo.yodaluca.dev"), Kind: KindAltStore, TreeFile: ""},
	{ID: "taurine", Name: "Taurine", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://taurine.app/altstore/taurinestore.json", Website: strp("https://taurine.app"), Kind: KindAltStore, TreeFile: ""},
	{ID: "odyssey", Name: "Odyssey", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://theodyssey.dev/altstore/odysseysource.json", Website: strp("https://theodyssey.dev"), Kind: KindAltStore, TreeFile: ""},
	{ID: "foxster", Name: "Foxster's AltSource", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://therealfoxster.github.io/altsource/apps.json", Website: strp("https://therealfoxster.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "appybois-archive", Name: "Appy Bois", Subtitle: strp("Validated archived AltStore-compatible source"), URL: "https://web.archive.org/web/20210225095501if_/https://appybois.com/", Website: strp("https://web.archive.org"), Kind: KindAltStore, TreeFile: ""},
	{ID: "realmzer-archive", Name: "Realmzer iOS Repository", Subtitle: strp("Validated archived AltStore-compatible source"), URL: "https://web.archive.org/web/20250310010244if_/https://repo.realmzer.xyz/", Website: strp("https://web.archive.org"), Kind: KindAltStore, TreeFile: ""},
	{ID: "wuxu-plus", Name: "WuXu's Library++", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://wuxu1.github.io/wuxu-complete-plus.json", Website: strp("https://wuxu1.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "wuxu", Name: "WuXu's Library", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://wuxu1.github.io/wuxu-complete.json", Website: strp("https://wuxu1.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "itorrent", Name: "iTorrent Source", Subtitle: strp("Validated AltStore-compatible source"), URL: "https://xitrix.github.io/iTorrent/AltStore.json", Website: strp("https://xitrix.github.io"), Kind: KindAltStore, TreeFile: ""},
	{ID: "json-ipa-repos", Name: "JSON IPA Repos", Subtitle: strp("Aggregated AltStore-compatible JSON repositories"), URL: "https://api.github.com/repos/j3qq4h7h2v/json-ipa-repos/git/trees/main", Website: strp("https://github.com/j3qq4h7h2v/json-ipa-repos"), Kind: KindGithubTree, TreeFile: "json-ipa-repos.json"},
}

// FindSource looks up a source definition by id.
func FindSource(id string) (SourceDefinition, bool) {
	for _, s := range Sources {
		if s.ID == id {
			return s, true
		}
	}
	return SourceDefinition{}, false
}

// ToDto converts a SourceDefinition to the wire SourceDto. appCount is a pointer so the
// "appCount" key is omitted entirely when nil, matching the zod `.optional()` field.
func ToDto(s SourceDefinition, appCount *int) contracts.SourceDto {
	return contracts.SourceDto{
		ID:       s.ID,
		Name:     s.Name,
		Subtitle: s.Subtitle,
		URL:      s.URL,
		Website:  s.Website,
		AppCount: appCount,
	}
}

// TreeFileContent returns the embedded contents of a static GitHub-tree JSON file
// (used by the json-ipa-repos aggregator source instead of a live GitHub API fetch).
func TreeFileContent(name string) ([]byte, bool) {
	if name == "json-ipa-repos.json" {
		return jsonIpaReposTreeFile, true
	}
	return nil, false
}
