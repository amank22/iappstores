"use client";

import { Button } from "@/components/ui/button";
import { trackCrossPromoClick } from "@/lib/analytics";

export function CorrectMyPaperCta({ href, placement }: { href: string; placement: string }) {
  return (
    <Button asChild size="lg">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={() => trackCrossPromoClick({ placement, destination: href })}
      >
        Try CorrectMyPaper free →
      </a>
    </Button>
  );
}
