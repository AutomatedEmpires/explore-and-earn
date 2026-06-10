import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

export const metadata: Metadata = {
	title: "Seek",
	description:
		"Legacy search route redirected to the canonical seek lane.",
	robots: { index: false, follow: false },
};

export default function SearchPage() {
	permanentRedirect("/seek");
}
