-- =============================================================
-- youtube_test.sql
-- チャンネル連携の鍵の守り（0025）。
--
--   * 更新トークンは、ログインした利用者から**読めない**
--   * 管理者でも読めない（画面から鍵を見る用は無い）
--   * 書き込みもできない
--   * 状況（つながっているか）はスタッフだけが見られる
--   * 選手は状況も見られない
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a1b10000-0000-0000-0000-000000000001', 'yt-admin@example.com'),
  ('a1b10000-0000-0000-0000-000000000002', 'yt-player@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b1c10000-0000-0000-0000-00000000000a', 'yt-team', '連携テスト部', 'yt-team');

insert into public.profiles (id, user_id, full_name) values
  ('c1d10000-0000-0000-0000-000000000001', 'a1b10000-0000-0000-0000-000000000001', '管理者'),
  ('c1d10000-0000-0000-0000-000000000002', 'a1b10000-0000-0000-0000-000000000002', '選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d1e10000-0000-0000-0000-000000000001', 'b1c10000-0000-0000-0000-00000000000a', 'c1d10000-0000-0000-0000-000000000001', 'system_admin'),
  ('d1e10000-0000-0000-0000-000000000002', 'b1c10000-0000-0000-0000-00000000000a', 'c1d10000-0000-0000-0000-000000000002', 'player');

-- サーバ側（service role 相当）として、つないだ状態を作る
insert into public.youtube_connections
  (team_id, channel_id, channel_title, uploads_playlist_id, refresh_token, connected_by)
values
  ('b1c10000-0000-0000-0000-00000000000a', 'UC_test', '慶應ホッケー部', 'UU_test',
   '1//とても大事な鍵', 'c1d10000-0000-0000-0000-000000000001');

create or replace function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function pg_temp.check(p_label text, p_actual bigint, p_expected bigint)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'NG: % (期待 %, 実際 %)', p_label, p_expected, p_actual;
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. 鍵は誰からも読めない
-- -------------------------------------------------------------
select pg_temp.login('a1b10000-0000-0000-0000-000000000001');  -- 管理者
do $$
begin
  begin
    perform * from public.youtube_connections;
    raise exception 'NG: 管理者が鍵の表を読めてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 管理者でも鍵の表は読めない（権限なし）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 管理者でも鍵の表は読めない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('a1b10000-0000-0000-0000-000000000002');  -- 選手
do $$
begin
  begin
    perform * from public.youtube_connections;
    raise exception 'NG: 選手が鍵の表を読めてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 選手も鍵の表は読めない（権限なし）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 選手も鍵の表は読めない（%）', sqlerrm;
  end;
end;
$$;

-- 書き込みもできない
select pg_temp.login('a1b10000-0000-0000-0000-000000000001');
do $$
begin
  begin
    insert into public.youtube_connections
      (team_id, channel_id, refresh_token, connected_by)
    values ('b1c10000-0000-0000-0000-00000000000a', 'UC_evil', 'にせの鍵',
            'c1d10000-0000-0000-0000-000000000001');
    raise exception 'NG: 画面から鍵を差し込めてしまった';
  exception
    when insufficient_privilege then
      raise notice 'ok: 画面から鍵を差し込めない（権限なし）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 画面から鍵を差し込めない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 2. 状況はスタッフだけが見られる（鍵は返さない）
-- -------------------------------------------------------------
select pg_temp.check('スタッフは状況を見られる',
  (select count(*) from public.youtube_connection_status('b1c10000-0000-0000-0000-00000000000a')
   where connected), 1);

select pg_temp.check('チャンネル名は返る',
  (select count(*) from public.youtube_connection_status('b1c10000-0000-0000-0000-00000000000a')
   where channel_title = '慶應ホッケー部'), 1);

select pg_temp.login('a1b10000-0000-0000-0000-000000000002');  -- 選手
do $$
begin
  begin
    perform * from public.youtube_connection_status('b1c10000-0000-0000-0000-00000000000a');
    raise exception 'NG: 選手が接続状況を見られてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 選手は接続状況を見られない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. つないでいないチームは、つながっていないと返る
-- -------------------------------------------------------------
-- 準備なので、ここは素の権限で作る（RLS の確認はこの節の目的ではない）
reset role;
insert into public.teams (id, name, display_name, slug) values
  ('b1c10000-0000-0000-0000-00000000000b', 'yt-none', 'まだの部', 'yt-none');
insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d1e10000-0000-0000-0000-000000000003', 'b1c10000-0000-0000-0000-00000000000b',
   'c1d10000-0000-0000-0000-000000000001', 'system_admin');
set local role authenticated;

select pg_temp.login('a1b10000-0000-0000-0000-000000000001');
select pg_temp.check('つないでいなければ false が返る（例外にしない）',
  (select count(*) from public.youtube_connection_status('b1c10000-0000-0000-0000-00000000000b')
   where not connected), 1);

reset role;
rollback;
