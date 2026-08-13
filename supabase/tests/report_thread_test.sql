-- =============================================================
-- report_thread_test.sql
-- 日報のやり取りを閉じる（0027）。
--
-- いちばん守りたいこと:
--   * **コーチは「読まれたことにする」ができない**
--   * 選手は自分の日報から質問できる（他人の日報には書けない）
--   * 押すまで「未確認」に残る
--   * 返信は1段だけ
--   * 最初に読んだ時刻を、あとから上書きしない
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a2220000-0000-0000-0000-000000000001', 'rt-player1@example.com'),
  ('a2220000-0000-0000-0000-000000000002', 'rt-player2@example.com'),
  ('a2220000-0000-0000-0000-000000000003', 'rt-coach@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b2220000-0000-0000-0000-00000000000a', 'rt-team', '日報テスト部', 'rt-team');

insert into public.profiles (id, user_id, full_name) values
  ('c2220000-0000-0000-0000-000000000001', 'a2220000-0000-0000-0000-000000000001', '書いた選手'),
  ('c2220000-0000-0000-0000-000000000002', 'a2220000-0000-0000-0000-000000000002', '別の選手'),
  ('c2220000-0000-0000-0000-000000000003', 'a2220000-0000-0000-0000-000000000003', 'コーチ');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('d2220000-0000-0000-0000-000000000001', 'b2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000001', 'player'),
  ('d2220000-0000-0000-0000-000000000002', 'b2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000002', 'player'),
  ('d2220000-0000-0000-0000-000000000003', 'b2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000003', 'coach');

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
-- 1. 選手が日報を出す（コーチまで）
-- -------------------------------------------------------------
select pg_temp.login('a2220000-0000-0000-0000-000000000001');

insert into public.daily_reports
  (id, team_id, team_member_id, report_date, status, visibility, what_went_well)
values
  ('e2220000-0000-0000-0000-00000000000a', 'b2220000-0000-0000-0000-00000000000a',
   'd2220000-0000-0000-0000-000000000001', current_date, 'submitted', 'staff', '前を向いて運べた');

-- -------------------------------------------------------------
-- 2. **選手が自分の日報から質問できる**（0027 で広げたところ）
-- -------------------------------------------------------------
insert into public.report_feedbacks (id, team_id, daily_report_id, author_id, body) values
  ('f2220000-0000-0000-0000-000000000001', 'b2220000-0000-0000-0000-00000000000a',
   'e2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000001',
   '持ち出しのとき、右足からのほうがいいですか');

select pg_temp.check('自分の日報に質問を書ける',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000a'), 1);

-- 宛先にコーチを指名する
insert into public.report_feedback_mentions (team_id, report_feedback_id, team_member_id) values
  ('b2220000-0000-0000-0000-00000000000a', 'f2220000-0000-0000-0000-000000000001',
   'd2220000-0000-0000-0000-000000000003');

select pg_temp.check('コーチを名指しで呼べる',
  (select count(*) from public.report_feedback_mentions
   where report_feedback_id = 'f2220000-0000-0000-0000-000000000001'), 1);

select pg_temp.expect_error('空のコメントは残せない', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000a',
          'c2220000-0000-0000-0000-000000000001', '   ')
$$);

select pg_temp.expect_error('差出人は偽れない', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000a',
          'c2220000-0000-0000-0000-000000000003', 'コーチのふりをする')
$$);

-- -------------------------------------------------------------
-- 3. ほかの選手は書けない・見えない
-- -------------------------------------------------------------
select pg_temp.login('a2220000-0000-0000-0000-000000000002');

select pg_temp.check('**他の選手には日報のコメントが見えない**',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000a'), 0);

select pg_temp.expect_error('**他人の日報にはコメントできない**', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000a',
          'c2220000-0000-0000-0000-000000000002', '勝手にひとこと')
$$);

-- -------------------------------------------------------------
-- 4. コーチが返信する（1段）
-- -------------------------------------------------------------
select pg_temp.login('a2220000-0000-0000-0000-000000000003');

select pg_temp.check('コーチには質問が見える',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000a'), 1);

insert into public.report_feedbacks (id, team_id, daily_report_id, author_id, parent_id, body) values
  ('f2220000-0000-0000-0000-000000000002', 'b2220000-0000-0000-0000-00000000000a',
   'e2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000003',
   'f2220000-0000-0000-0000-000000000001', '右足で構いません。半歩前で受けてみましょう');

select pg_temp.check('コーチは返信できる',
  (select count(*) from public.report_feedbacks
   where parent_id = 'f2220000-0000-0000-0000-000000000001'), 1);

select pg_temp.expect_error('返信への返信はできない', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, parent_id, body)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000a',
          'c2220000-0000-0000-0000-000000000003', 'f2220000-0000-0000-0000-000000000002', 'さらに返す')
$$);

-- コーチが自分から新しいコメントを書くこともできる（従来どおり）
insert into public.report_feedbacks (id, team_id, daily_report_id, author_id, body) values
  ('f2220000-0000-0000-0000-000000000003', 'b2220000-0000-0000-0000-00000000000a',
   'e2220000-0000-0000-0000-00000000000a', 'c2220000-0000-0000-0000-000000000003',
   '今日の切り返し、よかったです');

select pg_temp.check('コーチは自分からも書ける',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000a'), 3);

-- -------------------------------------------------------------
-- 5. **コーチは「読まれたことにする」ができない**
-- -------------------------------------------------------------
select pg_temp.expect_error('**コーチは受け取りを押せない**', $$
  select public.acknowledge_report_feedback('f2220000-0000-0000-0000-000000000003')
$$);

select pg_temp.expect_error('**コーチはまとめて確認もできない**', $$
  select public.acknowledge_report_feedbacks('e2220000-0000-0000-0000-00000000000a')
$$);

-- 関数を通さない素の update でも動かせないこと。
-- ここは実際に穴が開いていた。RLS はスタッフに update を許しているので、
-- ポリシーだけでは「この列だけ触らせない」が書けない。トリガで止める。
select pg_temp.expect_error('**コーチの素の update でも既読にできない**', $$
  update public.report_feedbacks set acknowledged_at = now()
  where id = 'f2220000-0000-0000-0000-000000000003'
$$);

select pg_temp.expect_error('**最初から既読にして書き込むこともできない**', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, body, acknowledged_at)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000a',
          'c2220000-0000-0000-0000-000000000003', '読んだことにしておく', now())
$$);

select pg_temp.login('a2220000-0000-0000-0000-000000000001');
select pg_temp.check('コーチの試みは1件も通っていない',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000a'
     and acknowledged_at is not null), 0);

-- -------------------------------------------------------------
-- 6. 選手が受け取る
-- -------------------------------------------------------------
select pg_temp.check('押すまでは未確認のまま残る',
  (select count(*) from public.list_unacknowledged_feedbacks()), 2);

select pg_temp.check('**自分が書いた質問は、確認の対象にしない**',
  (select count(*) from public.list_unacknowledged_feedbacks()
   where feedback_id = 'f2220000-0000-0000-0000-000000000001'), 0);

select pg_temp.expect_error('自分が書いたものは確認できない', $$
  select public.acknowledge_report_feedback('f2220000-0000-0000-0000-000000000001')
$$);

select public.acknowledge_report_feedback('f2220000-0000-0000-0000-000000000002');

select pg_temp.check('押したものは未確認から消える',
  (select count(*) from public.list_unacknowledged_feedbacks()), 1);

-- -------------------------------------------------------------
-- 7. 素の update では、本人でも動かせない
--
-- report_feedbacks_write は with check に author_id = 自分 を入れている。
-- コーチの書いたコメントを選手が直接 update することはできない。
-- **つまり acknowledged_at を動かす道は、関数ひとつだけ。**
-- 通り道が1本なら、そこだけ見ればよい。
-- -------------------------------------------------------------
select pg_temp.expect_error('本人でも、素の update では動かせない', $$
  update public.report_feedbacks set acknowledged_at = now()
  where id = 'f2220000-0000-0000-0000-000000000003'
$$);

-- -------------------------------------------------------------
-- 8. 最初に読んだ時刻を、あとから上書きしない
-- -------------------------------------------------------------
create temporary table pg_temp_first_ack as
select acknowledged_at from public.report_feedbacks
where id = 'f2220000-0000-0000-0000-000000000002';

select public.acknowledge_report_feedback('f2220000-0000-0000-0000-000000000002');

select pg_temp.check('**すでに押してあれば、時刻を上書きしない**',
  (select count(*) from public.report_feedbacks f, pg_temp_first_ack t
   where f.id = 'f2220000-0000-0000-0000-000000000002'
     and f.acknowledged_at = t.acknowledged_at), 1);

-- -------------------------------------------------------------
-- 9. まとめて確認する
-- -------------------------------------------------------------
select pg_temp.check('残りをまとめて確認できる',
  (select public.acknowledge_report_feedbacks('e2220000-0000-0000-0000-00000000000a')), 1);

select pg_temp.check('全部読むと未確認は0になる',
  (select count(*) from public.list_unacknowledged_feedbacks()), 0);

select pg_temp.check('もう一度押しても、二重には数えない',
  (select public.acknowledge_report_feedbacks('e2220000-0000-0000-0000-00000000000a')), 0);

-- -------------------------------------------------------------
-- 10. 他人の日報は確認できない
-- -------------------------------------------------------------
select pg_temp.login('a2220000-0000-0000-0000-000000000002');

select pg_temp.expect_error('**他人の日報はまとめて確認できない**', $$
  select public.acknowledge_report_feedbacks('e2220000-0000-0000-0000-00000000000a')
$$);

select pg_temp.check('他人宛のものは自分の未確認に出ない',
  (select count(*) from public.list_unacknowledged_feedbacks()), 0);

-- -------------------------------------------------------------
-- 11. 「自分だけ」の日報には、コーチはコメントできないまま（0022 を壊していない）
-- -------------------------------------------------------------
select pg_temp.login('a2220000-0000-0000-0000-000000000001');

insert into public.daily_reports
  (id, team_id, team_member_id, report_date, status, visibility, what_went_well)
values
  ('e2220000-0000-0000-0000-00000000000b', 'b2220000-0000-0000-0000-00000000000a',
   'd2220000-0000-0000-0000-000000000001', current_date - 1, 'submitted', 'private', '自分だけの記録');

-- 本人は自分の「自分だけ」の日報にも書ける（自分用のメモとして）
insert into public.report_feedbacks (team_id, daily_report_id, author_id, body) values
  ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000b',
   'c2220000-0000-0000-0000-000000000001', '自分用のメモ');

select pg_temp.login('a2220000-0000-0000-0000-000000000003');

select pg_temp.expect_error('**「自分だけ」の日報にコーチは書けない**', $$
  insert into public.report_feedbacks (team_id, daily_report_id, author_id, body)
  values ('b2220000-0000-0000-0000-00000000000a', 'e2220000-0000-0000-0000-00000000000b',
          'c2220000-0000-0000-0000-000000000003', 'のぞき見コメント')
$$);

select pg_temp.check('「自分だけ」の日報のメモはコーチに見えない',
  (select count(*) from public.report_feedbacks
   where daily_report_id = 'e2220000-0000-0000-0000-00000000000b'), 0);

-- -------------------------------------------------------------
-- 12. 消せるのは書いた本人だけ（0022 のまま）
-- -------------------------------------------------------------
select pg_temp.expect_error('他人のコメントは消せない', $$
  select public.soft_delete_report_feedback('f2220000-0000-0000-0000-000000000001')
$$);

select public.soft_delete_report_feedback('f2220000-0000-0000-0000-000000000003');

select pg_temp.check('本人は自分のコメントを消せる',
  (select count(*) from public.report_feedbacks
   where id = 'f2220000-0000-0000-0000-000000000003'), 0);

rollback;
