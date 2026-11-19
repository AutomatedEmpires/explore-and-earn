// Deterministic host-fraud rules. They run before the listing classifier. A match is a reason
// to queue the listing. These rules never approve anything: no match means "nothing to add",
// and the classifier still has to accept the listing on its own.

/** How long an organization counts as a new account for the repost rule. */
export const NEW_ACCOUNT_DAYS = 14;

/** Near-identical text, as a token Jaccard score. Short text never reaches this. */
const NEAR_COPY = 0.85;
const MIN_TOKENS = 12;

export const FRAUD_RULES = [
  'pay_to_apply',
  'off_platform_payment',
  'duplicate_listing',
  'deposit_only_in_messages',
] as const;

export type FraudRule = (typeof FRAUD_RULES)[number];

export type FraudMatch = { rule: FraudRule; reason: string };

export type FraudPeer = {
  orgId: string;
  orgCreatedAt: Date;
  text: string;
  photoIds: string[];
};

export type HostFraudInput = {
  /** Listing text with the housing section removed. */
  bodyText: string;
  /** The housing section only. A deposit stated here is not, by itself, a message-only deposit. */
  housingText: string;
  /** Optional message body. Listing screening omits it; message review passes it. */
  messageText?: string;
  photoIds: string[];
  orgId: string;
  orgCreatedAt: Date;
  now: Date;
  peers: FraudPeer[];
};

const NEGATION = /\b(no|not|never|without|don't|do not|cannot|can't|won't)\b/i;

const PAY_TO_APPLY = [
  /\bapplication fees?\b/i,
  /\bpay to apply\b/i,
  /\bfee to apply\b/i,
  /\btraining fees?\b/i,
  /\bpaid training\b/i,
  /\bbackground checks?\b/i,
  /\brecruitment fees?\b/i,
  /\bvisa fees?\b/i,
  /\bprocessing fees?\b/i,
  /\bdeposits?\b/i,
];

const OFF_PLATFORM = [
  /\bgift cards?\b/i,
  /\bbitcoin\b/i,
  /\bcrypto(?:currency)?\b/i,
  /\bwire transfer\b/i,
  /\bbank wire\b/i,
  /\bvenmo\b/i,
  /\bcash app\b/i,
  /\bzelle\b/i,
  /\bpaypal\b/i,
  /\bwhatsapp\b/i,
  /\btelegram\b/i,
];

const DEPOSIT_OR_FEE = [/\bdeposits?\b/i, /\bfees?\b/i];

function sentences(text: string): string[] {
  return text
    .split(/[\n.!;]+/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

/** A keyword hit in a sentence that is not denying the keyword. */
function affirms(text: string, patterns: RegExp[]): boolean {
  return sentences(text).some(
    (sentence) => patterns.some((pattern) => pattern.test(sentence)) && !NEGATION.test(sentence),
  );
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 2),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size < MIN_TOKENS || b.size < MIN_TOKENS) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

function isNewAccount(createdAt: Date, now: Date): boolean {
  return now.getTime() - createdAt.getTime() <= NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

function duplicate(input: HostFraudInput): FraudMatch | null {
  const own = tokens(input.bodyText);
  const ownPhotos = new Set(input.photoIds);
  const postingIsNew = isNewAccount(input.orgCreatedAt, input.now);
  for (const peer of input.peers) {
    if (peer.orgId === input.orgId) continue;
    const sharedPhoto = peer.photoIds.some((id) => id !== '' && ownPhotos.has(id));
    const copied = jaccard(own, tokens(peer.text)) >= NEAR_COPY;
    if (!sharedPhoto && !copied) continue;
    const fromNewAccount = postingIsNew || isNewAccount(peer.orgCreatedAt, input.now);
    return {
      rule: 'duplicate_listing',
      reason: fromNewAccount
        ? 'This listing repeats another organization\'s text or photos and one of the accounts is new.'
        : 'This listing repeats another organization\'s text or photos.',
    };
  }
  return null;
}

/**
 * Host-fraud matches for one listing. An empty array is not an approval: the caller still
 * has to run the classifier, and a thrown error must leave the listing unpublished.
 */
export function matchHostFraud(input: HostFraudInput): FraudMatch[] {
  const matches: FraudMatch[] = [];
  const prose = `${input.bodyText}\n${input.messageText ?? ''}`;
  if (affirms(input.bodyText, PAY_TO_APPLY)) {
    matches.push({
      rule: 'pay_to_apply',
      reason: 'The listing asks the seeker to pay a fee, a deposit, or for training or a background check.',
    });
  }
  if (affirms(prose, OFF_PLATFORM)) {
    matches.push({
      rule: 'off_platform_payment',
      reason: 'The listing or a message asks for payment or contact off the platform.',
    });
  }
  const copy = duplicate(input);
  if (copy) matches.push(copy);
  const message = input.messageText ?? '';
  if (affirms(message, DEPOSIT_OR_FEE) && !affirms(input.housingText, [/\bdeposits?\b/i])) {
    matches.push({
      rule: 'deposit_only_in_messages',
      reason: 'A deposit or fee appears in a message and is not stated in the housing section.',
    });
  }
  return matches;
}
