/**
 * ある日の提出状況（12章）。
 *
 * **返すのは「出したかどうか」だけ。中身は返さない。**
 *
 * 読める日報だけ readable_report_id が入る。
 * 「自分だけ」の日報は submitted_report = true だが id は null。
 * つまりコーチは「出したことは分かるが、開けない」。
 *
 * ここを直したら daily_reports のポリシーと
 * app.can_see_report()（0022）も見ること。3つは同じ規則の上にある。
 */
create or replace function public.list_submission_status(p_team_id uuid, p_date date)
returns table (
  team_member_id uuid,
  submitted_condition boolean,
  submitted_report boolean,
  submitted_training boolean,
  readable_report_id uuid,
  report_is_private boolean,
  training_is_private boolean
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_team_id, 'report.view_all') then
    raise exception '提出状況を見る権限がありません';
  end if;

  return query
  select
    m.id,
    exists (
      select 1 from public.daily_conditions c
      where c.team_member_id = m.id and c.recorded_on = p_date and c.deleted_at is null
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
    ),
    (
      select r.id from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility in ('staff', 'team')
      order by r.submitted_at desc nulls last
      limit 1
    ),
    exists (
      select 1 from public.daily_reports r
      where r.team_member_id = m.id and r.report_date = p_date
        and r.status = 'submitted' and r.deleted_at is null
        and r.visibility = 'private'
    ),
    exists (
      select 1 from public.training_records t
      where t.team_member_id = m.id and t.performed_on = p_date and t.deleted_at is null
        and t.visibility = 'private'
    )
  from public.team_members m
  where m.team_id = p_team_id
    and m.role_code = 'player'
    and m.status = 'active'
    and m.deleted_at is null;
end;
$$;

revoke all on function public.list_submission_status(uuid, date) from public;
grant execute on function public.list_submission_status(uuid, date) to authenticated;
