import type { MetadataRoute } from "next";

const baseUrl =
	process.env.NEXT_PUBLIC_APP_URL ?? "https://explore-and-earn.vercel.app";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/host/"] },
		sitemap: `${baseUrl}/sitemap.xml`,
	};
}
