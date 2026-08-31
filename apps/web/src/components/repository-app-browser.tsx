"use client";

import { useCallback } from "react";
import type { AppDto, Pagination } from "@iappstores/contracts";
import { AppBrowser } from "@/components/app-browser";
import { fetchSourceApps, searchApps, type AppQueryOptions } from "@/lib/api";

export function RepositoryAppBrowser({
  sourceId,
  initialApps,
  initialPagination
}: {
  sourceId: string;
  initialApps: AppDto[];
  initialPagination: Pagination;
}) {
  const fetchList = useCallback(
    (options: AppQueryOptions & { query?: string }) => {
      const { query, ...rest } = options;
      return query && query.trim().length > 0
        ? searchApps(query, { ...rest, sourceId })
        : fetchSourceApps(sourceId, rest);
    },
    [sourceId]
  );

  return (
    <AppBrowser
      fetchList={fetchList}
      initialApps={initialApps}
      initialPagination={initialPagination}
      showSourceFilter={false}
      title="Apps"
    />
  );
}
