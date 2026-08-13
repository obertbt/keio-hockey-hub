create policy notifications_insert on public.notifications
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and created_by = app.current_profile_id()
  );

create or replace function app.owns_notification(p_notification_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notifications n
    where n.id = p_notification_id
      and n.created_by = app.current_profile_id()
  );
$$;

revoke all on function app.owns_notification(uuid) from public;
grant execute on function app.owns_notification(uuid) to authenticated;

create policy notification_targets_insert on public.notification_targets
  for insert to authenticated
  with check (
    app.owns_notification(notification_id)
    and exists (
      select 1
      from public.team_members tm
      where tm.id = notification_targets.team_member_id
        and tm.status = 'active'
        and tm.deleted_at is null
        and app.is_team_member(tm.team_id)
    )
  );

revoke update, delete on public.notifications from authenticated;
revoke delete on public.notification_targets from authenticated;

alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_missing', 'training_missing', 'general'));
