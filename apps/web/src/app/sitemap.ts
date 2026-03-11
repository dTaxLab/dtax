import { MetadataRoute } from "next";

const BASE_URL = "https://dtax.ai";

export default function sitemap(): MetadataRoute.Sitemap {
  const locales = ["en", "zh"];
  const publicPages = [
    "",
    "/pricing",
    "/features",
    "/security",
    "/exchanges",
    "/faq",
    "/docs",
    "/docs/changelog",
    "/for-cpas",
    "/auth",
    "/legal/terms",
    "/legal/privacy",
    "/legal/disclaimer",
  ];

  const entries: MetadataRoute.Sitemap = [];

  for (const page of publicPages) {
    for (const locale of locales) {
      entries.push({
        url: `${BASE_URL}/${locale}${page}`,
        lastModified: new Date(),
        changeFrequency: page === "" ? "weekly" : "monthly",
        priority: page === "" ? 1.0 : page === "/pricing" ? 0.9 : 0.7,
      });
    }
  }

  return entries;
}
