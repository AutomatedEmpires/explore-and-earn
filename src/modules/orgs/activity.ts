// The team activity log (SP2 spec section 6): the org's team, location, host page and listing
// audit rows, plus plan changes, newest first, each with who did it and a one-line summary.
// It reads only rows recorded with the org's `orgId`.
import type { DbOrTx } from '@/lib/db';
import { searchAudit, type AuditEvent } from '@/modules/audit';
import type { OrgRole } from '@/modules/identity';
import type { HostContext } from '@/server/guards';
import { ROLE_LABELS, ROLE_PHRASES } from './notifications';
import { getPeople, personLabel, type Person } from './people';
import { requireCapability } from './roles';

export const ACTIVITY_ACTION_PREFIXES = [
  'orgs.',
  'locations.',
  'hostpages.',
  'listings.',
  'billing.plan_changed',
];

export const ACTIVITY_PAGE_SIZE = 50;

export type ActivityItem = { at: Date; actorLabel: string; action: string; summary: string };

type Data = Record<string, unknown>;
type Summarize = (d: Data, people: Map<string, Person>) => string;

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

const roleLabel = (v: unknown): string =>
  typeof v === 'string' && v in ROLE_LABELS ? ROLE_LABELS[v as OrgRole] : 'a new role';

const rolePhrase = (v: unknown): string =>
  typeof v === 'string' && v in ROLE_PHRASES ? ROLE_PHRASES[v as OrgRole] : 'a team member';

const nested = (v: unknown): Data => (typeof v === 'object' && v !== null ? (v as Data) : {});

/** The user a row is about (`data.userId`), as their team knows them. */
const subject = (d: Data, people: Map<string, Person>): string => {
  const id = str(d.userId);
  return personLabel(id ? people.get(id) : undefined, 'a former team member');
};

const ORG_FIELDS: Record<string, string> = {
  name: 'name',
  websiteUrl: 'website',
  requireRecruiterApproval: 'Recruiter approval rule',
  primaryLocationId: 'primary location',
};

function list(words: string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** A listing named by its title when the row carries one. */
const listing = (d: Data): string => {
  const title = str(d.title);
  return title ? `"${title}"` : 'a listing';
};

const location = (d: Data): string => {
  const name = str(d.name);
  return name ? `the location "${name}"` : 'a location';
};

const STATUS_VERBS: Record<string, string> = {
  active: 'Restored the organization',
  suspended: 'Suspended the organization',
  banned: 'Banned the organization',
};

const SUMMARIES: Record<string, Summarize> = {
  'orgs.created': (d) => `Created ${str(d.name) ?? 'the organization'}`,
  'orgs.updated': (d) => {
    const fields = Object.keys(nested(d.changes)).map((k) => ORG_FIELDS[k] ?? k);
    return fields.length > 0
      ? `Changed the organization's ${list(fields)}`
      : 'Updated the organization';
  },
  'orgs.member_invited': (d) => `Invited ${str(d.email) ?? 'someone'} as ${rolePhrase(d.role)}`,
  'orgs.invitation_revoked': (d) => `Revoked the invitation to ${str(d.email) ?? 'someone'}`,
  'orgs.invitation_accepted': (d) => `Joined the team as ${rolePhrase(d.role)}`,
  'orgs.member_changed': (d, people) => {
    const from = nested(d.from);
    const to = nested(d.to);
    return from.role !== to.role
      ? `Changed ${subject(d, people)}'s role to ${roleLabel(to.role)}`
      : `Changed which listings ${subject(d, people)} works on`;
  },
  'orgs.member_removed': (d, people) =>
    d.left === true ? 'Left the team' : `Removed ${subject(d, people)} from the team`,
  'orgs.ownership_transferred': (d, people) => {
    const id = str(d.toUserId);
    return `Made ${personLabel(id ? people.get(id) : undefined, 'an Admin')} the Owner`;
  },
  'orgs.deleted': () => 'Deleted the organization',
  'orgs.status_changed': (d) => STATUS_VERBS[String(d.to)] ?? 'Changed the organization status',
  'orgs.slug_changed': (d) =>
    str(d.to)
      ? `Changed the host page address to /hosts/${str(d.to)}`
      : 'Changed the host page address',
  'locations.created': (d) => `Added ${location(d)}`,
  'locations.updated': (d) => `Updated ${location(d)}`,
  'locations.archived': (d) => `Archived ${location(d)}`,
  'hostpages.updated': () => 'Updated the host page',
  'hostpages.followed': () => 'Someone followed your host page',
  'listings.created': (d) => `Started ${listing(d)}`,
  'listings.imported': (d) => `Imported ${listing(d)} from a job post`,
  'listings.publish_requested': (d) => `Asked to publish ${listing(d)}`,
  'listings.approval_decided': (d) =>
    d.decision === 'return' ? `Sent ${listing(d)} back for changes` : `Approved ${listing(d)}`,
  'listings.published': (d) => `Published ${listing(d)}`,
  'listings.revision_rejected': (d) => `Changes to ${listing(d)} were not approved`,
  'listings.closed': (d) => `Closed ${listing(d)}`,
  'listings.removed': (d) => `${listing(d).replace(/^a/, 'A')} was removed`,
  'listings.reposted': (d) => `Reposted ${listing(d)}`,
  'listings.confirmed_active': (d) => `Confirmed ${listing(d)} is still hiring`,
  'listings.deleted': (d) => `Deleted ${listing(d)}`,
  'billing.plan_changed': () => 'Changed the plan',
};

/** 'listings.something_new' -> 'Something new' for actions without a template. */
function fallbackSummary(action: string): string {
  const verb = action.slice(action.indexOf('.') + 1).replace(/_/g, ' ');
  return verb ? verb.charAt(0).toUpperCase() + verb.slice(1) : action;
}

function actorLabel(e: AuditEvent, people: Map<string, Person>): string {
  if (e.actorType === 'operator') return 'Explore&Earn';
  if (e.actorType === 'system') return 'Explore&Earn (automatic)';
  // Follow lists are private (spec section 10): the team never sees who followed.
  if (e.action === 'hostpages.followed') return 'A job seeker';
  return personLabel(e.actorId ? people.get(e.actorId) : undefined, 'A former team member');
}

/**
 * The caller's team activity, newest first, 50 at a time (Owner or Admin). Pass `nextBefore`
 * back as `before` for the next page.
 */
export async function listActivity(
  db: DbOrTx,
  ctx: HostContext,
  before?: string,
): Promise<{ items: ActivityItem[]; nextBefore: string | null }> {
  requireCapability(ctx, 'activity.read');
  const page = await searchAudit(db, {
    orgId: ctx.orgId,
    actionPrefixes: ACTIVITY_ACTION_PREFIXES,
    before,
    limit: ACTIVITY_PAGE_SIZE,
  });

  const ids: (string | null)[] = [];
  for (const e of page.items) {
    ids.push(e.actorId);
    const d = nested(e.data);
    ids.push(str(d.userId), str(d.toUserId));
  }
  const people = await getPeople(db, ids);

  return {
    items: page.items.map((e) => {
      const summarize = SUMMARIES[e.action];
      const data = nested(e.data);
      return {
        at: e.createdAt,
        actorLabel: actorLabel(e, people),
        action: e.action,
        summary: summarize ? summarize(data, people) : fallbackSummary(e.action),
      };
    }),
    nextBefore: page.nextBefore,
  };
}
