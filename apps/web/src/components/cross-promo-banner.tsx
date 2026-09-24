"use client";

import { NotePencilIcon } from "@phosphor-icons/react";
import { trackCrossPromoClick } from "@/lib/analytics";
import { getCorrectMyPaperUrl } from "@/lib/site";

export function CrossPromoBanner() {
  const href = getCorrectMyPaperUrl("home_top_banner");

  return (
    <div
      role="region"
      aria-label="CorrectMyPaper promotion"
      className="border-b border-indigo-500/25 bg-indigo-500/[0.08]"
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-3 py-2 sm:px-6 lg:px-8">
        <NotePencilIcon className="h-4 w-4 shrink-0 text-indigo-400" aria-hidden />
        <p className="min-w-0 flex-1 text-xs leading-5 text-indigo-50/85">
          <span className="font-medium text-indigo-100">Also writing a paper or essay?</span>{" "}
          CorrectMyPaper offers AI-powered proofreading and grammar correction.
        </p>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackCrossPromoClick({ placement: "home_top_banner", destination: href })}
          className="shrink-0 whitespace-nowrap text-xs font-semibold text-indigo-200 underline-offset-4 hover:underline"
        >
          Try it free →
        </a>
      </div>
    </div>
  );
}
