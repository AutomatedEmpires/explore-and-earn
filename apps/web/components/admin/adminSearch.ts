export const ADMIN_QUERY_MAX_LENGTH = 120;

interface AdminSearchConfig {
  readonly action: string;
  readonly placeholder: string;
  readonly ariaLabel: string;
}

const APPLICATIONS_SEARCH: AdminSearchConfig = {
  action: "/applications",
  placeholder: "Search recent applications",
  ariaLabel:
    "Search the 50 most recent applications by seeker, listing, or status",
};

const LISTINGS_SEARCH: AdminSearchConfig = {
  action: "/listings",
  placeholder: "Search this listings page",
  ariaLabel: "Search listings on this page by title, host, category, or status",
};

const HOSTS_SEARCH: AdminSearchConfig = {
  action: "/hosts",
  placeholder: "Search this hosts page",
  ariaLabel:
    "Search hosts on this page by company, reference, verification, or listing count",
};

/**
 * Read one canonical admin query from Next.js search params.
 *
 * Repeated query params use their first value, matching the rest of the app's
 * page-param handling. Trimming and bounding the value keeps the command bar,
 * table filter, and pagination URL on one predictable contract.
 */
export function readAdminQuery(
  value: string | string[] | undefined,
): string {
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").trim().slice(0, ADMIN_QUERY_MAX_LENGTH);
}

function adminRouteSegment(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] ?? "";
  const segments = path.split("/").filter(Boolean);
  const first = segments[0] ?? "";
  const localePrefixed = /^[a-z]{2}(?:-[a-z]{2})?$/i.test(first);
  return (segments[localePrefixed ? 1 : 0] ?? "").toLowerCase();
}

/** Resolve the shell search to the current admin collection route. */
export function resolveAdminSearch(pathname: string): AdminSearchConfig {
  switch (adminRouteSegment(pathname)) {
    case "listings":
      return LISTINGS_SEARCH;
    case "hosts":
      return HOSTS_SEARCH;
    case "applications":
    default:
      // Unsupported admin surfaces fall back to an explicitly labelled recent-
      // applications search instead of implying a global marketplace search.
      return APPLICATIONS_SEARCH;
  }
}

/** Match only the visible values a table deliberately supplies. */
export function matchesAdminQuery(
  query: string,
  visibleValues: ReadonlyArray<string | number>,
): boolean {
  const needle = readAdminQuery(query).toLowerCase();
  if (!needle) return true;

  return visibleValues
    .map((value) => String(value))
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

/** Build a pager URL without losing the active, sanitized table query. */
export function adminPageHref(
  basePath: string,
  page: number,
  query?: string,
): string {
  const params = new URLSearchParams();
  const sanitizedQuery = readAdminQuery(query);
  if (sanitizedQuery) params.set("q", sanitizedQuery);

  const sanitizedPage = Number.isFinite(page) ? Math.floor(page) : 1;
  if (sanitizedPage > 1) params.set("page", String(sanitizedPage));

  const suffix = params.toString();
  return suffix ? `${basePath}?${suffix}` : basePath;
}
