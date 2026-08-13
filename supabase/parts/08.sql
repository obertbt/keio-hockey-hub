-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 8 番目。中身: 0024_video_comments.sql 0025_youtube_connection.sql 
-- ==========================================================


-- ---------- 0024_video_comments.sql ----------
-- =============================================================
-- 0024_video_comments.sql
-- 動画への書き込みを掲示板にする（18章・25章の作り直し）。
--
-- なぜ作り直すか:
--   これまでは「場面を登録する」→「その場面について質問を作る」の
--   2段階だった。実際に選手に使ってもらうと、この手続きが重い。
--   ひとこと書きたいだけなのに、毎回2つの様式を通らされる。
--
--   欲しかったのは、動画に対して「時間 + ひとこと」が並ぶ掲示板で、
--   気になった人が返信して会話が続く形。
--
-- 決めたこと:
--   * 位置は**1点**（開始だけ）。範囲の指定はやめる。
--     「12:34 のところ」と言えれば足りる。終わりを決めるほうが難しい。
--   * 既定はコーチとスタッフまで。**コメント単位で部内全員に開ける**。
--     開けられるのは書いた本人だけ。他人が勝手に広げない（29章と同じ）。
--   * コメントは動画より広くは見えない。
--     動画が見えない人に、そのコメントだけ見せる意味がない。
--   * 返信は1段だけ。枝分かれは追いにくく、部活の会話には要らない。
--   * 宛先（メンション）を持つ。呼ばれた人には通知が飛ぶ。
--
-- 既存の feedback_requests は残す（過去のやり取りを消さない）。
-- 新しく作る入口はこちらに寄せる。
-- =============================================================

-- -------------------------------------------------------------
-- その動画が、いまの利用者に見えるか
--
-- videos_select と同じ規則。ここを直したらあちらも直すこと。
-- ポリシーの中から videos を引くと、あちらの select ポリシーに
-- 引っかかって堂々巡りになるため、security definer で切る（0022 と同じ）。
-- -------------------------------------------------------------
create or replace function app.can_see_video(p_video_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.videos v
    where v.id = p_video_id
      and v.deleted_at is null
      and app.is_team_member(v.team_id)
      and (
        v.created_by = app.current_profile_id()
        or (v.visibility = 'team' and app.has_permission(v.team_id, 'video.view_team'))
        or app.has_permission(v.team_id, 'video.feedback_answer')
        or app.has_permission(v.team_id, 'storage.manage')
      )
  );
$$;

revoke all on function app.can_see_video(uuid) from public;
grant execute on function app.can_see_video(uuid) to authenticated;

-- -------------------------------------------------------------
-- 書き込み
-- -------------------------------------------------------------
create table if not exists public.video_comments (
  id            uuid primary key default gen_random_uuid(),
  team_id       uuid not null references public.teams(id) on delete cascade,
  video_id      uuid not null references public.videos(id) on delete cascade,
  author_id     uuid not null references public.profiles(id) on delete cascade,

  -- 返信。1段だけ。返信への返信は、同じ親にぶら下げる。
  parent_id     uuid references public.video_comments(id) on delete cascade,

  -- 動画のどこか。動画全体について書くときは null。
  at_seconds    numeric(9, 2) check (at_seconds >= 0),

  body          text not null check (length(btrim(body)) > 0),

  -- 既定はコーチとスタッフまで。本人が部内全員へ開ける。
  visibility    text not null default 'staff'
                  check (visibility in ('staff', 'team')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,

  -- 返信に時間は要らない。親の時間の話をしているため。
  check (parent_id is null or at_seconds is null)
);

create index if not exists video_comments_video_idx
  on public.video_comments (video_id, at_seconds nulls first, created_at);
create index if not exists video_comments_parent_idx
  on public.video_comments (parent_id, created_at);

create trigger video_comments_set_updated_at
  before update on public.video_comments
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- 宛先（メンション）
--
-- 別の表にする。本文に @名前 を書かせると、
-- 改名や同姓同名で壊れるうえ、誰に届いたのかが後から分からない。
-- -------------------------------------------------------------
create table if not exists public.video_comment_mentions (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references public.teams(id) on delete cascade,
  video_comment_id  uuid not null references public.video_comments(id) on delete cascade,
  team_member_id    uuid not null references public.team_members(id) on delete cascade,
  created_at        timestamptz not null default now(),

  unique (video_comment_id, team_member_id)
);

create index if not exists video_comment_mentions_member_idx
  on public.video_comment_mentions (team_member_id, created_at desc);

-- -------------------------------------------------------------
-- 参照先の筋を通す（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_video_comment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team     uuid;
  v_duration numeric;
  v_parent   public.video_comments;
begin
  select team_id, duration_seconds into v_team, v_duration
  from public.videos where id = new.video_id;

  if v_team is null then
    raise exception '対象の動画が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの動画には書き込めません';
  end if;

  -- 動画の長さを超える位置は、書き間違い。
  if new.at_seconds is not null and v_duration is not null and new.at_seconds > v_duration then
    raise exception '動画の長さ（%秒）を超えています', v_duration;
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.video_comments where id = new.parent_id;
    if v_parent.id is null then
      raise exception '返信先の書き込みが見つかりません';
    end if;
    if v_parent.video_id <> new.video_id then
      raise exception '別の動画の書き込みには返信できません';
    end if;
    if v_parent.parent_id is not null then
      raise exception '返信への返信はできません。同じ書き込みに返してください';
    end if;
    -- 返信は親の公開範囲に従う。親より広くも狭くもしない。
    new.visibility := v_parent.visibility;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists video_comments_validate on public.video_comments;
create trigger video_comments_validate
  before insert or update on public.video_comments
  for each row execute function app.validate_video_comment();

create or replace function app.validate_video_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment_team uuid;
  v_member_team  uuid;
begin
  select team_id into v_comment_team from public.video_comments where id = new.video_comment_id;
  select team_id into v_member_team from public.team_members where id = new.team_member_id;

  if v_comment_team is null or v_member_team is null then
    raise exception '宛先の指定が正しくありません';
  end if;
  if v_comment_team <> new.team_id or v_member_team <> new.team_id then
    raise exception '別のチームの人は宛先にできません';
  end if;

  return new;
end;
$$;

drop trigger if exists video_comment_mentions_validate on public.video_comment_mentions;
create trigger video_comment_mentions_validate
  before insert on public.video_comment_mentions
  for each row execute function app.validate_video_comment_mention();

-- -------------------------------------------------------------
-- 誰に見えるか
--
-- 動画が見えることが前提。そのうえで
--   * 部内全員に開けたもの
--   * 自分が書いたもの
--   * 自分が宛先になっているもの
--   * 回答する立場の人（コーチ・スタッフ）
-- -------------------------------------------------------------
alter table public.video_comments enable row level security;
alter table public.video_comment_mentions enable row level security;

create or replace function app.is_mentioned_in_comment(p_comment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.video_comment_mentions m
    join public.team_members tm on tm.id = m.team_member_id
    where m.video_comment_id = p_comment_id
      and tm.profile_id = app.current_profile_id()
  );
$$;

revoke all on function app.is_mentioned_in_comment(uuid) from public;
grant execute on function app.is_mentioned_in_comment(uuid) to authenticated;

drop policy if exists video_comments_select on public.video_comments;
create policy video_comments_select on public.video_comments
  for select to authenticated
  using (
    deleted_at is null
    and app.can_see_video(video_id)
    and (
      author_id = app.current_profile_id()
      or visibility = 'team'
      or app.has_permission(team_id, 'video.feedback_answer')
      or app.is_mentioned_in_comment(id)
    )
  );

-- 書けるのは動画が見える部員。差出人は偽れない。
drop policy if exists video_comments_insert on public.video_comments;
create policy video_comments_insert on public.video_comments
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and app.can_see_video(video_id)
    and author_id = app.current_profile_id()
  );

-- 直せるのは書いた本人だけ。公開範囲を広げるのも本人だけ。
drop policy if exists video_comments_update on public.video_comments;
create policy video_comments_update on public.video_comments
  for update to authenticated
  using (deleted_at is null and author_id = app.current_profile_id())
  with check (author_id = app.current_profile_id());

drop policy if exists video_comment_mentions_select on public.video_comment_mentions;
create policy video_comment_mentions_select on public.video_comment_mentions
  for select to authenticated
  using (
    exists (
      select 1 from public.video_comments c
      where c.id = video_comment_id and c.deleted_at is null
    )
    and app.is_team_member(team_id)
  );

drop policy if exists video_comment_mentions_insert on public.video_comment_mentions;
create policy video_comment_mentions_insert on public.video_comment_mentions
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and exists (
      select 1 from public.video_comments c
      where c.id = video_comment_id
        and c.author_id = app.current_profile_id()
    )
  );

grant select, insert, update on public.video_comments to authenticated;
grant select, insert, delete on public.video_comment_mentions to authenticated;

-- -------------------------------------------------------------
-- 取り消し
--
-- 0019 以降、閲覧の条件に deleted_at is null が入っているので
-- 素朴な update では消せない。関数を通す。
-- 消せるのは書いた本人だけ。
-- -------------------------------------------------------------
create or replace function public.soft_delete_video_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.video_comments;
begin
  select * into v_row from public.video_comments
  where id = p_comment_id and deleted_at is null;

  if v_row.id is null then
    raise exception '対象の書き込みが見つかりません';
  end if;

  if v_row.author_id <> app.current_profile_id() then
    raise exception '自分が書いたものだけ消せます';
  end if;

  -- 親を消したら、ぶら下がっている返信も一緒に畳む。
  -- 返事だけが宙に浮いて残るほうが分かりにくい。
  update public.video_comments
  set deleted_at = now()
  where id = p_comment_id or parent_id = p_comment_id;
end;
$$;

revoke all on function public.soft_delete_video_comment(uuid) from public;
grant execute on function public.soft_delete_video_comment(uuid) to authenticated;

-- -------------------------------------------------------------
-- 通知の種別を足す
-- -------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_commented',
    'video_commented', 'video_mentioned',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0025_youtube_connection.sql ----------
-- =============================================================
-- 0025_youtube_connection.sql
-- 部の YouTube チャンネルとつなぐ（24章の自動化）。
--
-- なぜ認証が要るか:
--   部の映像は限定公開で置いてある。
--   限定公開の動画は、外から一覧を引けない。存在すら見えない。
--   チャンネルの持ち主として認証したときだけ見える。
--   つまりこの取り込みは「持ち主の許可」の上に成り立っている。
--
-- 何を預かるか:
--   Google の**更新トークン**。これは
--   「そのチャンネルの動画一覧を、いつでも読める鍵」に等しい。
--   パスワードと同じ重さで扱う（0021 の招待トークンと同じ考え方）。
--
--   * ブラウザへ渡さない
--   * **ログインした利用者からも読めない**
--     管理者であっても、画面から鍵そのものを見る用は無い。
--     読めるのは、サーバ側の service role だけ。
--   * 画面に出すのは「つながっているか」「チャンネル名」「最後に取り込んだ時刻」だけ
--
-- 鍵を置く表に authenticated の grant を与えない、という形で守る。
-- RLS で絞るのではなく、そもそも触れないようにする。
-- =============================================================

create table if not exists public.youtube_connections (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,

  channel_id         text not null,
  channel_title      text,
  /** 動画一覧の入口。チャンネルごとに決まる。 */
  uploads_playlist_id text,

  -- ここが鍵。service role からしか読めない。
  refresh_token      text not null,

  connected_by       uuid not null references public.profiles(id) on delete cascade,
  connected_at       timestamptz not null default now(),
  last_synced_at     timestamptz,
  last_result        text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  -- 1チームに1つ。複数チャンネルは、要るようになってから考える。
  unique (team_id)
);

create trigger youtube_connections_set_updated_at
  before update on public.youtube_connections
  for each row execute function app.set_updated_at();

alter table public.youtube_connections enable row level security;

-- **grant を与えない。** authenticated からは select も insert もできない。
-- 触るのはサーバ側（service role）だけ。
revoke all on public.youtube_connections from authenticated;
revoke all on public.youtube_connections from anon;

-- -------------------------------------------------------------
-- 画面に出すぶんだけを返す
--
-- 鍵は返さない。つながっているかどうかと、最後の結果だけ。
-- 見られるのはそのチームのスタッフ。
-- -------------------------------------------------------------
create or replace function public.youtube_connection_status(p_team_id uuid)
returns table (
  connected      boolean,
  channel_title  text,
  connected_at   timestamptz,
  last_synced_at timestamptz,
  last_result    text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_staff(p_team_id) then
    raise exception 'チャンネルの接続状況を見る権限がありません';
  end if;

  return query
  select
    true,
    c.channel_title,
    c.connected_at,
    c.last_synced_at,
    c.last_result
  from public.youtube_connections c
  where c.team_id = p_team_id;

  if not found then
    return query select false, null::text, null::timestamptz, null::timestamptz, null::text;
  end if;
end;
$$;

revoke all on function public.youtube_connection_status(uuid) from public;
grant execute on function public.youtube_connection_status(uuid) to authenticated;

-- -------------------------------------------------------------
-- 取り込んだ動画に印を付ける
--
-- 手で登録したものと区別できるようにする。
-- 「自動で入ったものは自動で直る」「手で入れたものは触らない」を
-- 後から見分けられるようにするため。
-- -------------------------------------------------------------
alter table public.videos
  add column if not exists imported_from_channel boolean not null default false;

comment on column public.videos.imported_from_channel is
  'チャンネルから自動で取り込んだものか。手で登録したものと区別する。';

