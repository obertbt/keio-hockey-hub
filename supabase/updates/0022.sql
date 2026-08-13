/**
 * その日報が、いまの利用者に見えるか。
 *
 * daily_reports のポリシーと同じ規則。
 * ここを直したら、あちらも直すこと。
 */
create or replace function app.can_see_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.daily_reports r
    where r.id = p_report_id
      and r.deleted_at is null
      and (
        app.is_own_member(r.team_member_id)
        or (r.visibility in ('staff', 'team') and app.has_permission(r.team_id, 'report.view_all'))
        or (r.visibility = 'team' and app.is_team_member(r.team_id))
      )
  );
$$;

revoke all on function app.can_see_report(uuid) from public;
grant execute on function app.can_see_report(uuid) to authenticated;

drop policy if exists report_feedbacks_select on public.report_feedbacks;
create policy report_feedbacks_select on public.report_feedbacks
  for select to authenticated
  using (deleted_at is null and app.can_see_report(daily_report_id));

drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (
    deleted_at is null
    and app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
  )
  with check (
    app.has_permission(team_id, 'report.view_all')
    and app.can_see_report(daily_report_id)
    and author_id = app.current_profile_id()
  );

create or replace function app.validate_report_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team uuid;
begin
  select team_id into v_team from public.daily_reports where id = new.daily_report_id;
  if v_team is null then
    raise exception '対象の日報が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの日報にはコメントできません';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_feedbacks_validate on public.report_feedbacks;
create trigger report_feedbacks_validate
  before insert or update on public.report_feedbacks
  for each row execute function app.validate_report_feedback();

create or replace function public.soft_delete_report_feedback(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_feedbacks;
begin
  select * into v_row from public.report_feedbacks where id = p_feedback_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象のコメントが見つかりません';
  end if;

  if v_row.author_id <> app.current_profile_id() then
    raise exception '自分が書いたコメントだけ消せます';
  end if;

  update public.report_feedbacks set deleted_at = now() where id = p_feedback_id;
end;
$$;

revoke all on function public.soft_delete_report_feedback(uuid) from public;
grant execute on function public.soft_delete_report_feedback(uuid) to authenticated;

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
    'report_missing', 'training_missing', 'general'));
