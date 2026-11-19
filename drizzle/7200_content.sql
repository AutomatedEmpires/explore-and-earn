-- SP8 W5: versioned legal documents and who accepted which version (SP8 spec section 4).
-- Help articles are W4's (drizzle/7150_content_help.sql, Plan decision 15); this file holds only
-- the legal tables. A document moves draft -> counsel_review -> approved -> scheduled ->
-- published, and the version it replaces becomes superseded. Only the founder's counsel
-- approval moves a draft past counsel_review; seeded drafts are never published by code.

create table app.legal_documents (
  id uuid primary key,
  slug text not null check (slug in (
    'terms', 'host-terms', 'privacy', 'cookies', 'community', 'fit-score', 'international',
    'subprocessors'
  )),
  version int not null check (version >= 1),
  title text not null,
  body_md text not null,
  summary_of_changes text not null default '',
  counsel_questions text not null default '',
  material boolean not null default true,
  status text not null default 'draft' check (status in (
    'draft', 'counsel_review', 'approved', 'scheduled', 'published', 'superseded'
  )),
  counsel_approved_at timestamptz,
  counsel_note text,
  effective_at timestamptz,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slug, version)
);

-- At most one published version of each document.
create unique index legal_documents_one_published_idx
  on app.legal_documents (slug)
  where status = 'published';

alter table app.legal_documents enable row level security;

create trigger legal_documents_set_updated_at
  before update on app.legal_documents
  for each row execute function app.set_updated_at();

-- Kept when an account is deleted: proof of what the person agreed to (legal_obligation).
create table app.legal_acceptances (
  id uuid primary key,
  user_id uuid not null references app.users,
  slug text not null,
  version int not null,
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug, version)
);

alter table app.legal_acceptances enable row level security;

create trigger legal_acceptances_set_updated_at
  before update on app.legal_acceptances
  for each row execute function app.set_updated_at();
