drop policy if exists team_members_staff_write on public.team_members;
create policy team_members_staff_write on public.team_members
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

drop policy if exists seasons_staff_write on public.seasons;
create policy seasons_staff_write on public.seasons
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists season_goals_staff_write on public.season_goals;
create policy season_goals_staff_write on public.season_goals
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists milestones_staff_write on public.milestones;
create policy milestones_staff_write on public.milestones
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists competitions_staff_write on public.competitions;
create policy competitions_staff_write on public.competitions
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists weeks_staff_write on public.weeks;
create policy weeks_staff_write on public.weeks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists events_staff_write on public.events;
create policy events_staff_write on public.events
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'event.manage'))
  with check (app.has_permission(team_id, 'event.manage'));

drop policy if exists daily_conditions_own on public.daily_conditions;
create policy daily_conditions_own on public.daily_conditions
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists practice_goals_own on public.practice_goals;
create policy practice_goals_own on public.practice_goals
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists daily_reports_own on public.daily_reports;
create policy daily_reports_own on public.daily_reports
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
create policy report_feedbacks_staff_write on public.report_feedbacks
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'report.view_all'))
  with check (app.has_permission(team_id, 'report.view_all'));

drop policy if exists training_records_own on public.training_records;
create policy training_records_own on public.training_records
  for all to authenticated
  using (deleted_at is null and app.is_own_member(team_member_id))
  with check (app.is_own_member(team_member_id));

drop policy if exists video_clips_write on public.video_clips;
create policy video_clips_write on public.video_clips
  for all to authenticated
  using (deleted_at is null and (created_by = app.current_profile_id() or app.is_staff(team_id)))
  with check (created_by = app.current_profile_id() and app.is_team_member(team_id));

drop policy if exists skill_categories_staff_write on public.skill_categories;
create policy skill_categories_staff_write on public.skill_categories
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skills_staff_write on public.skills;
create policy skills_staff_write on public.skills
  for all to authenticated
  using (deleted_at is null and app.has_permission(team_id, 'skill.review'))
  with check (app.has_permission(team_id, 'skill.review'));

drop policy if exists skill_applications_own_write on public.skill_applications;
create policy skill_applications_own_write on public.skill_applications
  for all to authenticated
  using (
    deleted_at is null
    and (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'))
  )
  with check (app.is_own_member(team_member_id) or app.has_permission(team_id, 'skill.review'));

drop policy if exists measurement_events_staff_write on public.measurement_events;
create policy measurement_events_staff_write on public.measurement_events
  for all to authenticated
  using (deleted_at is null and app.is_staff(team_id))
  with check (app.is_staff(team_id));

/** 自分のトレーニング記録を消す（Phase 4 の deleteTrainingRecord から呼ぶ）。 */
create or replace function public.soft_delete_training_record(p_record_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.training_records;
begin
  select * into v_row from public.training_records where id = p_record_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の記録が見つかりません';
  end if;

  if not app.is_own_member(v_row.team_member_id) then
    raise exception 'この記録を削除する権限がありません';
  end if;

  update public.training_records set deleted_at = now() where id = p_record_id;
end;
$$;

revoke all on function public.soft_delete_training_record(uuid) from public;
grant execute on function public.soft_delete_training_record(uuid) to authenticated;

/**
 * スキル定義（中目標・小目標）を消す（30章）。
 *
 * すでに誰かが申請・到達している目標は消さない。
 * 記録が宙に浮くと、選手の積み上げが無かったことになる。
 */
create or replace function public.soft_delete_skill(p_skill_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.skills;
begin
  select * into v_row from public.skills where id = p_skill_id and deleted_at is null;
  if v_row.id is null then
    raise exception '対象の目標が見つかりません';
  end if;

  if not app.has_permission(v_row.team_id, 'skill.review') then
    raise exception 'スキル定義を変えられるのは審査担当だけです';
  end if;

  if exists (select 1 from public.player_skills where skill_id = p_skill_id and deleted_at is null) then
    raise exception 'すでに申請・承認のある目標は消せません';
  end if;

  if exists (select 1 from public.skills where parent_id = p_skill_id and deleted_at is null) then
    raise exception '下に小目標があります。先にそちらを消してください';
  end if;

  update public.skills set deleted_at = now() where id = p_skill_id;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_row.team_id, app.current_profile_id(), 'skill.delete', 'skills', p_skill_id, v_row.name);
end;
$$;

revoke all on function public.soft_delete_skill(uuid) from public;
grant execute on function public.soft_delete_skill(uuid) to authenticated;
