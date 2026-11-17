// W0 stub. The owning workstream replaces the body and keeps the name.
export async function sendOffer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: sendOffer (W3)');
}

export async function cancelOffer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: cancelOffer (W3)');
}

export async function acceptOffer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: acceptOffer (W3)');
}

export async function declineOffer(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: declineOffer (W3)');
}

export async function listSeekerOffers(..._args: unknown[]): Promise<{ items: never[]; nextCursor: null }> {
  return { items: [], nextCursor: null };
}

export async function hostOfferViews(..._args: unknown[]): Promise<Map<string, never>> {
  return new Map<string, never>();
}

export async function getOfferLetterUrl(..._args: unknown[]): Promise<never> {
  throw new Error('not implemented: getOfferLetterUrl (W3)');
}
