import { notFound } from "next/navigation";

import {
  HOST_APPLICANTS,
  HostApplicantDetail,
  HostSectionHeading,
  findHostApplicant,
} from "../../../../../components/host";
import styles from "./page.module.css";

export function generateStaticParams(): Array<{ id: string }> {
  return HOST_APPLICANTS.map((applicant) => ({ id: applicant.id }));
}

export default async function HostApplicantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const applicant = findHostApplicant(id);
  if (!applicant) {
    notFound();
  }

  return (
    <section className={styles.block}>
      <HostSectionHeading
        title="Applicant"
        description="Review this application, its stage, and the listing it targets."
        actionLabel="All applicants"
        actionHref="/host/applicants"
      />
      <HostApplicantDetail applicant={applicant} />
    </section>
  );
}
