import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/stats", "/playground"],
        disallow: ["/api/", "/dashboard/", "/repos/", "/scans/", "/settings/"],
      },
    ],
    sitemap: "https://carapacesec.io/sitemap.xml",
  };
}
