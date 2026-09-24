"use client";

import Link from "next/link";
import { NotePencilIcon } from "@phosphor-icons/react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { trackCrossPromoClick } from "@/lib/analytics";

export function PromoAppCard() {
  return (
    <div
      className={[
        "app-card-hover-wrap h-full min-h-[23rem] min-w-0 rounded-lg",
        "transition-[transform,box-shadow] duration-200 ease-out",
        "hover:-translate-y-1 hover:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.38)]",
        "dark:hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.72)]",
        "focus-within:-translate-y-1 focus-within:shadow-[0_14px_44px_-10px_rgba(0,0,0,0.38)]",
        "dark:focus-within:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.72)]"
      ].join(" ")}
    >
      <Link
        href="/correctmypaper"
        onClick={() => trackCrossPromoClick({ placement: "home_grid_pinned_card", destination: "/correctmypaper" })}
        className="flex h-full min-h-[23rem] min-w-0 flex-col rounded-lg ring-1 ring-indigo-500/25"
      >
        <Card className="flex h-full min-h-[23rem] min-w-0 flex-col bg-indigo-500/[0.06] [contain:layout_paint]">
          <CardHeader className="gap-4 p-4 sm:p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25">
                <NotePencilIcon className="size-7" aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <Badge variant="secondary">Sponsored</Badge>
                <CardTitle className="line-clamp-2 break-words text-xl leading-tight">CorrectMyPaper</CardTitle>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3 p-4 pt-0 sm:p-6 sm:pt-0">
            <p className="text-sm leading-6 text-muted-foreground">
              Writing a research paper, essay, or thesis? CorrectMyPaper uses AI to proofread your writing, fix
              grammar, and tighten up your academic tone before you submit.
            </p>
          </CardContent>
          <CardFooter className="p-4 pt-0 sm:p-6 sm:pt-0">
            <span className="text-sm font-semibold text-indigo-300">Learn more →</span>
          </CardFooter>
        </Card>
      </Link>
    </div>
  );
}
