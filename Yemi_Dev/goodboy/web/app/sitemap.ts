import type { MetadataRoute } from "next";

const BASE = "https://goodboy-alpha.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/try`, changeFrequency: "weekly", priority: 0.9 },
  ];
}
