import type { SourceDto } from "@iappstores/contracts";

export type SourceDefinition = {
  id: string;
  name: string;
  subtitle: string | null;
  url: string;
  website: string | null;
  kind?: "altstore" | "github-tree";
  treeFile?: string;
};

export const SOURCES: SourceDefinition[] = [
  {
    id: "fastsign-altstore",
    name: "FastSign Full",
    subtitle: "Full AltStore and SideStore compatible FastSign repository",
    url: "https://fastsign.dev/repo.json",
    website: "https://fastsign.dev"
  },
  {
    id: "crystall1ne",
    name: "crystall1ne.dev",
    subtitle: "Validated AltStore-compatible source",
    url: "https://alt.crystall1ne.dev/",
    website: "https://alt.crystall1ne.dev"
  },
  {
    id: "ignited",
    name: "Ignited Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://altstore.ignitedemulator.com/",
    website: "https://altstore.ignitedemulator.com"
  },
  {
    id: "oatmealdome",
    name: "OatmealDome's AltStore Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://altstore.oatmealdome.me/",
    website: "https://altstore.oatmealdome.me"
  },
  {
    id: "sidelix",
    name: "Sidelix App Store",
    subtitle: "Validated AltStore-compatible source",
    url: "https://apps.nabzclan.vip/repos/altstore.php",
    website: "https://apps.nabzclan.vip"
  },
  {
    id: "sidestore-official",
    name: "SideStore Official",
    subtitle: "Validated AltStore-compatible source",
    url: "https://apps.sidestore.io/",
    website: "https://apps.sidestore.io"
  },
  {
    id: "appmarket",
    name: "AppMarket AltStore",
    subtitle: "Validated AltStore-compatible source",
    url: "https://appmarket.tech/altstore.json",
    website: "https://appmarket.tech"
  },
  {
    id: "azu0609",
    name: "azu0609's Alt Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://azu0609.github.io/repo/altstore_repo.json",
    website: "https://azu0609.github.io"
  },
  {
    id: "altstore-complete",
    name: "AltStore Complete",
    subtitle: "Validated AltStore-compatible source",
    url: "https://quarksources.github.io/altstore-complete.json",
    website: "https://quarksources.github.io"
  },
  {
    id: "burrito",
    name: "Burrito's AltStore",
    subtitle: "Validated AltStore-compatible source",
    url: "https://website.burrito.software/altstore/channels/burritosource.json",
    website: "https://website.burrito.software"
  },
  {
    id: "sidestore-community",
    name: "SideStore Team Picks",
    subtitle: "Validated AltStore-compatible source",
    url: "https://community-apps.sidestore.io/sidecommunity.json",
    website: "https://community-apps.sidestore.io"
  },
  {
    id: "sidestore-connect",
    name: "SideStore Connect",
    subtitle: "Validated AltStore-compatible source",
    url: "https://connect.sidestore.io/apps.json",
    website: "https://connect.sidestore.io"
  },
  {
    id: "driftywinds-esign",
    name: "driftywinds' ESign Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://driftywinds.github.io/repos/esign.json",
    website: "https://driftywinds.github.io"
  },
  {
    id: "esign-yyyue",
    name: "ESign yyyue",
    subtitle: "Validated AltStore-compatible source",
    url: "https://esign.yyyue.xyz/app.json",
    website: "https://esign.yyyue.xyz"
  },
  {
    id: "flycast",
    name: "Flyinghead",
    subtitle: "Validated AltStore-compatible source",
    url: "https://flyinghead.github.io/flycast-builds/altstore.json",
    website: "https://flyinghead.github.io"
  },
  {
    id: "dans-workshop",
    name: "Dan's Workshop",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/dvntm0/AltStore/refs/heads/main/feather.json",
    website: "https://github.com/dvntm0/AltStore"
  },
  {
    id: "feather",
    name: "Feather Repository",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/khcrysalis/Feather/refs/heads/main/app-repo.json",
    website: "https://github.com/khcrysalis/Feather"
  },
  {
    id: "hottub",
    name: "Hot Tub",
    subtitle: "Validated AltStore-compatible source",
    url: "https://hottubapp.io/altstore",
    website: "https://hottubapp.io"
  },
  {
    id: "cypwn",
    name: "CyPwn IPA Library",
    subtitle: "Validated AltStore-compatible source",
    url: "https://ipa.cypwn.xyz/cypwn.json",
    website: "https://ipa.cypwn.xyz"
  },
  {
    id: "cypwn-trollstore",
    name: "CyPwn TrollStore Library",
    subtitle: "Validated AltStore-compatible source",
    url: "https://ipa.cypwn.xyz/cypwn_ts.json",
    website: "https://ipa.cypwn.xyz"
  },
  {
    id: "ttjb",
    name: "TTJB IPA Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://ipa.thuthuatjb.com/repo/",
    website: "https://ipa.thuthuatjb.com"
  },
  {
    id: "ish",
    name: "iSH",
    subtitle: "Validated AltStore-compatible source",
    url: "https://ish.app/altstore.json",
    website: "https://ish.app"
  },
  {
    id: "ittza7aa",
    name: "Ittz A7aa VIP",
    subtitle: "Validated AltStore-compatible source",
    url: "https://ittza7aa.com/repo.json",
    website: "https://ittza7aa.com"
  },
  {
    id: "pokemmo",
    name: "PokeMMO",
    subtitle: "Validated AltStore-compatible source",
    url: "https://pokemmo.com/altstore/",
    website: "https://pokemmo.com"
  },
  {
    id: "qnblackcat",
    name: "Qn_'s AltStore Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/qnblackcat/AltStore/gh-pages/apps.json",
    website: "https://github.com/qnblackcat/AltStore"
  },
  {
    id: "qingsongqian",
    name: "Qingsongqian Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://qingsongqian.github.io/all.html",
    website: "https://qingsongqian.github.io"
  },
  {
    id: "quantumsource-plus",
    name: "Quantum Source++",
    subtitle: "Validated AltStore-compatible source",
    url: "https://quarksources.github.io/quantumsource++.json",
    website: "https://quarksources.github.io"
  },
  {
    id: "quantumsource",
    name: "Quantum Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://quarksources.github.io/quantumsource.json",
    website: "https://quarksources.github.io"
  },
  {
    id: "randomsource",
    name: "RandomSource",
    subtitle: "Validated AltStore-compatible source",
    url: "https://randomblock1.com/altstore/apps.json",
    website: "https://randomblock1.com"
  },
  {
    id: "ytliteplus",
    name: "YTLitePlus",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/Balackburn/YTLitePlusAltstore/main/apps.json",
    website: "https://github.com/Balackburn/YTLitePlusAltstore"
  },
  {
    id: "omni",
    name: "Omni-Development IPA Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/Omni-Development/The-Omni-Repository/refs/heads/main/app-repo.json",
    website: "https://github.com/Omni-Development/The-Omni-Repository"
  },
  {
    id: "celestial",
    name: "Celestial iOS Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/RealBlackAstronaut/CelestialRepo/main/CelestialRepo.json",
    website: "https://github.com/RealBlackAstronaut/CelestialRepo"
  },
  {
    id: "chromium-ios",
    name: "Chromium for iOS",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/TheNightmanCodeth/chromium-ios/master/altstore-source.json",
    website: "https://github.com/TheNightmanCodeth/chromium-ios"
  },
  {
    id: "wsf",
    name: "WSF Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/WhySooooFurious/Ultimate-Sideloading-Guide/refs/heads/main/app-repo.json",
    website: "https://github.com/WhySooooFurious/Ultimate-Sideloading-Guide"
  },
  {
    id: "system-apps",
    name: "Accessible System Apps",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/YourName028/System-Apps/main/repo.json",
    website: "https://github.com/YourName028/System-Apps"
  },
  {
    id: "neofreebird",
    name: "NeoFreeBird",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/actuallyaridan/NeoFreeBird/refs/heads/main/AltSource.json",
    website: "https://github.com/actuallyaridan/NeoFreeBird"
  },
  {
    id: "driftywinds-altstore",
    name: "driftywinds' AltStore Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/driftywinds/driftywinds.github.io/master/AltStore/apps.json",
    website: "https://github.com/driftywinds/driftywinds.github.io"
  },
  {
    id: "samhub",
    name: "SamHub Apps",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/jay-goobuh/samhub/main/apps",
    website: "https://github.com/jay-goobuh/samhub"
  },
  {
    id: "lo-cafe",
    name: "lo.cafe Repository",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/lo-cafe/winston-altstore/main/apps.json",
    website: "https://github.com/lo-cafe/winston-altstore"
  },
  {
    id: "neoncat",
    name: "Neoncat-OG IPA Library",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/Neoncat-OG/TrollStore-IPAs/main/apps_esign.json",
    website: "https://github.com/Neoncat-OG/TrollStore-IPAs"
  },
  {
    id: "riftys",
    name: "Riftys Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/notrifty1/riftysrepo/refs/heads/main/reposource.json",
    website: "https://github.com/notrifty1/riftysrepo"
  },
  {
    id: "swaggyp36000",
    name: "swaggyP36000 IPA Library",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/swaggyP36000/TrollStore-IPAs/main/apps_esign.json",
    website: "https://github.com/swaggyP36000/TrollStore-IPAs"
  },
  {
    id: "altstorerus",
    name: "Panda App Ru++",
    subtitle: "Validated AltStore-compatible source",
    url: "https://raw.githubusercontent.com/vizunchik/AltStoreRus/master/apps.json",
    website: "https://github.com/vizunchik/AltStoreRus"
  },
  {
    id: "madari",
    name: "Madari Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://repo.madari.media/nightly/repo.json",
    website: "https://repo.madari.media"
  },
  {
    id: "ucerts",
    name: "UCerts Apps",
    subtitle: "Validated AltStore-compatible source",
    url: "https://repo.ucerts.io/",
    website: "https://repo.ucerts.io"
  },
  {
    id: "apptesters",
    name: "AppTesters IPA Repo",
    subtitle: "Validated AltStore-compatible source",
    url: "https://repository.apptesters.org/",
    website: "https://repository.apptesters.org"
  },
  {
    id: "spotcompiled",
    name: "SpotCompiled",
    subtitle: "Validated AltStore-compatible source",
    url: "https://spotc-repo.yodaluca.dev/AltStore%20Repo.json",
    website: "https://spotc-repo.yodaluca.dev"
  },
  {
    id: "taurine",
    name: "Taurine",
    subtitle: "Validated AltStore-compatible source",
    url: "https://taurine.app/altstore/taurinestore.json",
    website: "https://taurine.app"
  },
  {
    id: "odyssey",
    name: "Odyssey",
    subtitle: "Validated AltStore-compatible source",
    url: "https://theodyssey.dev/altstore/odysseysource.json",
    website: "https://theodyssey.dev"
  },
  {
    id: "foxster",
    name: "Foxster's AltSource",
    subtitle: "Validated AltStore-compatible source",
    url: "https://therealfoxster.github.io/altsource/apps.json",
    website: "https://therealfoxster.github.io"
  },
  {
    id: "appybois-archive",
    name: "Appy Bois",
    subtitle: "Validated archived AltStore-compatible source",
    url: "https://web.archive.org/web/20210225095501if_/https://appybois.com/",
    website: "https://web.archive.org"
  },
  {
    id: "realmzer-archive",
    name: "Realmzer iOS Repository",
    subtitle: "Validated archived AltStore-compatible source",
    url: "https://web.archive.org/web/20250310010244if_/https://repo.realmzer.xyz/",
    website: "https://web.archive.org"
  },
  {
    id: "wuxu-plus",
    name: "WuXu's Library++",
    subtitle: "Validated AltStore-compatible source",
    url: "https://wuxu1.github.io/wuxu-complete-plus.json",
    website: "https://wuxu1.github.io"
  },
  {
    id: "wuxu",
    name: "WuXu's Library",
    subtitle: "Validated AltStore-compatible source",
    url: "https://wuxu1.github.io/wuxu-complete.json",
    website: "https://wuxu1.github.io"
  },
  {
    id: "itorrent",
    name: "iTorrent Source",
    subtitle: "Validated AltStore-compatible source",
    url: "https://xitrix.github.io/iTorrent/AltStore.json",
    website: "https://xitrix.github.io"
  },
  {
    id: "json-ipa-repos",
    name: "JSON IPA Repos",
    subtitle: "Aggregated AltStore-compatible JSON repositories",
    url: "https://api.github.com/repos/j3qq4h7h2v/json-ipa-repos/git/trees/main",
    website: "https://github.com/j3qq4h7h2v/json-ipa-repos",
    kind: "github-tree",
    treeFile: "json-ipa-repos.json"
  }
];

export function findSource(sourceId: string): SourceDefinition | undefined {
  return SOURCES.find((source) => source.id === sourceId);
}

export function sourceToDto(source: SourceDefinition, appCount?: number): SourceDto {
  return {
    id: source.id,
    name: source.name,
    subtitle: source.subtitle,
    url: source.url,
    website: source.website,
    ...(typeof appCount === "number" ? { appCount } : {})
  };
}
