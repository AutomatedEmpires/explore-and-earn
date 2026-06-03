import type { Metadata } from "next";

import { SearchView } from "../../components/search/SearchView";

import "../../components/search/search.css";

export const metadata: Metadata = {
	title: "Search · Explore&Earn",
	description:
		"Search and filter Explore&Earn opportunities by lane and benefits.",
};

export default function SearchPage() {
	return <SearchView />;
}
