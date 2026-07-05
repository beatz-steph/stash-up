import type { MetadataRoute } from "next"

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.stashup.xyz"

/** Allow crawling of the public marketing/legal pages; keep the authenticated
 * app and API out of the index. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/circles", "/transactions", "/settings", "/invites"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  }
}
