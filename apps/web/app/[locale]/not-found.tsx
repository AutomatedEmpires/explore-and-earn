import type { Metadata } from "next";

import { StatusCard } from "../../components/StatusCard";

export const metadata: Metadata = {
	title: "Page not found",
};

export default function RootNotFound() {
	return <StatusCard type="404" />;
}
