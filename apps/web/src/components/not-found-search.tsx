"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NotFoundSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    router.push(trimmedQuery ? `/?q=${encodeURIComponent(trimmedQuery)}` : "/");
  }

  return (
    <form className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]" onSubmit={submitSearch}>
      <Input
        aria-label="Search IPA apps"
        className="h-12 rounded-2xl text-base"
        placeholder="Search YouTube, Instagram, Spotify..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <Button className="h-12 rounded-2xl px-6" type="submit">
        Search apps
      </Button>
    </form>
  );
}
