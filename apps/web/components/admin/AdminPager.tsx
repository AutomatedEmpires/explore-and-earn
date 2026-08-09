import Link from "next/link";
import { Icon } from "@explore-and-earn/ui";

import { adminPageHref } from "./adminSearch";
import styles from "./AdminPager.module.css";

export interface AdminPagerProps {
  readonly basePath: string;
  readonly page: number;
  readonly totalPages: number;
  readonly total: number;
  readonly pageSize: number;
  readonly query?: string;
}

/**
 * Plain Prev/Next pager for the unbounded admin list queries (getAllHostProfiles,
 * getAllListingsForModeration). Server-rendered links — no client state, works
 * with force-dynamic pages and browser back/forward for free.
 */
export function AdminPager({
  basePath,
  page,
  totalPages,
  total,
  pageSize,
  query = "",
}: AdminPagerProps) {
  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className={styles.pager} aria-label="Pagination">
      <span>
        {from}–{to} of {total}
      </span>
      <span className={styles.links}>
        {hasPrev ? (
          <Link className={styles.link} href={adminPageHref(basePath, page - 1, query)}>
            <Icon name="action.back" size={16} aria-hidden />
            Prev
          </Link>
        ) : (
          <span className={styles.linkDisabled} aria-disabled="true">
            <Icon name="action.back" size={16} aria-hidden />
            Prev
          </span>
        )}
        {hasNext ? (
          <Link className={styles.link} href={adminPageHref(basePath, page + 1, query)}>
            Next
            <Icon name="action.forward" size={16} aria-hidden />
          </Link>
        ) : (
          <span className={styles.linkDisabled} aria-disabled="true">
            Next
            <Icon name="action.forward" size={16} aria-hidden />
          </span>
        )}
      </span>
    </nav>
  );
}
