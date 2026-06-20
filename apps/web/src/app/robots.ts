import type { MetadataRoute } from "next";
import { getAbsoluteUrl, getSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/search?", "/*?sort=", "/*?pageSize=", "/*?includeAppStore="]
    },
    sitemap: getAbsoluteUrl("/sitemap.xml"),
    host: getSiteUrl()
  };
}
