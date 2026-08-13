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
