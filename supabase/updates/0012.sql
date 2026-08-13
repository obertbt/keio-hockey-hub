drop policy if exists videos_select on public.videos;

create policy videos_select on public.videos
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      created_by = app.current_profile_id()
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.has_permission(team_id, 'storage.manage')
    )
  );

drop policy if exists files_select on public.files;

create policy files_select on public.files
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and (
      uploaded_by = app.current_profile_id()
      or (visibility = 'team' and app.has_permission(team_id, 'video.view_team'))
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.has_permission(team_id, 'storage.manage')
    )
  );

drop policy if exists video_clips_select on public.video_clips;

create policy video_clips_select on public.video_clips
  for select to authenticated
  using (
    deleted_at is null
    and app.is_team_member(team_id)
    and exists (
      select 1 from public.videos v where v.id = video_clips.video_id
    )
  );
