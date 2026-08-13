create table if not exists public.youtube_connections (
  id                 uuid primary key default gen_random_uuid(),
  team_id            uuid not null references public.teams(id) on delete cascade,

  channel_id         text not null,
  channel_title      text,
  /** 動画一覧の入口。チャンネルごとに決まる。 */
  uploads_playlist_id text,

  refresh_token      text not null,

  connected_by       uuid not null references public.profiles(id) on delete cascade,
  connected_at       timestamptz not null default now(),
  last_synced_at     timestamptz,
  last_result        text,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  unique (team_id)
);

create trigger youtube_connections_set_updated_at
  before update on public.youtube_connections
  for each row execute function app.set_updated_at();

alter table public.youtube_connections enable row level security;

revoke all on public.youtube_connections from authenticated;
revoke all on public.youtube_connections from anon;

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

alter table public.videos
  add column if not exists imported_from_channel boolean not null default false;

comment on column public.videos.imported_from_channel is
  'チャンネルから自動で取り込んだものか。手で登録したものと区別する。';
