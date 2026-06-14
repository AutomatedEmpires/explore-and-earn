import type { ReactNode } from "react";

import { SectionHeading } from "./SectionHeading";
import styles from "./BucketPage.module.css";

export interface BucketPageProps {
  readonly title: string;
  readonly description?: string;
  readonly children: ReactNode;
}

/** Shared scaffold for the lifecycle bucket routes (heading + content). */
export function BucketPage({ title, description, children }: BucketPageProps) {
  return (
    <section className={styles.section}>
      <SectionHeading as="h1" title={title} description={description} />
      {children}
    </section>
  );
}
