import type { Metadata } from "next";
import type { AppQueryOptions } from "@/lib/api";
import HomeClient from "@/components/home-client";
import { fetchApps, fetchSources, fetchSponsors, searchApps } from "@/lib/api";
import {
  ALL_SOURCES,
  HOME_EMPTY_CATEGORIES,
  HOME_EMPTY_PAGINATION,
  HOME_PAGE_SIZE,
  getActiveIosVersion,
  parseHomeUrlState,
  type HomeInitialData
} from "@/lib/home";
import { siteDescription } from "@/lib/site";
import { EMPTY_SPONSOR_STRIP, toSponsorStripData } from "@/lib/sponsors";

export const dynamic = "force-dynamic";

type HomePageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata: Metadata = {
  title: {
    absolute: "iappstores - IPA Downloads & AltStore Repositories"
  },
  description: siteDescription,
  alternates: {
    canonical: "/"
  },
  openGraph: {
    title: "iappstores - IPA Downloads & AltStore Repositories",
    description: siteDescription,
    url: "/",
    siteName: "iappstores",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "iappstores IPA repository browser"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "iappstores - IPA Downloads & AltStore Repositories",
    description: siteDescription,
    images: ["/og.svg"]
  }
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Could not load repository data.";
}

async function loadInitialHomeData(searchParams: Record<string, string | string[] | undefined>): Promise<HomeInitialData> {
  const urlState = parseHomeUrlState(searchParams);
  const sourceId = urlState.selectedSourceId === ALL_SOURCES ? undefined : urlState.selectedSourceId;
  const options: AppQueryOptions = {
    sourceId,
    category: urlState.selectedCategory,
    sort: urlState.sort,
    iosVersion: getActiveIosVersion(urlState.iosVersion),
    iosVersionOperator: urlState.iosVersionOperator,
    page: 1,
    pageSize: HOME_PAGE_SIZE
  };

  const [sourcesResult, appsResult, sponsorsResult] = await Promise.allSettled([
    fetchSources(),
    urlState.query ? searchApps(urlState.query, options) : fetchApps(options),
    fetchSponsors()
  ]);
  // The page works without sponsors, so a failed or slow call just shows the house ad.
  const sponsorStrip =
    sponsorsResult.status === "fulfilled" ? toSponsorStripData(sponsorsResult.value) : EMPTY_SPONSOR_STRIP;
  const sources = sourcesResult.status === "fulfilled" ? sourcesResult.value : [];

  if (appsResult.status === "fulfilled") {
    return {
      urlState,
      sources,
      apps: appsResult.value.apps,
      categories: appsResult.value.categories,
      pagination: appsResult.value.pagination,
      sponsorStrip,
      error: sourcesResult.status === "rejected" ? getErrorMessage(sourcesResult.reason) : null
    };
  }

  return {
    urlState,
    sources,
    apps: [],
    categories: HOME_EMPTY_CATEGORIES,
    pagination: HOME_EMPTY_PAGINATION,
    sponsorStrip,
    error: getErrorMessage(appsResult.reason)
  };
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedSearchParams = await searchParams;
  const initialData = await loadInitialHomeData(resolvedSearchParams);

  return <HomeClient initialData={initialData} />;
}
