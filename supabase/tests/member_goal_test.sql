-- =============================================================
-- member_goal_test.sql
-- 中目標とタグ（0026）。
--
-- いちばん守りたいこと:
--   * **中目標を直せるのは本人だけ。コーチも直せない**
--   * 他の選手には見えない。スタッフには見える
--   * 付けられるのは自分の目標だけ
--   * 目標を消しても、付いていたタグは他の目標へ振り替えられる
--   * まとめたとき、積み上がりが失われない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a1110000-0000-0000-0000-000000000001', 'goal-player1@example.com'),
  ('a1110000-0000-0000-0000-000000000002', 'goal-player2@example.com'),
  ('a1110000-0000-0000-0000-000000000003', 'goal-coach@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b1110000-0000-0000-0000-00000000000a', 'goal-team', '目標テスト部', 'goal-team');

insert into public.profiles (id, user_id, full_name) values
  ('c1110000-0000-0000-0000-000000000001', 'a1110000-0000-0000-0000-000000000001', '本人'),
  ('c1110000-0000-0000-0000-000000000002', 'a1110000-0000-0000-0000-000000000002', '別の選手'),
  ('c1110000-0000-0000-0000-000000000003', 'a1110000-0000-0000-0000-000000000003', 'コーチ');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d1110000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000001', 'player'),
  ('d1110000-0000-0000-0000-000000000002', 'b1110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000002', 'player'),
  ('d1110000-0000-0000-0000-000000000003', 'b1110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000003', 'coach');

-- 大分類はチームで固定。コーチが決める。
insert into public.skill_categories (id, team_id, name, sort_order) values
  ('e1110000-0000-0000-0000-00000000000a', 'b1110000-0000-0000-0000-00000000000a', '止める・蹴る', 1),
  ('e1110000-0000-0000-0000-00000000000b', 'b1110000-0000-0000-0000-00000000000a', '守備', 2);

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

create or replace function pg_temp.check_text(p_label text, p_actual text, p_expected text)
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
-- 1. 自分の言葉で中目標を書く
-- -------------------------------------------------------------
select pg_temp.login('a1110000-0000-0000-0000-000000000001');

insert into public.member_goals (id, team_id, team_member_id, skill_category_id, name, note) values
  ('f1110000-0000-0000-0000-000000000001', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', 'e1110000-0000-0000-0000-00000000000a',
   '持ち出しを速くする', '相手に寄せられる前に前を向けたら'),
  ('f1110000-0000-0000-0000-000000000002', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', 'e1110000-0000-0000-0000-00000000000b',
   '体を入れて守る', null);

select pg_temp.check('自分の目標は自分で作れる',
  (select count(*) from public.member_goals where team_member_id = 'd1110000-0000-0000-0000-000000000001'), 2);

-- 大分類を決めずに書き始められる（決めさせて止まるほうが困る）
insert into public.member_goals (id, team_id, team_member_id, name) values
  ('f1110000-0000-0000-0000-000000000003', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', 'まだ決めていない目標');

select pg_temp.check('大分類なしでも作れる',
  (select count(*) from public.member_goals where skill_category_id is null), 1);

select pg_temp.expect_error('同じ名前は2つ作れない', $$
  insert into public.member_goals (team_id, team_member_id, name)
  values ('b1110000-0000-0000-0000-00000000000a', 'd1110000-0000-0000-0000-000000000001', '持ち出しを速くする')
$$);

select pg_temp.expect_error('空の目標は残さない', $$
  insert into public.member_goals (team_id, team_member_id, name)
  values ('b1110000-0000-0000-0000-00000000000a', 'd1110000-0000-0000-0000-000000000001', '   ')
$$);

select pg_temp.expect_error('他人の目標は作れない', $$
  insert into public.member_goals (team_id, team_member_id, name)
  values ('b1110000-0000-0000-0000-00000000000a', 'd1110000-0000-0000-0000-000000000002', '勝手に決めた目標')
$$);

-- -------------------------------------------------------------
-- 2. 誰に見えるか
-- -------------------------------------------------------------
select pg_temp.login('a1110000-0000-0000-0000-000000000002');
select pg_temp.check('**他の選手には見えない**',
  (select count(*) from public.member_goals where team_member_id = 'd1110000-0000-0000-0000-000000000001'), 0);

select pg_temp.login('a1110000-0000-0000-0000-000000000003');
select pg_temp.check('スタッフには見える（何に取り組んでいるかを知って返すため）',
  (select count(*) from public.member_goals where team_member_id = 'd1110000-0000-0000-0000-000000000001'), 3);

-- -------------------------------------------------------------
-- 3. **直せるのは本人だけ。コーチも直せない**
-- -------------------------------------------------------------
update public.member_goals set name = 'コーチが書き換えた目標'
where id = 'f1110000-0000-0000-0000-000000000001';

select pg_temp.login('a1110000-0000-0000-0000-000000000001');
select pg_temp.check_text('**コーチは中目標を書き換えられない**',
  (select name from public.member_goals where id = 'f1110000-0000-0000-0000-000000000001'),
  '持ち出しを速くする');

-- コーチが「できた」ことにもできない（承認ではないので）
select pg_temp.login('a1110000-0000-0000-0000-000000000003');
update public.member_goals set achieved_at = now()
where id = 'f1110000-0000-0000-0000-000000000001';

select pg_temp.login('a1110000-0000-0000-0000-000000000001');
select pg_temp.check('**コーチは「できた」を押せない**',
  (select count(*) from public.member_goals
   where id = 'f1110000-0000-0000-0000-000000000001' and achieved_at is not null), 0);

-- 本人は押せる
update public.member_goals set achieved_at = now()
where id = 'f1110000-0000-0000-0000-000000000002';

select pg_temp.check('本人は「できた」を押せる',
  (select count(*) from public.member_goals
   where id = 'f1110000-0000-0000-0000-000000000002' and achieved_at is not null), 1);

-- 本人は大分類をあとから移せる（振り替え）
update public.member_goals set skill_category_id = 'e1110000-0000-0000-0000-00000000000b'
where id = 'f1110000-0000-0000-0000-000000000001';

select pg_temp.check('あとから大分類を移せる',
  (select count(*) from public.member_goals
   where id = 'f1110000-0000-0000-0000-000000000001'
     and skill_category_id = 'e1110000-0000-0000-0000-00000000000b'), 1);

-- -------------------------------------------------------------
-- 4. タグとして日報に付ける
-- -------------------------------------------------------------
insert into public.daily_reports (id, team_id, team_member_id, report_date, status, what_happened) values
  ('01110000-0000-0000-0000-00000000000a', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', current_date, 'submitted', '持ち出しを意識した'),
  ('01110000-0000-0000-0000-00000000000b', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', current_date - 1, 'submitted', '前の日');

insert into public.goal_tags (team_id, member_goal_id, target_type, daily_report_id, created_by) values
  ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000001',
   'daily_report', '01110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000001'),
  ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000001',
   'daily_report', '01110000-0000-0000-0000-00000000000b', 'c1110000-0000-0000-0000-000000000001');

select pg_temp.check('日報に目標を付けられる',
  (select count(*) from public.goal_tags where member_goal_id = 'f1110000-0000-0000-0000-000000000001'), 2);

select pg_temp.expect_error('同じ日報に同じ目標は2回付かない', $$
  insert into public.goal_tags (team_id, member_goal_id, target_type, daily_report_id, created_by)
  values ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000001',
          'daily_report', '01110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000001')
$$);

select pg_temp.expect_error('種別と中身が食い違う行は作れない', $$
  insert into public.goal_tags (team_id, member_goal_id, target_type, video_comment_id, created_by)
  values ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000001',
          'daily_report', null, 'c1110000-0000-0000-0000-000000000001')
$$);

-- -------------------------------------------------------------
-- 5. **他人の目標は付けられない**
-- -------------------------------------------------------------
select pg_temp.login('a1110000-0000-0000-0000-000000000002');

insert into public.member_goals (id, team_id, team_member_id, name) values
  ('f1110000-0000-0000-0000-00000000000b', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000002', '別の選手の目標');

select pg_temp.expect_error('**他人の目標は自分の記録に付けられない**', $$
  insert into public.goal_tags (team_id, member_goal_id, target_type, daily_report_id, created_by)
  values ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000001',
          'daily_report', '01110000-0000-0000-0000-00000000000a', 'c1110000-0000-0000-0000-000000000002')
$$);

select pg_temp.check('他人のタグは見えない（目標が見えないため）',
  (select count(*) from public.goal_tags where member_goal_id = 'f1110000-0000-0000-0000-000000000001'), 0);

-- -------------------------------------------------------------
-- 6. 積み上がりの数え方
-- -------------------------------------------------------------
select pg_temp.login('a1110000-0000-0000-0000-000000000001');

select pg_temp.check('何回向き合ったかが数えられる',
  (select tag_count from public.member_goal_activity('d1110000-0000-0000-0000-000000000001')
   where member_goal_id = 'f1110000-0000-0000-0000-000000000001'), 2);

select pg_temp.check('一度も付けていない目標は0（行が消えない）',
  (select tag_count from public.member_goal_activity('d1110000-0000-0000-0000-000000000001')
   where member_goal_id = 'f1110000-0000-0000-0000-000000000002'), 0);

-- -------------------------------------------------------------
-- 7. まとめる（振り替え）
--
-- 「持ち出しを速くする」と「まだ決めていない目標」を作ってしまった。
-- 片方へまとめても、積み上がりが失われないこと。
-- -------------------------------------------------------------
insert into public.goal_tags (team_id, member_goal_id, target_type, daily_report_id, created_by) values
  ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000003',
   'daily_report', '01110000-0000-0000-0000-00000000000b', 'c1110000-0000-0000-0000-000000000001');

-- 片方は重複（同じ日報にどちらも付いている）ので、移るのは1件
select pg_temp.check('まとめると、重複しないぶんだけ移る',
  (select public.merge_member_goal(
     'f1110000-0000-0000-0000-000000000003',
     'f1110000-0000-0000-0000-000000000001')), 0);

select pg_temp.check('まとめた側は畳まれる',
  (select count(*) from public.member_goals where id = 'f1110000-0000-0000-0000-000000000003'), 0);

select pg_temp.check('残った側の積み上がりは減らない',
  (select tag_count from public.member_goal_activity('d1110000-0000-0000-0000-000000000001')
   where member_goal_id = 'f1110000-0000-0000-0000-000000000001'), 2);

-- 重複しないタグは、ちゃんと移る
insert into public.member_goals (id, team_id, team_member_id, name) values
  ('f1110000-0000-0000-0000-000000000004', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', '重ならない目標');

insert into public.daily_reports (id, team_id, team_member_id, report_date, status) values
  ('01110000-0000-0000-0000-00000000000c', 'b1110000-0000-0000-0000-00000000000a',
   'd1110000-0000-0000-0000-000000000001', current_date - 2, 'submitted');

insert into public.goal_tags (team_id, member_goal_id, target_type, daily_report_id, created_by) values
  ('b1110000-0000-0000-0000-00000000000a', 'f1110000-0000-0000-0000-000000000004',
   'daily_report', '01110000-0000-0000-0000-00000000000c', 'c1110000-0000-0000-0000-000000000001');

select pg_temp.check('重ならないタグは移る',
  (select public.merge_member_goal(
     'f1110000-0000-0000-0000-000000000004',
     'f1110000-0000-0000-0000-000000000001')), 1);

select pg_temp.check('移した分だけ積み上がりが増える',
  (select tag_count from public.member_goal_activity('d1110000-0000-0000-0000-000000000001')
   where member_goal_id = 'f1110000-0000-0000-0000-000000000001'), 3);

select pg_temp.expect_error('他人の目標はまとめられない', $$
  select public.merge_member_goal(
    'f1110000-0000-0000-0000-00000000000b',
    'f1110000-0000-0000-0000-000000000001')
$$);

-- -------------------------------------------------------------
-- 8. 消す
-- -------------------------------------------------------------
select pg_temp.expect_error('他人の目標は消せない', $$
  select public.soft_delete_member_goal('f1110000-0000-0000-0000-00000000000b')
$$);

select public.soft_delete_member_goal('f1110000-0000-0000-0000-000000000002');

select pg_temp.check('本人は消せる',
  (select count(*) from public.member_goals where id = 'f1110000-0000-0000-0000-000000000002'), 0);

select pg_temp.check('消した目標は数え上げからも外れる',
  (select count(*) from public.member_goal_activity('d1110000-0000-0000-0000-000000000001')), 1);

rollback;
