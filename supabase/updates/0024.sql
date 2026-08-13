create or replace function app.can_see_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.videos v
    where v.id = p_video_id
      and v.deleted_at is null
      and app.is_team_member(v.team_id)
      and (
        v.created_by = app.current_profile_id()
        or (v.visibility = 'team' and app.has_permission(v.team_id, 'video.view_team'))
        or app.has_permission(v.team_id, 'video.feedback_answer')
        or app.has_permission(v.team_id, 'storage.manage')
      )
  );
$$;

revoke all on function app.can_see_video(uuid) from public;
grant execute on function app.can_see_video(uuid) to authenticated;

create table if not exists public.video_comments (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  video_id      uuid not null references public.videos(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,

  parent_id     uuid references public.video_comments(id) on delete cascade,

  at_seconds    numeric(9, 2) check (at_seconds >= 0),

  body          text not null check (length(btrim(body)) > 0),

  visibility    text not null default 'staff'
                  check (visibility in ('staff', 'team')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  check (parent_id is null or at_seconds is null)
);

create index if not exists video_comments_video_idx
  on public.video_comments (video_id, at_seconds nulls first, created_at);
create index if not exists video_comments_parent_idx
  on public.video_comments (parent_id, created_at);

create trigger video_comments_set_updated_at
  before update on public.video_comments
  for each row execute function app.set_updated_at();

create table if not exists public.video_comment_mentions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  video_comment_id  uuid not null references public.video_comments(id) on delete cascade,
  team_member_id    uuid not null references public.team_members(id) on delete cascade,
  created_at        timestamptz not null default now(),

  unique (video_comment_id, team_member_id)
);

create index if not exists video_comment_mentions_member_idx
  on public.video_comment_mentions (team_member_id, created_at desc);

create or replace function app.validate_video_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team     uuid;
  v_duration numeric;
  v_parent   public.video_comments;
begin
  select team_id, duration_seconds into v_team, v_duration
  from public.videos where id = new.video_id;

  if v_team is null then
    raise exception '対象の動画が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの動画には書き込めません';
  end if;

  if new.at_seconds is not null and v_duration is not null and new.at_seconds > v_duration then
    raise exception '動画の長さ（%秒）を超えています', v_duration;
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.video_comments where id = new.parent_id;
    if v_parent.id is null then
      raise exception '返信先の書き込みが見つかりません';
    end if;
    if v_parent.video_id <> new.video_id then
      raise exception '別の動画の書き込みには返信できません';
    end if;
    if v_parent.parent_id is not null then
      raise exception '返信への返信はできません。同じ書き込みに返してください';
    end if;
    new.visibility := v_parent.visibility;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists video_comments_validate on public.video_comments;
create trigger video_comments_validate
  before insert or update on public.video_comments
  for each row execute function app.validate_video_comment();

create or replace function app.validate_video_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment_team uuid;
  v_member_team  uuid;
begin
  select team_id into v_comment_team from public.video_comments where id = new.video_comment_id;
  select team_id into v_member_team from public.team_members where id = new.team_member_id;

  if v_comment_team is null or v_member_team is null then
    raise exception '宛先の指定が正しくありません';
  end if;
  if v_comment_team <> new.team_id or v_member_team <> new.team_id then
    raise exception '別のチームの人は宛先にできません';
  end if;

  return new;
end;
$$;

drop trigger if exists video_comment_mentions_validate on public.video_comment_mentions;
create trigger video_comment_mentions_validate
  before insert on public.video_comment_mentions
  for each row execute function app.validate_video_comment_mention();

alter table public.video_comments enable row level security;
alter table public.video_comment_mentions enable row level security;

create or replace function app.is_mentioned_in_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.video_comment_mentions m
    join public.team_members tm on tm.id = m.team_member_id
    where m.video_comment_id = p_comment_id
      and tm.profile_id = app.current_profile_id()
  );
$$;

revoke all on function app.is_mentioned_in_comment(uuid) from public;
grant execute on function app.is_mentioned_in_comment(uuid) to authenticated;

drop policy if exists video_comments_select on public.video_comments;
create policy video_comments_select on public.video_comments
  for select to authenticated
  using (
    deleted_at is null
    and app.can_see_video(video_id)
    and (
      author_id = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.is_mentioned_in_comment(id)
    )
  );

drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and app.can_see_video(video_id)
    and author_id = app.current_profile_id()
  );

drop policy if exists video_comments_update on public.video_comments;
create policy video_comments_update on public.video_comments
  for update to authenticated
  using (deleted_at is null and author_id = app.current_profile_id())
  with check (author_id = app.current_profile_id());

drop policy if exists video_comment_mentions_select on public.video_comment_mentions;
create policy video_comment_mentions_select on public.video_comment_mentions
  for select to authenticated
  using (
    exists (
      select 1 from public.video_comments c
      where c.id = video_comment_id and c.deleted_at is null
    )
    and app.is_team_member(team_id)
  );

drop policy if exists video_comment_mentions_insert on public.video_comment_mentions;
create policy video_comment_mentions_insert on public.video_comment_mentions
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and exists (
      select 1 from public.video_comments c
      where c.id = video_comment_id
        and c.author_id = app.current_profile_id()
    )
  );

grant select, insert, update on public.video_comments to authenticated;
grant select, insert, delete on public.video_comment_mentions to authenticated;

create or replace function public.soft_delete_video_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.video_comments;
begin
  select * into v_row from public.video_comments
  where id = p_comment_id and deleted_at is null;

  if v_row.id is null then
    raise exception '対象の書き込みが見つかりません';
  end if;

  if v_row.author_id <> app.current_profile_id() then
    raise exception '自分が書いたものだけ消せます';
  end if;

  update public.video_comments
  set deleted_at = now()
  where id = p_comment_id or parent_id = p_comment_id;
end;
$$;

revoke all on function public.soft_delete_video_comment(uuid) from public;
grant execute on function public.soft_delete_video_comment(uuid) to authenticated;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_commented',
    'video_commented', 'video_mentioned',
    'report_missing', 'training_missing', 'general'));
