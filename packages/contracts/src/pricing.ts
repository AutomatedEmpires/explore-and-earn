export const FOUNDER_LOCKED_PRICING = {
  starter: {
    monthly: 199,
    yearly: 1990
  },
  professional: {
    monthly: 399,
    yearly: 3990
  },
  enterprise: {
    monthly: 749,
    yearly: 7490
  }
} as const;

// TODO: Add founding-host discounts, invite packs, and entitlement constants
// after pricing source-of-truth mirrors are committed into the repository.