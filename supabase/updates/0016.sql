create or replace function app.require_storage_manage(p_team_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.has_permission(p_team_id, 'storage.manage') then
    raise exception '保存容量を管理する権限がありません';
  end if;
end;
$$;

revoke all on function app.require_storage_manage(uuid) from public;
grant execute on function app.require_storage_manage(uuid) to authenticated;

create or replace function public.capture_storage_usage(p_team_id uuid)
returns public.storage_usage_snapshots
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := (now() at time zone 'Asia/Tokyo')::date;
  v_row   public.storage_usage_snapshots;
begin
  perform app.require_storage_manage(p_team_id);

  insert into public.storage_usage_snapshots (
    team_id, captured_on, total_bytes, video_bytes, image_bytes, pdf_bytes,
    temp_bytes, deleted_bytes, file_count
  )
  select
    p_team_id,
    v_today,
    coalesce(sum(f.size_bytes), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'video'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'image'), 0),
    coalesce(sum(f.size_bytes) filter (where f.media_type = 'pdf'), 0),
    coalesce(sum(f.size_bytes) filter (where f.storage_key like '%/tmp/%'), 0),
    coalesce(sum(f.size_bytes) filter (where f.deleted_at is not null and f.upload_status <> 'deleted'), 0),
    count(*)
  from public.files f
  where f.team_id = p_team_id
    and f.upload_status <> 'deleted'
  on conflict (team_id, captured_on) do update
    set total_bytes   = excluded.total_bytes,
        video_bytes   = excluded.video_bytes,
        image_bytes   = excluded.image_bytes,
        pdf_bytes     = excluded.pdf_bytes,
        temp_bytes    = excluded.temp_bytes,
        deleted_bytes = excluded.deleted_bytes,
        file_count    = excluded.file_count
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.capture_storage_usage(uuid) from public;
grant execute on function public.capture_storage_usage(uuid) to authenticated;

create or replace function public.complete_file_deletion(p_job_id uuid, p_error text default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_job     public.file_deletion_jobs;
  v_key     text;
begin
  select * into v_job from public.file_deletion_jobs where id = p_job_id;
  if v_job.id is null then
    raise exception '対象の削除予約が見つかりません';
  end if;

  perform app.require_storage_manage(v_job.team_id);

  if p_error is not null then
    update public.file_deletion_jobs
      set status = 'failed', attempted_at = now(), error_message = left(p_error, 500)
      where id = p_job_id;
    return;
  end if;

  update public.file_deletion_jobs
    set status = 'done', attempted_at = now(), error_message = null
    where id = p_job_id;

  update public.files
    set upload_status = 'deleted'
    where id = v_job.file_id
    returning storage_key into v_key;

  insert into public.audit_logs (team_id, actor_id, action, target_table, target_id, summary)
  values (v_job.team_id, app.current_profile_id(), 'file.hard_delete', 'files', v_job.file_id,
          coalesce(v_key, '(不明)'));
end;
$$;

revoke all on function public.complete_file_deletion(uuid, text) from public;
grant execute on function public.complete_file_deletion(uuid, text) to authenticated;

create or replace function public.expire_stale_uploads(p_team_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform app.require_storage_manage(p_team_id);

  update public.upload_sessions
    set status = 'failed', failure_reason = '期限切れ（自動整理）'
    where team_id = p_team_id
      and status in ('pending', 'uploading', 'uploaded', 'verifying')
      and expires_at < now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.expire_stale_uploads(uuid) from public;
grant execute on function public.expire_stale_uploads(uuid) to authenticated;

revoke insert, update, delete on public.storage_usage_snapshots from authenticated;
