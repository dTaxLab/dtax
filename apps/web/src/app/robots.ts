import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/settings/",
          "/transactions/",
          "/tax/",
          "/portfolio/",
          "/reconcile/",
          "/compare/",
          "/transfers/",
        ],
      },
    ],
    sitemap: "https://dtax.ai/sitemap.xml",
  };
}
