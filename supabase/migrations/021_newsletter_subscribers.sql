-- 021_newsletter_subscribers.sql
--
-- Newsletter / journal subscribers.
--
-- Surface in the footer: "Occasional releases and editorial updates."
-- Deliberately minimal — no preference categories, no double opt-in
-- flag (we're not legally required to in India for our own first-party
-- channel; revisit if expanding to EU/UK).
--
-- The email column is uniquely indexed but case-insensitive so
-- 'Hello@x.com' and 'hello@x.com' don't both subscribe.
--
-- The `source` column lets us slice acquisition (footer / about /
-- product / etc.) later without a backfill.
--
-- RLS: only service-role writes (via the API route). No client-side
-- selects — there is nothing here that should be readable from the
-- browser.

create table if not exists public.newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext not null,
  source text not null default 'footer',
  user_agent text,
  created_at timestamptz not null default now(),
  unsubscribed_at timestamptz
);

-- citext is in the standard extensions list on Supabase. If it's not
-- enabled the create extension below makes the column type valid.
create extension if not exists citext;

-- Recreate the column with citext if the table existed before this
-- extension was added (defensive; usually a no-op on fresh installs).
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsletter_subscribers'
      and column_name = 'email'
      and udt_name <> 'citext'
  ) then
    alter table public.newsletter_subscribers
      alter column email type citext using email::citext;
  end if;
end$$;

create unique index if not exists newsletter_subscribers_email_unique
  on public.newsletter_subscribers (email)
  where unsubscribed_at is null;

create index if not exists newsletter_subscribers_created_at_idx
  on public.newsletter_subscribers (created_at desc);

-- Lock the table down. Service-role bypasses RLS by design; everyone
-- else gets nothing.
alter table public.newsletter_subscribers enable row level security;

-- No policies = deny-by-default for anon/authenticated. Intentional.
-- The /api/newsletter/subscribe handler runs with the service role.
