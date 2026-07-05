import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz"

/** Public, indexable routes only. */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const routes = ["", "/sign-in", "/sign-up", "/terms", "/privacy"]
  return routes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "" ? 1 : 0.6,
  }))
}
