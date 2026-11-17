// W0 stub. The owning workstream replaces the body and keeps the name.
export async function listHostInvites(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: listHostInvites (W2)');
}

export async function getInterestedCandidate(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: getInterestedCandidate (W2)');
}

export async function listSeekerInvites(..._args: unknown[]): Promise<{ items: never[]; nextCursor: null }> {
  return { items: [], nextCursor: null };
}

export async function getSeekerInvite(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: getSeekerInvite (W2)');
}

export async function seekerInviteItems(..._args: unknown[]): Promise<Map<string, never>> {
  return new Map<string, never>();
}

export async function hostInviteItems(..._args: unknown[]): Promise<Map<string, never>> {
  return new Map<string, never>();
}
