"use client";

import { useCallback } from "react";
import type { AppCategory, AppCategoryFacet, AppDto, Pagination } from "@iappstores/contracts";
import { AppBrowser } from "@/components/app-browser";
import { fetchApps, searchApps, type AppQueryOptions } from "@/lib/api";

export function CategoryAppBrowser({
  category,
  initialApps,
  initialPagination,
  initialCategories
}: {
  category: AppCategory;
  initialApps: AppDto[];
  initialPagination: Pagination;
  initialCategories?: AppCategoryFacet[];
}) {
  const fetchList = useCallback(
    (options: AppQueryOptions & { query?: string }) => {
      const { query, ...rest } = options;
      const scoped = { ...rest, category };
      return query && query.trim().length > 0 ? searchApps(query, scoped) : fetchApps(scoped);
    },
    [category]
  );

  return (
    <AppBrowser
      fetchList={fetchList}
      initialApps={initialApps}
      initialPagination={initialPagination}
      initialCategories={initialCategories}
      showCategoryFilter={false}
      title="Apps"
    />
  );
}
