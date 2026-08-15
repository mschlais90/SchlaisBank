import type { MetadataRoute } from "next";

// There's no login on this app, so at least keep it out of search engines.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
