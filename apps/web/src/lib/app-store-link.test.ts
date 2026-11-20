import { describe, expect, it } from "vitest";
import { withAppStoreAttribution } from "./app-store-link";

describe("withAppStoreAttribution", () => {
  it("adds campaign and media type", () => {
    expect(withAppStoreAttribution("https://apps.apple.com/us/app/id123", undefined)).toBe(
      "https://apps.apple.com/us/app/id123?ct=imodstore&mt=8",
    );
  });

  it("adds the affiliate token when configured", () => {
    const out = new URL(withAppStoreAttribution("https://apps.apple.com/app/id1", "TOK"));
    expect(out.searchParams.get("at")).toBe("TOK");
  });

  it("keeps existing params and tokens", () => {
    const out = new URL(withAppStoreAttribution("https://apps.apple.com/app/id1?ct=x&foo=1", "TOK"));
    expect(out.searchParams.get("ct")).toBe("x");
    expect(out.searchParams.get("foo")).toBe("1");
  });

  it("leaves other hosts and invalid urls alone", () => {
    expect(withAppStoreAttribution("https://example.com/a", "TOK")).toBe("https://example.com/a");
    expect(withAppStoreAttribution("not a url", "TOK")).toBe("not a url");
  });

  it("handles search urls", () => {
    const out = new URL(withAppStoreAttribution("https://apps.apple.com/in/iphone/search?term=foo", undefined));
    expect(out.searchParams.get("term")).toBe("foo");
    expect(out.searchParams.get("ct")).toBe("imodstore");
  });
});
