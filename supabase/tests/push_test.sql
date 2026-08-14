-- =============================================================
-- push_test.sql
-- スマートフォンへの通知の登録（0028）。
--
-- ここに入るのは「その端末へ通知を送れる鍵」。
-- いちばん守りたいのは
--   * **他人の登録が見えない・触れない**
--   * 画面から他人の鍵を引けない（list_push_targets は渡さない）
--   * 同じ端末が二重に登録されない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a3330000-0000-0000-0000-000000000001', 'push-p1@example.com'),
  ('a3330000-0000-0000-0000-000000000002', 'push-p2@example.com'),
  ('a3330000-0000-0000-0000-000000000003', 'push-admin@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b3330000-0000-0000-0000-00000000000a', 'push-team', '通知テスト部', 'push-team');

insert into public.profiles (id, user_id, full_name) values
  ('c3330000-0000-0000-0000-000000000001', 'a3330000-0000-0000-0000-000000000001', '選手1'),
  ('c3330000-0000-0000-0000-000000000002', 'a3330000-0000-0000-0000-000000000002', '選手2'),
  ('c3330000-0000-0000-0000-000000000003', 'a3330000-0000-0000-0000-000000000003', '管理者');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d3330000-0000-0000-0000-000000000001', 'b3330000-0000-0000-0000-00000000000a', 'c3330000-0000-0000-0000-000000000001', 'player'),
  ('d3330000-0000-0000-0000-000000000002', 'b3330000-0000-0000-0000-00000000000a', 'c3330000-0000-0000-0000-000000000002', 'player'),
  ('d3330000-0000-0000-0000-000000000003', 'b3330000-0000-0000-0000-00000000000a', 'c3330000-0000-0000-0000-000000000003', 'system_admin');

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

create or replace function pg_temp.expect_error(p_label text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok: % (%)', p_label, sqlerrm;
    return;
  end;
  raise exception 'NG: % — 通ってしまった', p_label;
end;
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. 自分の端末を登録する
-- -------------------------------------------------------------
select pg_temp.login('a3330000-0000-0000-0000-000000000001');

insert into public.push_subscriptions (id, team_id, team_member_id, endpoint, p256dh, auth, label) values
  ('e3330000-0000-0000-0000-000000000001', 'b3330000-0000-0000-0000-00000000000a',
   'd3330000-0000-0000-0000-000000000001', 'https://push.example.com/aaa', 'key-a', 'auth-a', 'iPhone');

select pg_temp.check('自分の端末を登録できる',
  (select count(*) from public.push_subscriptions), 1);

-- 2台目（同じ人の別の端末）は登録できる
insert into public.push_subscriptions (team_id, team_member_id, endpoint, p256dh, auth, label) values
  ('b3330000-0000-0000-0000-00000000000a', 'd3330000-0000-0000-0000-000000000001',
   'https://push.example.com/bbb', 'key-b', 'auth-b', 'パソコン');

select pg_temp.check('同じ人の別の端末も登録できる',
  (select count(*) from public.push_subscriptions), 2);

select pg_temp.expect_error('**同じ端末は二重に登録できない**（同じ通知が何度も鳴る）', $$
  insert into public.push_subscriptions (team_id, team_member_id, endpoint, p256dh, auth)
  values ('b3330000-0000-0000-0000-00000000000a', 'd3330000-0000-0000-0000-000000000001',
          'https://push.example.com/aaa', 'key-a', 'auth-a')
$$);

select pg_temp.expect_error('**他人の端末として登録できない**', $$
  insert into public.push_subscriptions (team_id, team_member_id, endpoint, p256dh, auth)
  values ('b3330000-0000-0000-0000-00000000000a', 'd3330000-0000-0000-0000-000000000002',
          'https://push.example.com/ccc', 'key-c', 'auth-c')
$$);

-- -------------------------------------------------------------
-- 2. **他人の登録は見えない**
-- -------------------------------------------------------------
select pg_temp.login('a3330000-0000-0000-0000-000000000002');

select pg_temp.check('**他の選手には見えない**',
  (select count(*) from public.push_subscriptions), 0);

insert into public.push_subscriptions (team_id, team_member_id, endpoint, p256dh, auth) values
  ('b3330000-0000-0000-0000-00000000000a', 'd3330000-0000-0000-0000-000000000002',
   'https://push.example.com/ddd', 'key-d', 'auth-d');

select pg_temp.check('自分のものだけ見える',
  (select count(*) from public.push_subscriptions), 1);

-- **管理者にも見せない。** 見えたところで使い道が無く、
-- 他人の端末へ通知を送る材料になるだけ。
select pg_temp.login('a3330000-0000-0000-0000-000000000003');
select pg_temp.check('**管理者にも見えない**',
  (select count(*) from public.push_subscriptions), 0);

-- -------------------------------------------------------------
-- 3. **画面から他人の鍵を引けない**
--
-- list_push_targets は service role だけが呼ぶ。
-- authenticated に渡すと、他人の端末へ送れる材料が画面に出てしまう。
-- -------------------------------------------------------------
select pg_temp.expect_error('**送り先の一覧は画面から引けない**', $$
  select * from public.list_push_targets(array['d3330000-0000-0000-0000-000000000001'::uuid])
$$);

select pg_temp.expect_error('片付けの関数も画面からは呼べない', $$
  select public.drop_push_subscription('https://push.example.com/aaa')
$$);

select pg_temp.expect_error('結果の記録も画面からは呼べない', $$
  select public.record_push_result('https://push.example.com/aaa', true)
$$);

-- -------------------------------------------------------------
-- 4. 消せるのは本人だけ
-- -------------------------------------------------------------
select pg_temp.login('a3330000-0000-0000-0000-000000000002');

delete from public.push_subscriptions where endpoint = 'https://push.example.com/aaa';
select pg_temp.login('a3330000-0000-0000-0000-000000000001');
select pg_temp.check('**他人の登録は消せない**',
  (select count(*) from public.push_subscriptions where endpoint = 'https://push.example.com/aaa'), 1);

delete from public.push_subscriptions where endpoint = 'https://push.example.com/aaa';
select pg_temp.check('本人は消せる',
  (select count(*) from public.push_subscriptions where endpoint = 'https://push.example.com/aaa'), 0);

-- -------------------------------------------------------------
-- 5. サーバ（service role）からは引ける
-- -------------------------------------------------------------
reset role;

select pg_temp.check('サーバは送り先を引ける',
  (select count(*) from public.list_push_targets(array[
     'd3330000-0000-0000-0000-000000000001'::uuid,
     'd3330000-0000-0000-0000-000000000002'::uuid])), 2);

select public.record_push_result('https://push.example.com/bbb', false);
select pg_temp.check('失敗を数える',
  (select failure_count from public.push_subscriptions
   where endpoint = 'https://push.example.com/bbb'), 1);

select public.record_push_result('https://push.example.com/bbb', true);
select pg_temp.check('成功したら数を戻す（電波が悪かっただけの人を切らない）',
  (select failure_count from public.push_subscriptions
   where endpoint = 'https://push.example.com/bbb'), 0);

select public.drop_push_subscription('https://push.example.com/bbb');
select pg_temp.check('届かなくなった端末は片付けられる',
  (select count(*) from public.push_subscriptions
   where endpoint = 'https://push.example.com/bbb'), 0);

-- -------------------------------------------------------------
-- 6. 別チームの部員には登録できない（0011 の教訓）
-- -------------------------------------------------------------
insert into auth.users (id, email) values ('a3330000-0000-0000-0000-00000000000f', 'other@example.com');
insert into public.teams (id, name, display_name, slug) values
  ('b3330000-0000-0000-0000-00000000000f', 'other', '別の部', 'other-push');
insert into public.profiles (id, user_id, full_name) values
  ('c3330000-0000-0000-0000-00000000000f', 'a3330000-0000-0000-0000-00000000000f', '別の部の人');
insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d3330000-0000-0000-0000-00000000000f', 'b3330000-0000-0000-0000-00000000000f',
   'c3330000-0000-0000-0000-00000000000f', 'player');

select pg_temp.expect_error('別のチームの部員には登録できない', $$
  insert into public.push_subscriptions (team_id, team_member_id, endpoint, p256dh, auth)
  values ('b3330000-0000-0000-0000-00000000000a', 'd3330000-0000-0000-0000-00000000000f',
          'https://push.example.com/eee', 'key-e', 'auth-e')
$$);

rollback;
