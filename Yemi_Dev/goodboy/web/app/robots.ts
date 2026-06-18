import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://goodboy-alpha.vercel.app/sitemap.xml",
    host: "https://goodboy-alpha.vercel.app",
  };
}
