import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { StatusCard } from "../../../../components/StatusCard";
import { getPathname } from "../../../../i18n/navigation";

export const metadata: Metadata = {
	title: "Page not found",
	robots: { index: false, follow: false },
};

/**
 * Public host profiles can disappear, remain private, or never have
 * existed. Keep that distinction private while giving the visitor useful next
 * steps into the current marketplace.
 */
export default async function HostProfileNotFound() {
	const [locale, t] = await Promise.all([
		getLocale(),
		getTranslations("HostNotFound"),
	]);
	const seekHref = getPathname({ locale, href: "/seek" });
	const jobsHref = getPathname({ locale, href: "/jobs" });

	return (
		<StatusCard
			type="404"
			presentation="embedded"
			eyebrow={t("eyebrow")}
			title={t("title")}
			message={t("message")}
			destination={{ href: seekHref, label: t("browse"), icon: "nav.seek" }}
			secondaryDestination={{ href: jobsHref, label: t("workTypes"), icon: "nav.seek" }}
		/>
	);
}
