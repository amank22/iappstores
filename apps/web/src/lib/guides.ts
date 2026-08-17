export type Guide = {
  slug: string;
  title: string;
  description: string;
  sections: Array<{
    heading: string;
    body: string;
  }>;
  faqs: Array<{
    question: string;
    answer: string;
  }>;
};

export const GUIDES: Guide[] = [
  {
    slug: "install-altstore",
    title: "How to Install AltStore",
    description: "Learn the basic AltStore installation flow for sideloading IPA apps on iPhone and iPad.",
    sections: [
      {
        heading: "What AltStore does",
        body:
          "AltStore lets iPhone and iPad users install compatible IPA files with an Apple ID signing flow. It is commonly used for apps distributed outside the App Store by independent developers and repository maintainers."
      },
      {
        heading: "Before installing",
        body:
          "Check the official AltStore instructions for the current desktop requirements, supported iOS versions, and refresh behavior. Requirements can change, so use iappstores as an app discovery index and the official project as the installation source of truth."
      },
      {
        heading: "Finding apps",
        body:
          "After AltStore is set up, use category, repository, and app pages on iappstores to compare available IPA listings, source notes, version dates, and compatibility fields before opening an external download source."
      }
    ],
    faqs: [
      {
        question: "Does iappstores install AltStore for me?",
        answer: "No. iappstores indexes repository metadata and links to source pages. Follow the official AltStore project for installation."
      },
      {
        question: "Can AltStore install every IPA file?",
        answer: "No. Compatibility depends on the app, iOS version, signing limits, and the current AltStore requirements."
      }
    ]
  },
  {
    slug: "install-sidestore",
    title: "How to Install SideStore",
    description: "Understand the SideStore installation approach and how to browse compatible IPA repositories.",
    sections: [
      {
        heading: "What SideStore is",
        body:
          "SideStore is an alternative sideloading project used by people who want to install IPA apps outside the App Store. It has its own setup requirements and refresh workflow."
      },
      {
        heading: "Use official setup instructions",
        body:
          "Because SideStore setup requirements change over time, always use the official SideStore documentation for installation steps. iappstores helps with discovery after setup by organizing app and repository metadata."
      },
      {
        heading: "Browsing SideStore-compatible repositories",
        body:
          "Many repositories indexed by iappstores are AltStore or SideStore compatible. Repository pages show source names, app listings, categories, and download options when the source metadata includes them."
      }
    ],
    faqs: [
      {
        question: "Is SideStore the same as AltStore?",
        answer: "No. They are related sideloading tools, but setup and refresh behavior can differ."
      },
      {
        question: "Does iappstores host SideStore repositories?",
        answer: "No. iappstores indexes third-party repository metadata and links back to source URLs."
      }
    ]
  },
  {
    slug: "what-is-an-ipa-file",
    title: "What Is an IPA File?",
    description: "A plain-English explanation of IPA files, iOS app packages, and repository metadata.",
    sections: [
      {
        heading: "IPA file basics",
        body:
          "An IPA file is an iOS app package. It contains the files needed to install an app on iPhone or iPad when the package is signed and compatible with the target device."
      },
      {
        heading: "Why repositories list IPA files",
        body:
          "AltStore-compatible repositories publish metadata such as app name, bundle identifier, versions, download URLs, screenshots, and minimum iOS requirements. iappstores reads that metadata and turns it into searchable app pages."
      },
      {
        heading: "What to check before downloading",
        body:
          "Review the source repository, version date, minimum iOS version, developer name, and repository notes. iappstores does not verify or modify IPA files, so the original source remains important."
      }
    ],
    faqs: [
      {
        question: "Is an IPA file always safe?",
        answer: "No. Treat IPA files like software from any third-party source and review the repository, developer, and project reputation."
      },
      {
        question: "Does every IPA work on every iPhone?",
        answer: "No. Apps may require specific iOS versions, device capabilities, or signing conditions."
      }
    ]
  },
  {
    slug: "how-to-sideload-apps",
    title: "How to Sideload Apps on iOS",
    description: "A practical overview of sideloading iOS apps and checking app compatibility before download.",
    sections: [
      {
        heading: "Choose a sideloading method",
        body:
          "Most users start with a tool such as AltStore or SideStore. The right choice depends on your device, desktop access, signing preferences, and the current instructions from each project."
      },
      {
        heading: "Check app metadata first",
        body:
          "Before opening an external download, compare the app page fields on iappstores: bundle ID, version, update date, source repository, minimum iOS version, screenshots, and repository notes."
      },
      {
        heading: "Keep sources organized",
        body:
          "Use repository pages and category pages to understand where an app comes from and whether similar apps are available from another source. This helps avoid duplicate listings and stale builds."
      }
    ],
    faqs: [
      {
        question: "Does sideloading require a computer?",
        answer: "Some workflows do and some may not. Check the current instructions for the sideloading tool you use."
      },
      {
        question: "Can iappstores tell me if an IPA is safe?",
        answer: "No. iappstores indexes metadata and source links; it does not audit the binary contents of IPA files."
      }
    ]
  },
  {
    slug: "altstore-vs-sidestore",
    title: "AltStore vs SideStore",
    description: "Compare AltStore and SideStore at a high level before choosing a sideloading workflow.",
    sections: [
      {
        heading: "Shared purpose",
        body:
          "AltStore and SideStore are both used to install compatible IPA apps outside the App Store. Both appear in the broader ecosystem of iOS app repositories and sideloading guides."
      },
      {
        heading: "Main difference",
        body:
          "The practical difference is setup and refresh workflow. Those details can change, so compare the official documentation for each project before choosing one."
      },
      {
        heading: "How iappstores fits",
        body:
          "iappstores is not a replacement for either tool. It helps users browse app listings, categories, repositories, and metadata before they decide what to install with their preferred sideloading setup."
      }
    ],
    faqs: [
      {
        question: "Which is better, AltStore or SideStore?",
        answer: "It depends on your device, setup preferences, and the current project requirements."
      },
      {
        question: "Can the same repository work with both?",
        answer: "Many repositories use compatible metadata, but actual support depends on the repository and sideloading tool."
      }
    ]
  }
];

export function getGuide(slug: string): Guide | null {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}
