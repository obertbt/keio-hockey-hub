-- =============================================================
-- current_session_test.sql
-- ログインしている人の素性を1回で返す関数（0029）。
--
-- この関数は security definer、つまり **RLS を通らない**。
-- 通らないものを1つ増やしたので、ここで縛っておく。
--
-- 守りたいのは
--   * 返るのは **auth.uid() 本人のぶんだけ**
--   * 引数が無い（他人を指定する余地を作らない）
--   * 個別の権限は **自分のぶんだけ** 混ざる
--   * ログインしていなければ null
--   * 在籍していない人（退部・卒業）には null
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('a4440000-0000-0000-0000-000000000001', 'cs-p1@example.com'),
  ('a4440000-0000-0000-0000-000000000002', 'cs-p2@example.com'),
  ('a4440000-0000-0000-0000-000000000003', 'cs-coach@example.com'),
  ('a4440000-0000-0000-0000-000000000004', 'cs-gone@example.com'),
  ('a4440000-0000-0000-0000-000000000005', 'cs-nobody@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('b4440000-0000-0000-0000-00000000000a', 'cs-team', '素性テスト部', 'cs-team');

insert into public.profiles (id, user_id, full_name, display_name, email) values
  ('c4440000-0000-0000-0000-000000000001', 'a4440000-0000-0000-0000-000000000001', '選手1', 'せんしゅ1', 'cs-p1@example.com'),
  -- 呼ばれたい名前を入れていない人。本名で呼ぶことになる。
  ('c4440000-0000-0000-0000-000000000002', 'a4440000-0000-0000-0000-000000000002', '選手2', null, null),
  ('c4440000-0000-0000-0000-000000000003', 'a4440000-0000-0000-0000-000000000003', 'コーチ', null, null),
  ('c4440000-0000-0000-0000-000000000004', 'a4440000-0000-0000-0000-000000000004', '卒業した人', null, null),
  ('c4440000-0000-0000-0000-000000000005', 'a4440000-0000-0000-0000-000000000005', 'まだどこにも居ない人', null, null);

insert into public.team_members (id, team_id, profile_id, role_code, status) values
  ('d4440000-0000-0000-0000-000000000001', 'b4440000-0000-0000-0000-00000000000a', 'c4440000-0000-0000-0000-000000000001', 'player', 'active'),
  ('d4440000-0000-0000-0000-000000000002', 'b4440000-0000-0000-0000-00000000000a', 'c4440000-0000-0000-0000-000000000002', 'player', 'active'),
  ('d4440000-0000-0000-0000-000000000003', 'b4440000-0000-0000-0000-00000000000a', 'c4440000-0000-0000-0000-000000000003', 'coach', 'active'),
  ('d4440000-0000-0000-0000-000000000004', 'b4440000-0000-0000-0000-00000000000a', 'c4440000-0000-0000-0000-000000000004', 'player', 'graduated');

-- 選手1だけに、個別に権限を1つ足す
insert into public.member_permissions (team_member_id, permission_code, granted) values
  ('d4440000-0000-0000-0000-000000000001', 'report.view_all', true);

create or replace function pg_temp.login(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create or replace function pg_temp.check_text(p_label text, p_actual text, p_expected text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'NG: % (期待 %, 実際 %)', p_label, coalesce(p_expected, '(null)'), coalesce(p_actual, '(null)');
  end if;
  raise notice 'ok: %', p_label;
end;
$$;

set local role authenticated;

-- -------------------------------------------------------------
-- 1. 自分の素性が、1回で全部そろって返る
-- -------------------------------------------------------------
select pg_temp.login('a4440000-0000-0000-0000-000000000001');

select pg_temp.check_text('本人の profile_id が返る',
  public.current_session() ->> 'profile_id', 'c4440000-0000-0000-0000-000000000001');

select pg_temp.check_text('team_member_id が返る',
  public.current_session() ->> 'team_member_id', 'd4440000-0000-0000-0000-000000000001');

select pg_temp.check_text('立場が返る',
  public.current_session() ->> 'role', 'player');

select pg_temp.check_text('チーム名が返る（別に引き直さなくてよい）',
  public.current_session() ->> 'team_name', '素性テスト部');

select pg_temp.check_text('呼ばれたい名前が返る',
  public.current_session() ->> 'display_name', 'せんしゅ1');

select pg_temp.check_text('**個別に足した権限が入っている**',
  public.current_session() -> 'overrides' ->> 'report.view_all', 'true');

-- -------------------------------------------------------------
-- 2. **他人のものは混ざらない**
--
-- security definer なので RLS が効かない。
-- ここが緩むと、誰でも他人の素性を引ける関数になる。
-- -------------------------------------------------------------
select pg_temp.login('a4440000-0000-0000-0000-000000000002');

select pg_temp.check_text('別の人がログインすれば、その人のものが返る',
  public.current_session() ->> 'profile_id', 'c4440000-0000-0000-0000-000000000002');

select pg_temp.check_text('**他人に足した権限は混ざらない**',
  public.current_session() -> 'overrides' ->> 'report.view_all', null);

select pg_temp.check_text('呼ばれたい名前が無ければ、null のまま返す（本名は画面側で当てる）',
  public.current_session() ->> 'display_name', null);

select pg_temp.check_text('メールが無くても落ちない',
  public.current_session() ->> 'email', null);

-- 立場はその人のもの
select pg_temp.login('a4440000-0000-0000-0000-000000000003');
select pg_temp.check_text('コーチにはコーチの立場が返る',
  public.current_session() ->> 'role', 'coach');

-- -------------------------------------------------------------
-- 3. 在籍していない人には null
--
-- 卒業・退部の人が、いつまでも中に入れてしまうと困る。
-- -------------------------------------------------------------
select pg_temp.login('a4440000-0000-0000-0000-000000000004');
select pg_temp.check_text('**卒業した人には null**（在籍していない）',
  public.current_session()::text, null);

select pg_temp.login('a4440000-0000-0000-0000-000000000005');
select pg_temp.check_text('まだどのチームにも属していない人には null',
  public.current_session()::text, null);

-- -------------------------------------------------------------
-- 4. ログインしていなければ null
-- -------------------------------------------------------------
select set_config('request.jwt.claim.sub', '', true);
select pg_temp.check_text('ログインしていなければ null',
  public.current_session()::text, null);

-- -------------------------------------------------------------
-- 5. 引数を取らない
--
-- 「誰の素性か」を外から指定できる形にしてはいけない。
-- 引数を足した瞬間に、他人を引ける関数になる。
-- -------------------------------------------------------------
select pg_temp.check_text('引数は0個のまま',
  (select count(*)::text
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'current_session' and p.pronargs = 0),
  '1');

-- -------------------------------------------------------------
-- 6. anon には実行させない
-- -------------------------------------------------------------
select pg_temp.check_text('**ログイン前の役割からは実行できない**',
  has_function_privilege('anon', 'public.current_session()', 'execute')::text, 'false');

select pg_temp.check_text('ログイン後の役割からは実行できる',
  has_function_privilege('authenticated', 'public.current_session()', 'execute')::text, 'true');

rollback;
