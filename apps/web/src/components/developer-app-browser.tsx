"use client";

import { useCallback } from "react";
import type { AppDto, Pagination } from "@iappstores/contracts";
import { AppBrowser } from "@/components/app-browser";
import { fetchDeveloperApps, type AppQueryOptions } from "@/lib/api";

export function DeveloperAppBrowser({
  developerSlug,
  initialApps,
  initialPagination
}: {
  developerSlug: string;
  initialApps: AppDto[];
  initialPagination: Pagination;
}) {
  // The developer-scoped API has no free-text search endpoint, only category/sort/iOS-version/page,
  // so the search box is intentionally hidden here (see repository/category browsers, which do support it).
  const fetchList = useCallback(
    (options: AppQueryOptions) => fetchDeveloperApps(developerSlug, options),
    [developerSlug]
  );

  return (
    <AppBrowser
      fetchList={fetchList}
      initialApps={initialApps}
      initialPagination={initialPagination}
      showSearch={false}
      showSourceFilter={false}
      title="Apps"
    />
  );
}
