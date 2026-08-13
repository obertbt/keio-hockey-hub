create table if not exists public.member_goals (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  team_member_id    uuid not null references public.team_members(id) on delete cascade,
  skill_category_id uuid references public.skill_categories(id) on delete set null,

  name              text not null check (length(btrim(name)) > 0 and length(name) <= 100),
  note              text check (note is null or length(note) <= 1000),

  achieved_at       timestamptz,

  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  unique (team_member_id, name)
);

create index if not exists member_goals_member_idx
  on public.member_goals (team_member_id, achieved_at nulls first, sort_order);
create index if not exists member_goals_category_idx
  on public.member_goals (skill_category_id);

create trigger member_goals_set_updated_at
  before update on public.member_goals
  for each row execute function app.set_updated_at();

create table if not exists public.goal_tags (
  id               uuid primary key default gen_random_uuid(),
  team_id          uuid not null references public.teams(id) on delete cascade,
  member_goal_id   uuid not null references public.member_goals(id) on delete cascade,

  target_type      text not null check (target_type in ('daily_report', 'video_comment')),
  daily_report_id  uuid references public.daily_reports(id) on delete cascade,
  video_comment_id uuid references public.video_comments(id) on delete cascade,

  created_by       uuid not null references public.profiles(id) on delete cascade,
  created_at       timestamptz not null default now(),

  check (
    (target_type = 'daily_report'  and daily_report_id  is not null and video_comment_id is null)
    or
    (target_type = 'video_comment' and video_comment_id is not null and daily_report_id  is null)
  )
);

create unique index if not exists goal_tags_report_unique
  on public.goal_tags (member_goal_id, daily_report_id)
  where daily_report_id is not null;
create unique index if not exists goal_tags_comment_unique
  on public.goal_tags (member_goal_id, video_comment_id)
  where video_comment_id is not null;

create index if not exists goal_tags_goal_idx on public.goal_tags (member_goal_id, created_at desc);
create index if not exists goal_tags_report_idx on public.goal_tags (daily_report_id);
create index if not exists goal_tags_comment_idx on public.goal_tags (video_comment_id);

create or replace function app.validate_member_goal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team   uuid;
  v_category_team uuid;
begin
  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員に目標は作れません';
  end if;

  if new.skill_category_id is not null then
    select team_id into v_category_team
    from public.skill_categories where id = new.skill_category_id;

    if v_category_team is null then
      raise exception '大分類が見つかりません';
    end if;
    if v_category_team <> new.team_id then
      raise exception '別のチームの大分類は使えません';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists member_goals_validate on public.member_goals;
create trigger member_goals_validate
  before insert or update on public.member_goals
  for each row execute function app.validate_member_goal();

create or replace function app.validate_goal_tag()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_goal        public.member_goals;
  v_target_team uuid;
  v_owner       uuid;
begin
  select * into v_goal from public.member_goals
  where id = new.member_goal_id and deleted_at is null;

  if v_goal.id is null then
    raise exception '対象の目標が見つかりません';
  end if;
  if v_goal.team_id <> new.team_id then
    raise exception '別のチームの目標は付けられません';
  end if;

  select profile_id into v_owner from public.team_members where id = v_goal.team_member_id;
  if v_owner is distinct from app.current_profile_id() then
    raise exception '自分の目標だけ付けられます';
  end if;

  if new.target_type = 'daily_report' then
    select team_id into v_target_team from public.daily_reports where id = new.daily_report_id;
  else
    select team_id into v_target_team from public.video_comments where id = new.video_comment_id;
  end if;

  if v_target_team is null then
    raise exception '付ける先が見つかりません';
  end if;
  if v_target_team <> new.team_id then
    raise exception '別のチームの記録には付けられません';
  end if;

  return new;
end;
$$;

drop trigger if exists goal_tags_validate on public.goal_tags;
create trigger goal_tags_validate
  before insert or update on public.goal_tags
  for each row execute function app.validate_goal_tag();

alter table public.member_goals enable row level security;
alter table public.goal_tags enable row level security;

drop policy if exists member_goals_select on public.member_goals;
create policy member_goals_select on public.member_goals
  for select to authenticated
  using (
    deleted_at is null
    and (
      app.is_own_member(team_member_id)
      or app.has_permission(team_id, 'report.view_all')
    )
  );

drop policy if exists member_goals_own_write on public.member_goals;
create policy member_goals_own_write on public.member_goals
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_team_member(team_id) and app.is_own_member(team_member_id));

drop policy if exists goal_tags_select on public.goal_tags;
create policy goal_tags_select on public.goal_tags
  for select to authenticated
  using (
    exists (
      select 1 from public.member_goals g
      where g.id = member_goal_id and g.deleted_at is null
    )
  );

drop policy if exists goal_tags_own_write on public.goal_tags;
create policy goal_tags_own_write on public.goal_tags
  for all to authenticated
  using (created_by = app.current_profile_id())
  with check (app.is_team_member(team_id) and created_by = app.current_profile_id());

grant select, insert, update, delete on public.member_goals to authenticated;
grant select, insert, delete on public.goal_tags to authenticated;

create or replace function public.soft_delete_member_goal(p_goal_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_goal  public.member_goals;
  v_owner uuid;
begin
  select * into v_goal from public.member_goals
  where id = p_goal_id and deleted_at is null;

  if v_goal.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  select profile_id into v_owner from public.team_members where id = v_goal.team_member_id;
  if v_owner is distinct from app.current_profile_id() then
    raise exception '自分の目標だけ消せます';
  end if;

  update public.member_goals set deleted_at = now() where id = p_goal_id;
  delete from public.goal_tags where member_goal_id = p_goal_id;
end;
$$;

revoke all on function public.soft_delete_member_goal(uuid) from public;
grant execute on function public.soft_delete_member_goal(uuid) to authenticated;

create or replace function public.merge_member_goal(p_from_goal_id uuid, p_into_goal_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from  public.member_goals;
  v_into  public.member_goals;
  v_owner uuid;
  v_moved integer;
begin
  if p_from_goal_id = p_into_goal_id then
    raise exception '同じ目標にはまとめられません';
  end if;

  select * into v_from from public.member_goals where id = p_from_goal_id and deleted_at is null;
  select * into v_into from public.member_goals where id = p_into_goal_id and deleted_at is null;

  if v_from.id is null or v_into.id is null then
    raise exception '対象の目標が見つかりません';
  end if;
  if v_from.team_member_id <> v_into.team_member_id then
    raise exception '別の人の目標とはまとめられません';
  end if;

  select profile_id into v_owner from public.team_members where id = v_from.team_member_id;
  if v_owner is distinct from app.current_profile_id() then
    raise exception '自分の目標だけまとめられます';
  end if;

  delete from public.goal_tags t
  where t.member_goal_id = p_from_goal_id
    and exists (
      select 1 from public.goal_tags o
      where o.member_goal_id = p_into_goal_id
        and o.daily_report_id is not distinct from t.daily_report_id
        and o.video_comment_id is not distinct from t.video_comment_id
    );

  update public.goal_tags set member_goal_id = p_into_goal_id where member_goal_id = p_from_goal_id;
  get diagnostics v_moved = row_count;

  update public.member_goals set deleted_at = now() where id = p_from_goal_id;

  return v_moved;
end;
$$;

revoke all on function public.merge_member_goal(uuid, uuid) from public;
grant execute on function public.merge_member_goal(uuid, uuid) to authenticated;

create or replace function public.member_goal_activity(p_team_member_id uuid)
returns table (
  member_goal_id uuid,
  tag_count      integer,
  last_tagged_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select g.id, count(t.id)::integer, max(t.created_at)
  from public.member_goals g
  left join public.goal_tags t on t.member_goal_id = g.id
  where g.team_member_id = p_team_member_id
    and g.deleted_at is null
  group by g.id;
$$;

revoke all on function public.member_goal_activity(uuid) from public;
grant execute on function public.member_goal_activity(uuid) to authenticated;
