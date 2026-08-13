-- =============================================================
-- video_comment_test.sql
-- 動画の掲示板（0024）。
--
--   * 既定はコーチとスタッフまで。他の選手には見えない
--   * 本人が「部内全員」に開ける。他人は開けない
--   * 宛先にされた人には、staff のままでも見える
--   * 動画が見えない人には、コメントも見えない
--   * 返信は1段だけ。返信は親の公開範囲に従う
--   * 消せるのは書いた本人だけ。親を消すと返信も畳む
--
-- 実行方法は rls_test.sql と同じ。
-- =============================================================

\set ON_ERROR_STOP on

begin;

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-000000000001', 'vc-player1@example.com'),
  ('aaaa0000-0000-0000-0000-000000000002', 'vc-player2@example.com'),
  ('aaaa0000-0000-0000-0000-000000000003', 'vc-coach@example.com'),
  ('aaaa0000-0000-0000-0000-000000000004', 'vc-player3@example.com');

insert into public.teams (id, name, display_name, slug) values
  ('bbbb0000-0000-0000-0000-00000000000a', 'vc-team', '掲示板テスト部', 'vc-team');

insert into public.profiles (id, user_id, full_name) values
  ('cccc0000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-000000000001', '投稿者'),
  ('cccc0000-0000-0000-0000-000000000002', 'aaaa0000-0000-0000-0000-000000000002', '別の選手'),
  ('cccc0000-0000-0000-0000-000000000003', 'aaaa0000-0000-0000-0000-000000000003', 'コーチ'),
  ('cccc0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000004', '呼ばれた選手');

insert into public.team_members (id, team_id, profile_id, role_code) values
  ('dddd0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000001', 'player'),
  ('dddd0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000002', 'player'),
  ('dddd0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000003', 'coach'),
  ('dddd0000-0000-0000-0000-000000000004', 'bbbb0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000004', 'player');

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
-- 1. 動画を1本、チームへ公開して登録する
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');

insert into public.videos
  (id, team_id, created_by, provider, provider_video_id, title, duration_seconds, visibility)
values
  ('eeee0000-0000-0000-0000-00000000000a', 'bbbb0000-0000-0000-0000-00000000000a',
   'cccc0000-0000-0000-0000-000000000001', 'youtube', 'abc123', '練習', 1800, 'team');

-- -------------------------------------------------------------
-- 2. 時間つきで書き込む（既定はコーチまで）
-- -------------------------------------------------------------
insert into public.video_comments (id, team_id, video_id, author_id, at_seconds, body)
values ('ffff0000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-00000000000a',
        'eeee0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000001',
        754, 'ここの持ち出しが遅いです');

select pg_temp.check('書いた本人には見える',
  (select count(*) from public.video_comments), 1);

select pg_temp.check('既定は staff',
  (select count(*) from public.video_comments where visibility = 'staff'), 1);

-- 差出人は偽れない
do $$
begin
  begin
    insert into public.video_comments (team_id, video_id, author_id, at_seconds, body)
    values ('bbbb0000-0000-0000-0000-00000000000a', 'eeee0000-0000-0000-0000-00000000000a',
            'cccc0000-0000-0000-0000-000000000003', 100, 'コーチのふり');
    raise exception 'NG: 他人の名前で書けてしまった';
  exception
    when insufficient_privilege then raise notice 'ok: 他人の名前では書けない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 他人の名前では書けない（%）', sqlerrm;
  end;
end;
$$;

-- 動画の長さを超える位置は断る
do $$
begin
  begin
    insert into public.video_comments (team_id, video_id, author_id, at_seconds, body)
    values ('bbbb0000-0000-0000-0000-00000000000a', 'eeee0000-0000-0000-0000-00000000000a',
            'cccc0000-0000-0000-0000-000000000001', 9999, '終わりより後');
    raise exception 'NG: 長さを超える位置に書けてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 動画の長さを超える位置は断る（%）', sqlerrm;
  end;
end;
$$;

-- 空の書き込みは残さない
do $$
begin
  begin
    insert into public.video_comments (team_id, video_id, author_id, body)
    values ('bbbb0000-0000-0000-0000-00000000000a', 'eeee0000-0000-0000-0000-00000000000a',
            'cccc0000-0000-0000-0000-000000000001', '   ');
    raise exception 'NG: 空の書き込みができてしまった';
  exception when others then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 空の書き込みは残さない';
  end;
end;
$$;

-- -------------------------------------------------------------
-- 3. 見える範囲
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- コーチ
select pg_temp.check('コーチには見える', (select count(*) from public.video_comments), 1);

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');  -- 別の選手
select pg_temp.check('他の選手には見えない', (select count(*) from public.video_comments), 0);

-- -------------------------------------------------------------
-- 4. 宛先にされた人には見える（staff のままでも）
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');
insert into public.video_comment_mentions (team_id, video_comment_id, team_member_id)
values ('bbbb0000-0000-0000-0000-00000000000a', 'ffff0000-0000-0000-0000-000000000001',
        'dddd0000-0000-0000-0000-000000000004');

select pg_temp.login('aaaa0000-0000-0000-0000-000000000004');  -- 呼ばれた選手
select pg_temp.check('宛先にされた人には見える', (select count(*) from public.video_comments), 1);

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');  -- 呼ばれていない選手
select pg_temp.check('呼ばれていない選手には見えない', (select count(*) from public.video_comments), 0);

-- 他人の書き込みに宛先を足せない
do $$
begin
  begin
    insert into public.video_comment_mentions (team_id, video_comment_id, team_member_id)
    values ('bbbb0000-0000-0000-0000-00000000000a', 'ffff0000-0000-0000-0000-000000000001',
            'dddd0000-0000-0000-0000-000000000002');
    raise exception 'NG: 他人の書き込みに宛先を足せてしまった';
  exception
    when insufficient_privilege then raise notice 'ok: 他人の書き込みに宛先は足せない（RLS）';
    when raise_exception then
      if sqlerrm like 'NG:%' then raise; end if;
      raise notice 'ok: 他人の書き込みに宛先は足せない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 5. 本人が部内全員に開ける。他人は開けない
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- コーチ
do $$
begin
  begin
    update public.video_comments set visibility = 'team'
    where id = 'ffff0000-0000-0000-0000-000000000001';
    if found then
      raise exception 'NG: コーチが勝手に全体公開にできてしまった';
    end if;
    raise notice 'ok: コーチは勝手に全体公開にできない（1行も変わらない）';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: コーチは勝手に全体公開にできない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
select pg_temp.check('この時点でも他の選手には見えない',
  (select count(*) from public.video_comments), 0);

select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');  -- 書いた本人
update public.video_comments set visibility = 'team'
where id = 'ffff0000-0000-0000-0000-000000000001';

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
select pg_temp.check('開けたら他の選手にも見える',
  (select count(*) from public.video_comments), 1);

-- -------------------------------------------------------------
-- 6. 返信
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');  -- コーチ
insert into public.video_comments (id, team_id, video_id, author_id, parent_id, body)
values ('ffff0000-0000-0000-0000-000000000002', 'bbbb0000-0000-0000-0000-00000000000a',
        'eeee0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000003',
        'ffff0000-0000-0000-0000-000000000001', '半歩前で受けてみましょう');

select pg_temp.check('返信は親の公開範囲を引き継ぐ',
  (select count(*) from public.video_comments
   where id = 'ffff0000-0000-0000-0000-000000000002' and visibility = 'team'), 1);

-- 返信への返信はできない
do $$
begin
  begin
    insert into public.video_comments (team_id, video_id, author_id, parent_id, body)
    values ('bbbb0000-0000-0000-0000-00000000000a', 'eeee0000-0000-0000-0000-00000000000a',
            'cccc0000-0000-0000-0000-000000000003', 'ffff0000-0000-0000-0000-000000000002', '孫');
    raise exception 'NG: 返信への返信ができてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 返信への返信はできない（%）', sqlerrm;
  end;
end;
$$;

-- -------------------------------------------------------------
-- 7. 消せるのは書いた本人だけ
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
do $$
begin
  begin
    perform public.soft_delete_video_comment('ffff0000-0000-0000-0000-000000000001');
    raise exception 'NG: 他人の書き込みを消せてしまった';
  exception when raise_exception then
    if sqlerrm like 'NG:%' then raise; end if;
    raise notice 'ok: 他人の書き込みは消せない（%）', sqlerrm;
  end;
end;
$$;

select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');  -- 書いた本人
select public.soft_delete_video_comment('ffff0000-0000-0000-0000-000000000001');

select pg_temp.check('本人は消せる',
  (select count(*) from public.video_comments
   where id = 'ffff0000-0000-0000-0000-000000000001'), 0);

select pg_temp.check('親を消すと返信も一緒に畳まれる',
  (select count(*) from public.video_comments
   where id = 'ffff0000-0000-0000-0000-000000000002'), 0);

-- -------------------------------------------------------------
-- 8. 動画が見えない人には、コメントも見えない
-- -------------------------------------------------------------
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');
update public.videos set visibility = 'private_staff'
where id = 'eeee0000-0000-0000-0000-00000000000a';

insert into public.video_comments (id, team_id, video_id, author_id, at_seconds, body, visibility)
values ('ffff0000-0000-0000-0000-000000000003', 'bbbb0000-0000-0000-0000-00000000000a',
        'eeee0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000001',
        100, '全体公開のつもり', 'team');

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
select pg_temp.check('動画が見えなければ、全体公開のコメントも見えない',
  (select count(*) from public.video_comments), 0);

reset role;
-- -------------------------------------------------------------
-- 通知が実際に飛ぶか（**選手として**）
--
-- 「動画にコメントしたのに通知が来ない」と報告があったので、
-- 選手の権限で通知を作れるところまで通しで確かめる。
-- ここが通れば、飛ばない理由は「誰も選ばなかった」だけになる。
-- -------------------------------------------------------------
-- 途中で reset role されているので、ここで戻す（RLS を効かせるため）
set local role authenticated;
select pg_temp.login('aaaa0000-0000-0000-0000-000000000001');

insert into public.video_comments (id, team_id, video_id, author_id, at_seconds, body, visibility) values
  ('eeee0000-0000-0000-0000-0000000000b1', 'bbbb0000-0000-0000-0000-00000000000a',
   'eeee0000-0000-0000-0000-00000000000a', 'cccc0000-0000-0000-0000-000000000001',
   60, 'ここを見てください', 'staff');

insert into public.video_comment_mentions (team_id, video_comment_id, team_member_id) values
  ('bbbb0000-0000-0000-0000-00000000000a', 'eeee0000-0000-0000-0000-0000000000b1',
   'dddd0000-0000-0000-0000-000000000003');

insert into public.notifications
  (id, team_id, notification_type, title, body, link_path, related_table, related_id, created_by)
values
  ('99990000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-00000000000a', 'video_mentioned',
   '選手さんが動画に書き込みました', '練習 01:00 ここを見てください',
   '/videos/eeee0000-0000-0000-0000-00000000000a',
   'video_comments', 'eeee0000-0000-0000-0000-0000000000b1', 'cccc0000-0000-0000-0000-000000000001');

insert into public.notification_targets (notification_id, team_member_id) values
  ('99990000-0000-0000-0000-000000000001', 'dddd0000-0000-0000-0000-000000000003');

/*
  **作った本人には、自分の通知が見えない。**

  notifications_select は「自分が宛先の通知だけ見える」。
  作った人は宛先ではないので、行はあるのに 0 件に見える。

  これが「動画にコメントしたのに通知が来ない」の原因だった。
  アプリ側が insert のあとに .select('id').single() で読み返しており、
  ここが 0 件で失敗して、**宛先を入れずに黙って返っていた**。

  読み返さない作りにしたので、この見え方のままで正しい。
  ここを 1 に変えたくなったら、それは読み返す作りに戻したということ。
*/
select pg_temp.check('**作った本人には、自分の通知は見えない**',
  (select count(*) from public.notifications where id = '99990000-0000-0000-0000-000000000001'), 0);

select pg_temp.check('それでも行は作られている（definer 越しに確かめる）',
  (select case when app.owns_notification('99990000-0000-0000-0000-000000000001') then 1 else 0 end), 1);

select pg_temp.login('aaaa0000-0000-0000-0000-000000000003');
select pg_temp.check('**呼ばれたコーチに通知が届いている**',
  (select count(*) from public.notifications where id = '99990000-0000-0000-0000-000000000001'), 1);

select pg_temp.login('aaaa0000-0000-0000-0000-000000000002');
select pg_temp.check('呼ばれていない選手には見えない',
  (select count(*) from public.notifications where id = '99990000-0000-0000-0000-000000000001'), 0);

rollback;
