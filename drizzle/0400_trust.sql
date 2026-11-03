-- 0400_trust: AI checks, review queues, internal notes and operator actions (W5, Tasks 14-16).

-- One row per trust.runCheck() call: what the classifier said and what was decided.
-- `score` is null when the classifier failed (decision needs_review, reason classifier_error).
create table app.trust_checks (
  id uuid primary key,
  -- image_safety, text_safety; later sub-projects add their own kinds in code.
  kind text not null check (kind <> ''),
  subject_type text not null check (subject_type <> ''),
  subject_id text not null,
  -- AI_PROVIDER at the time of the call: anthropic or stub.
  provider text not null,
  model text not null,
  prompt_version text not null,
  score real check (score is null or (score >= 0 and score <= 1)),
  labels text[] not null default '{}',
  reason text not null,
  decision text not null check (decision in ('approved', 'rejected', 'needs_review')),
  latency_ms int not null check (latency_ms >= 0),
  -- Why the classifier failed (never the classified content).
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index trust_checks_subject_idx on app.trust_checks (subject_type, subject_id, created_at);
-- trust.auditSample reads the past week's automatic decisions.
create index trust_checks_automatic_idx on app.trust_checks (created_at)
  where decision in ('approved', 'rejected');

alter table app.trust_checks enable row level security;

create trigger trust_checks_set_updated_at
  before update on app.trust_checks
  for each row execute function app.set_updated_at();

-- Work for operators. Each item has at most one assignee at a time; `status` is
-- open (unassigned) -> assigned | escalated -> resolved.
create table app.review_items (
  id uuid primary key,
  queue text not null check (queue in (
    'moderation', 'fraud', 'reports', 'support', 'child_safety', 'billing', 'appeals',
    'audit_sample'
  )),
  status text not null default 'open'
    check (status in ('open', 'assigned', 'escalated', 'resolved')),
  subject_type text not null check (subject_type <> ''),
  subject_id text not null,
  check_id uuid references app.trust_checks (id),
  reason text not null,
  ai_confidence real,
  -- Higher first. Escalation adds 100; a child-safety match uses 1000.
  priority int not null default 0,
  assignee_operator_id uuid references app.operators (user_id),
  assigned_at timestamptz,
  escalated_to uuid references app.operators (user_id),
  -- Routing never picks these operators (for an appeal: whoever made the original decision).
  exclude_operator_ids uuid[] not null default '{}',
  sla_due_at timestamptz not null,
  -- Set once, when the item is overdue and nobody else can take it.
  sla_breached_at timestamptz,
  decided_by uuid references app.operators (user_id),
  -- For an appeal: the item whose decision is appealed.
  original_item_id uuid references app.review_items (id),
  -- The applied action.
  resolution text check (resolution in ('approve', 'remove', 'ask_info', 'suspend', 'ban', 'refund')),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_items_resolved_consistent
    check ((status = 'resolved') = (resolved_at is not null and resolution is not null)),
  constraint review_items_assignee_consistent
    check (status = 'resolved' or (status = 'open') = (assignee_operator_id is null))
);

create index review_items_queue_idx on app.review_items (queue, status, priority desc, created_at);
create index review_items_assignee_idx on app.review_items (assignee_operator_id, status);
create index review_items_subject_idx on app.review_items (subject_type, subject_id);
create index review_items_original_idx on app.review_items (original_item_id);
-- The SLA sweep scans unresolved items by due time.
create index review_items_sla_idx on app.review_items (sla_due_at) where status <> 'resolved';
-- A trust check is sampled for audit at most once.
create unique index review_items_audit_sample_check_uq on app.review_items (check_id)
  where queue = 'audit_sample';
-- At most one open appeal per decision.
create unique index review_items_open_appeal_uq on app.review_items (original_item_id)
  where queue = 'appeals' and status <> 'resolved';

alter table app.review_items enable row level security;

create trigger review_items_set_updated_at
  before update on app.review_items
  for each row execute function app.set_updated_at();

-- Internal notes on an item. `mentions` holds the operators @mentioned in the body.
create table app.review_notes (
  id uuid primary key,
  item_id uuid not null references app.review_items (id),
  author_operator_id uuid not null references app.operators (user_id),
  body text not null check (length(body) between 1 and 5000),
  mentions uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index review_notes_item_idx on app.review_notes (item_id, created_at);

alter table app.review_notes enable row level security;

create trigger review_notes_set_updated_at
  before update on app.review_notes
  for each row execute function app.set_updated_at();

-- Decisions. A ban, or a large refund, waits as pending_second until a different operator
-- approves it (applied) or it is withdrawn (rejected).
create table app.review_actions (
  id uuid primary key,
  item_id uuid not null references app.review_items (id),
  action text not null
    check (action in ('approve', 'remove', 'ask_info', 'suspend', 'ban', 'refund')),
  actor_operator_id uuid not null references app.operators (user_id),
  data jsonb,
  status text not null check (status in ('pending_second', 'applied', 'rejected')),
  second_operator_id uuid references app.operators (user_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_actions_second_is_different
    check (second_operator_id is null or second_operator_id <> actor_operator_id)
);

create index review_actions_item_idx on app.review_actions (item_id, created_at);
-- One decision waits for a second sign-off at a time.
create unique index review_actions_one_pending_uq on app.review_actions (item_id)
  where status = 'pending_second';

alter table app.review_actions enable row level security;

create trigger review_actions_set_updated_at
  before update on app.review_actions
  for each row execute function app.set_updated_at();
