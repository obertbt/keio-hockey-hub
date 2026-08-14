-- =============================================================
-- 0029_current_session.sql
-- ログインしている人の「素性」を、1回の問い合わせで返す。
--
-- なぜ:
--   画面を1枚出すたびに、こちらは3回に分けて聞いていた。
--     1. profiles      … あなたは誰か
--     2. team_members  … どのチームの、どの立場か
--     3. member_permissions … 個別に足された/外された権限
--   3つは前のこたえが無いと次を聞けないので、順番待ちになる。
--   ここが往復3回ぶん、そのまま待ち時間になっていた。
--
--   1回で返せば、往復は1回で済む。
--   スマートフォンの回線だと、この差がそのまま「重い」になる。
--
-- 注意:
--   security definer なので RLS を通らない。
--   **必ず auth.uid() から辿ること。** 引数で誰かを指定できるようにすると、
--   他人の素性を引ける関数になってしまう。引数は取らない。
-- =============================================================

create or replace function public.current_session()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select p.id, p.user_id, p.full_name, p.display_name, p.email, p.avatar_url
    from public.profiles p
    where p.user_id = auth.uid()
      and p.deleted_at is null
    limit 1
  ),
  membership as (
    -- 在籍中の所属を1件。将来チームを複数持つときは、ここで選ばせる。
    select tm.id, tm.team_id, tm.role_code, t.display_name as team_name
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.profile_id = (select id from me)
      and tm.status = 'active'
      and tm.deleted_at is null
    order by tm.created_at
    limit 1
  )
  select case
    when (select id from membership) is null then null
    else jsonb_build_object(
      'user_id',        (select user_id from me),
      'profile_id',     (select id from me),
      'full_name',      (select full_name from me),
      'display_name',   (select display_name from me),
      'email',          (select email from me),
      'avatar_url',     (select avatar_url from me),
      'team_id',        (select team_id from membership),
      'team_name',      (select team_name from membership),
      'team_member_id', (select id from membership),
      'role',           (select role_code from membership),
      -- 上書きが1件も無いことのほうが多い。そのときは空の入れ物を返す。
      'overrides',      coalesce(
                          (
                            select jsonb_object_agg(mp.permission_code, mp.granted)
                            from public.member_permissions mp
                            where mp.team_member_id = (select id from membership)
                          ),
                          '{}'::jsonb
                        )
    )
  end;
$$;

-- ログインしていない人には実行させない
revoke all on function public.current_session() from public;
grant execute on function public.current_session() to authenticated;
