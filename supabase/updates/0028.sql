create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,

  endpoint       text not null,
  p256dh         text not null,
  auth           text not null,

  label          text,

  last_success_at timestamptz,
  failure_count  int not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  unique (endpoint)
);

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (team_member_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function app.set_updated_at();

create or replace function app.validate_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員には登録できません';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_validate on public.push_subscriptions;
create trigger push_subscriptions_validate
  before insert or update on public.push_subscriptions
  for each row execute function app.validate_push_subscription();

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_team_member(team_id) and app.is_own_member(team_member_id));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

create or replace function public.list_push_targets(p_team_member_ids uuid[])
returns table (
  subscription_id uuid,
  team_member_id  uuid,
  endpoint        text,
  p256dh          text,
  auth            text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.team_member_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.team_member_id = any(p_team_member_ids);
$$;

revoke all on function public.list_push_targets(uuid[]) from public;

create or replace function public.drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.drop_push_subscription(text) from public;

create or replace function public.record_push_result(p_endpoint text, p_ok boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_subscriptions
  set last_success_at = case when p_ok then now() else last_success_at end,
      failure_count   = case when p_ok then 0 else failure_count + 1 end
  where endpoint = p_endpoint;
$$;

revoke all on function public.record_push_result(text, boolean) from public;
