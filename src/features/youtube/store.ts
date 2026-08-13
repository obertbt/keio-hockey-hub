import 'server-only';

import { createAdminClient } from '@/lib/supabase/server';
import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * チャンネル連携の保管（0025）。
 *
 * 更新トークンは **service role からしか触れない**。
 * 画面にも、ログインした利用者にも渡さない。
 * そのため、ここだけは admin クライアントを使う。
 *
 * 使う場所を1か所に閉じておく。あちこちで admin を掴むと、
 * どこから鍵に触れるのかが追えなくなる（ADR-0003 と同じ理由）。
 */

export interface ConnectionStatus {
  connected: boolean;
  channelTitle: string | null;
  connectedAt: string | null;
  lastSyncedAt: string | null;
  lastResult: string | null;
}

/** 画面に出すぶん。鍵は返らない。 */
export async function getConnectionStatus(session: AppSession): Promise<ConnectionStatus> {
  const supabase = await createClient();
  const { data } = await supabase.rpc('youtube_connection_status', { p_team_id: session.teamId });

  const row = data?.[0];
  return {
    connected: row?.connected ?? false,
    channelTitle: row?.channel_title ?? null,
    connectedAt: row?.connected_at ?? null,
    lastSyncedAt: row?.last_synced_at ?? null,
    lastResult: row?.last_result ?? null,
  };
}

/** つなぐ。すでにあれば取り替える。 */
export async function saveConnection(input: {
  teamId: string;
  channelId: string;
  channelTitle: string;
  uploadsPlaylistId: string;
  refreshToken: string;
  connectedBy: string;
}): Promise<{ error?: string }> {
  const admin = createAdminClient();

  const { error } = await admin.from('youtube_connections').upsert(
    {
      team_id: input.teamId,
      channel_id: input.channelId,
      channel_title: input.channelTitle,
      uploads_playlist_id: input.uploadsPlaylistId,
      refresh_token: input.refreshToken,
      connected_by: input.connectedBy,
      connected_at: new Date().toISOString(),
      last_synced_at: null,
      last_result: null,
    },
    { onConflict: 'team_id' },
  );

  // 失敗の中身に鍵は含まれない（列名しか出ない）ので、そのまま返してよい
  return error ? { error: error.message } : {};
}

/** 取り込みのときだけ、鍵を取り出す。 */
export async function loadConnection(teamId: string): Promise<{
  refreshToken: string;
  uploadsPlaylistId: string;
  channelTitle: string | null;
} | null> {
  const admin = createAdminClient();

  const { data } = await admin
    .from('youtube_connections')
    .select('refresh_token, uploads_playlist_id, channel_title')
    .eq('team_id', teamId)
    .maybeSingle();

  if (!data?.refresh_token || !data.uploads_playlist_id) return null;

  return {
    refreshToken: data.refresh_token,
    uploadsPlaylistId: data.uploads_playlist_id,
    channelTitle: data.channel_title,
  };
}

/**
 * つながっているチームを全部。定期実行から使う。
 *
 * 鍵は返さない。取り込みは teamId ごとに loadConnection を通す。
 */
export async function listConnectedTeams(): Promise<{ teamId: string; connectedBy: string }[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('youtube_connections').select('team_id, connected_by');
  return (data ?? []).map((row) => ({ teamId: row.team_id, connectedBy: row.connected_by }));
}

/** 取り込みの結果を残す。次に開いたとき、何が起きたか分かるように。 */
export async function recordSyncResult(teamId: string, result: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from('youtube_connections')
    .update({ last_synced_at: new Date().toISOString(), last_result: result.slice(0, 500) })
    .eq('team_id', teamId);
}

/** つなぎを解く。鍵ごと消す。 */
export async function removeConnection(teamId: string): Promise<{ error?: string }> {
  const admin = createAdminClient();
  const { error } = await admin.from('youtube_connections').delete().eq('team_id', teamId);
  return error ? { error: error.message } : {};
}
