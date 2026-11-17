// W0 stub. The owning workstream replaces the body and keeps the name.
export async function listSeekerInterviews(..._args: unknown[]): Promise<{ items: never[]; nextCursor: null }> {
  return { items: [], nextCursor: null };
}

export async function hostInterviewViews(..._args: unknown[]): Promise<Map<string, never>> {
  return new Map<string, never>();
}
