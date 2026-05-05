-- ============================================================
--  Ace Paste Cleaner Pro — Supabase schema
--  Run this in the Supabase SQL editor (Dashboard → SQL → New query)
-- ============================================================

-- 1. Subscriptions table
-- One row per user. plan is updated by the stripe-webhook edge function.
create table if not exists public.subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  plan            text not null default 'free'
                    check (plan in ('free','trial','monthly','yearly','lifetime')),
  stripe_customer_id   text,
  stripe_subscription_id text,  -- null for trial/lifetime (one-time payments)
  trial_ends_at   timestamptz,   -- for 1-day trial only
  period_ends_at  timestamptz,   -- for monthly/yearly subscriptions
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint subscriptions_user_id_unique unique (user_id)
);

-- Auto-update updated_at on modification
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists subscriptions_updated_at on public.subscriptions;
create trigger subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

-- Row-Level Security: users can only read their own row
alter table public.subscriptions enable row level security;

create policy "Users can read own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Service role (edge functions) can do anything
create policy "Service role full access"
  on public.subscriptions for all
  using (auth.role() = 'service_role');

-- 2. Restore-purchase rate-limiting table
create table if not exists public.restore_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  receipt_email text not null,
  attempted_at  timestamptz not null default now()
);
alter table public.restore_attempts enable row level security;
create policy "Service role only" on public.restore_attempts for all using (auth.role() = 'service_role');
create index on public.restore_attempts (user_id, attempted_at desc);

-- 3. Helper RPC for webhook: look up user ID by email (service-role only)
create or replace function public.get_user_id_by_email(email_input text)
returns table (id uuid) language sql security definer as $$
  select id from auth.users where email = email_input limit 1;
$$;
revoke all on function public.get_user_id_by_email(text) from public;
grant execute on function public.get_user_id_by_email(text) to service_role;

-- 3. Create a free-plan row automatically on user signup
create or replace function public.on_user_created()
returns trigger language plpgsql security definer as $$
begin
  insert into public.subscriptions (user_id, plan)
  values (new.id, 'free')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.on_user_created();
