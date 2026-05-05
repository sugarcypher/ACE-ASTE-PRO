-- ============================================================
--  Ace Paste — Manual lifetime access grants
--  Run in Supabase SQL editor (Dashboard → SQL → New query)
--
--  Handles two cases:
--    A. Emails that already have a Supabase account → upsert immediately
--    B. Emails that sign up later → trigger auto-grants lifetime on signup
-- ============================================================

-- 1. Whitelist table (add more emails here anytime)
create table if not exists public.lifetime_grant_emails (
  email text primary key,
  granted_at timestamptz not null default now(),
  note text
);

-- Only the service role can read/write this table
alter table public.lifetime_grant_emails enable row level security;

create policy "Service role only"
  on public.lifetime_grant_emails for all
  using (auth.role() = 'service_role');

-- 2. Seed the whitelist
insert into public.lifetime_grant_emails (email, note) values
  ('nuumoxx@icloud.com',  'founder grant'),
  ('13531nxt@gmail.com',  'founder grant'),
  ('b@twl.today',         'founder grant')
on conflict (email) do nothing;

-- 3. Grant lifetime to any of these emails that already have accounts
update public.subscriptions s
set    plan = 'lifetime', updated_at = now()
from   auth.users u
join   public.lifetime_grant_emails g on g.email = u.email
where  s.user_id = u.id
  and  s.plan <> 'lifetime';

-- 4. Update the on_user_created trigger to auto-grant on future signups
create or replace function public.on_user_created()
returns trigger language plpgsql security definer as $$
declare
  v_plan text := 'free';
begin
  -- Check lifetime whitelist
  if exists (
    select 1 from public.lifetime_grant_emails
    where email = new.email
  ) then
    v_plan := 'lifetime';
  end if;

  insert into public.subscriptions (user_id, plan)
  values (new.id, v_plan)
  on conflict (user_id) do update set plan = v_plan, updated_at = now();

  return new;
end;
$$;
