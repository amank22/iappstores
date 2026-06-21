export type SeoLandingPage = {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  intro: string;
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta: {
    label: string;
    href: string;
  };
  sections: Array<{
    heading: string;
    body: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
  relatedLinks: Array<{
    label: string;
    href: string;
    description: string;
  }>;
};

export const SEO_LANDING_PAGES: SeoLandingPage[] = [
  {
    slug: "ipa-download",
    eyebrow: "IPA downloads",
    title: "IPA Download Browser for iPhone and iPad",
    description:
      "Browse iOS IPA download listings from AltStore and SideStore-compatible repositories with source notes, versions, bundle IDs, and compatibility details.",
    intro:
      "Use iappstores as a searchable IPA download index before you open an external source. The site groups duplicate bundle identifiers, keeps repository notes visible, and points download buttons back to the original source URLs.",
    primaryCta: {
      label: "Browse IPA downloads",
      href: "/"
    },
    secondaryCta: {
      label: "Read IPA basics",
      href: "/guides/what-is-an-ipa-file"
    },
    sections: [
      {
        heading: "Find IPA listings without jumping between repositories",
        body:
          "AltStore and SideStore-compatible repositories often publish app metadata in separate JSON feeds. iappstores normalizes those feeds into searchable app cards so you can compare names, bundle identifiers, source repositories, latest versions, minimum iOS requirements, and available download options in one place."
      },
      {
        heading: "Compare sources before downloading",
        body:
          "Some apps appear in more than one repository. Grouped app pages make it easier to compare source names, repository notes, and version dates before opening a download link. This is useful for spotting stale builds or duplicate listings."
      },
      {
        heading: "Use the index as discovery, not a safety guarantee",
        body:
          "iappstores does not host IPA files, modify app packages, or review binaries for malware or privacy impact. Treat every third-party IPA as software from an external source and only install apps from repositories you trust."
      }
    ],
    faqs: [
      {
        question: "Does iappstores host IPA files?",
        answer:
          "No. iappstores indexes repository metadata and links to original source download URLs when a repository provides them."
      },
      {
        question: "What should I check before using an IPA download?",
        answer:
          "Check the source repository, app name, bundle identifier, version, update date, minimum iOS version, screenshots, and any source-provided notes."
      }
    ],
    relatedLinks: [
      {
        label: "Recently updated IPA apps",
        href: "/category/recent",
        description: "See recently updated listings from indexed repositories."
      },
      {
        label: "All app pages",
        href: "/apps",
        description: "Open the HTML sitemap of canonical app detail pages."
      },
      {
        label: "IPA file guide",
        href: "/guides/what-is-an-ipa-file",
        description: "Learn what an IPA file is and how repository metadata describes one."
      }
    ]
  },
  {
    slug: "ios-ipa-downloads",
    eyebrow: "iOS IPA downloads",
    title: "iOS IPA Downloads from Indexed App Repositories",
    description:
      "Search iOS IPA app listings by name, category, source, developer, bundle ID, and iOS compatibility across indexed repositories.",
    intro:
      "The iOS IPA ecosystem is spread across independent repositories. iappstores helps you search those repositories, compare metadata, and open the original source download when you decide a listing is worth checking.",
    primaryCta: {
      label: "Search iOS IPA apps",
      href: "/"
    },
    secondaryCta: {
      label: "Sideloading overview",
      href: "/guides/how-to-sideload-apps"
    },
    sections: [
      {
        heading: "Search by the details users actually compare",
        body:
          "Use app names, developer names, bundle identifiers, categories, source repositories, and iOS version filters to narrow the index. App detail pages preserve source-specific notes and supplement them with App Store context when available."
      },
      {
        heading: "Browse by category when you do not know the app name",
        body:
          "Category pages collect recent, game, tool, media, and education listings. These pages are helpful when you are exploring the repository ecosystem rather than looking for one specific bundle ID."
      },
      {
        heading: "Keep expectations clear",
        body:
          "A visible IPA listing means a repository published metadata for that app. It does not mean the app is safe, installable on every device, or still available from the upstream host."
      }
    ],
    faqs: [
      {
        question: "Can I filter IPA apps by iOS version?",
        answer:
          "Yes. The main browser supports iOS compatibility filters when repository metadata includes a minimum iOS version."
      },
      {
        question: "Are all listed apps compatible with AltStore or SideStore?",
        answer:
          "Many indexed repositories use compatible metadata, but actual compatibility depends on the app, source, signing tool, and current device requirements."
      }
    ],
    relatedLinks: [
      {
        label: "Games IPA listings",
        href: "/category/games",
        description: "Browse game-related IPA listings from indexed repositories."
      },
      {
        label: "Tools IPA listings",
        href: "/category/tools",
        description: "Find utility, signing, productivity, and customization listings."
      },
      {
        label: "How to sideload apps",
        href: "/guides/how-to-sideload-apps",
        description: "Understand the sideloading flow before opening third-party sources."
      }
    ]
  },
  {
    slug: "altstore-repositories",
    eyebrow: "AltStore repositories",
    title: "AltStore Repositories and IPA App Listings",
    description:
      "Browse AltStore-compatible repository metadata, app listings, categories, source notes, and IPA download options indexed by iappstores.",
    intro:
      "AltStore-compatible repositories publish structured metadata for apps and download options. iappstores turns those feeds into browsable repository, app, developer, and category pages.",
    primaryCta: {
      label: "Browse repositories",
      href: "/repositories"
    },
    secondaryCta: {
      label: "AltStore guide",
      href: "/guides/install-altstore"
    },
    sections: [
      {
        heading: "Repository pages show source-level context",
        body:
          "Each repository page collects the apps found in that source, source subtitle or URL details, and canonical links to app pages. This helps you understand where an app listing came from before opening a download option."
      },
      {
        heading: "App pages group duplicate bundle IDs",
        body:
          "When the same app appears across multiple repositories, iappstores groups matching bundle identifiers where possible. Grouped download options make it easier to compare source names and version data."
      },
      {
        heading: "Use official AltStore instructions for setup",
        body:
          "iappstores is an app discovery index, not an AltStore installer. For installation, signing, refresh limits, and current requirements, use the official AltStore project documentation."
      }
    ],
    faqs: [
      {
        question: "Is iappstores an AltStore repository?",
        answer:
          "No. iappstores indexes third-party repository metadata and links back to source repositories and source download URLs."
      },
      {
        question: "Can I browse apps by repository?",
        answer:
          "Yes. Repository pages list indexed apps for each source and link to canonical app detail pages."
      }
    ],
    relatedLinks: [
      {
        label: "Repository directory",
        href: "/repositories",
        description: "Open the full list of indexed IPA repositories."
      },
      {
        label: "How to install AltStore",
        href: "/guides/install-altstore",
        description: "Read the basic AltStore setup overview and source-of-truth caveats."
      },
      {
        label: "Recently updated apps",
        href: "/category/recent",
        description: "Find fresh app metadata from indexed sources."
      }
    ]
  },
  {
    slug: "sidestore-repositories",
    eyebrow: "SideStore repositories",
    title: "SideStore Repository Browser for IPA Apps",
    description:
      "Explore SideStore-compatible IPA repository listings, source notes, app metadata, and external download options in one searchable index.",
    intro:
      "SideStore users often discover apps through repository feeds. iappstores helps organize those feeds into searchable app and repository pages while keeping the original source context visible.",
    primaryCta: {
      label: "Explore repositories",
      href: "/repositories"
    },
    secondaryCta: {
      label: "SideStore guide",
      href: "/guides/install-sidestore"
    },
    sections: [
      {
        heading: "Browse compatible repository metadata",
        body:
          "Many indexed sources use metadata formats understood by sideloading tools. iappstores reads that metadata and exposes app names, version details, categories, icons, screenshots, and download options when present."
      },
      {
        heading: "Find apps even when source names differ",
        body:
          "Repository maintainers may use different titles, subtitles, or notes for the same app. Search and grouped app pages help you find related listings without manually opening every repository feed."
      },
      {
        heading: "Confirm setup details outside iappstores",
        body:
          "SideStore setup requirements and refresh behavior can change. Use iappstores to discover app metadata, then rely on the official SideStore project for installation and usage instructions."
      }
    ],
    faqs: [
      {
        question: "Does SideStore support every indexed repository?",
        answer:
          "Not necessarily. Repository metadata may be compatible, but app installation depends on the source, app package, signing workflow, and current SideStore requirements."
      },
      {
        question: "Can I compare SideStore and AltStore options?",
        answer:
          "Yes. iappstores indexes compatible repository metadata broadly, so you can compare app listings and source notes before choosing a sideloading workflow."
      }
    ],
    relatedLinks: [
      {
        label: "How to install SideStore",
        href: "/guides/install-sidestore",
        description: "Understand SideStore setup at a high level before browsing sources."
      },
      {
        label: "AltStore vs SideStore",
        href: "/guides/altstore-vs-sidestore",
        description: "Compare the two sideloading workflows conceptually."
      },
      {
        label: "Media IPA listings",
        href: "/category/media",
        description: "Browse media, video, audio, and creator app listings."
      }
    ]
  },
  {
    slug: "iphone-ipa-downloads",
    eyebrow: "iPhone IPA downloads",
    title: "iPhone IPA Downloads and App Metadata",
    description:
      "Find iPhone IPA app listings with source repository notes, bundle identifiers, version dates, screenshots, and minimum iOS compatibility when available.",
    intro:
      "Before opening an iPhone IPA download link, use iappstores to check the app metadata that repositories publish: source, version, bundle ID, screenshots, descriptions, and compatibility fields.",
    primaryCta: {
      label: "Find iPhone IPA apps",
      href: "/"
    },
    secondaryCta: {
      label: "Safety checklist",
      href: "/guides/how-to-sideload-apps"
    },
    sections: [
      {
        heading: "Start with metadata, then decide whether to open a source",
        body:
          "App cards surface source-provided metadata before sending you to an external download. This makes it easier to check whether the listing looks current, whether the bundle identifier matches what you expected, and whether the source notes mention special install details."
      },
      {
        heading: "Use iOS compatibility filters",
        body:
          "When repositories include minimum iOS data, the main browser can filter listings by compatibility. This is useful for older iPhones and iPads where not every app package will install cleanly."
      },
      {
        heading: "Understand what a click means",
        body:
          "Clicking download opens the source-provided URL through iappstores' same-origin wrapper for analytics and basic link checks. The actual IPA file remains hosted by the original source, not by iappstores."
      }
    ],
    faqs: [
      {
        question: "Can iappstores confirm an iPhone IPA install completed?",
        answer:
          "No. The site can track that a download link was clicked, but browser downloads and installs happen outside iappstores."
      },
      {
        question: "Why do some apps have multiple download options?",
        answer:
          "Multiple repositories can publish metadata for the same bundle identifier. iappstores groups those options so you can compare sources."
      }
    ],
    relatedLinks: [
      {
        label: "Browse all apps",
        href: "/",
        description: "Search and filter the full indexed app list."
      },
      {
        label: "Education IPA listings",
        href: "/category/education",
        description: "Explore study, reading, language, and learning app listings."
      },
      {
        label: "All developers",
        href: "/developers",
        description: "Browse developer pages derived from indexed app metadata."
      }
    ]
  }
];

export function getSeoLandingPage(slug: string): SeoLandingPage | null {
  return SEO_LANDING_PAGES.find((page) => page.slug === slug) ?? null;
}
