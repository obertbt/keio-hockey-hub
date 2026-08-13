import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextRequest } from 'next/server';

import { fetchMyChannel, googleCredentials } from '@/features/youtube/client';
import {
  GOOGLE_TOKEN_ENDPOINT,
  readTokenResponse,
  redirectUriFor,
  statesMatch,
  type TokenResponse,
} from '@/features/youtube/lib/oauth';
import { saveConnection } from '@/features/youtube/store';
import { currentAppUrl } from '@/lib/app-url';
import { isStaff, requireSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'yt_oauth_state';

/**
 * Google から戻ってくるところ。
 *
 * ここで更新トークンを受け取り、**サーバ側だけが読める場所**へ置く。
 * 画面にも、ログインした利用者にも渡さない（0025）。
 */
export async function GET(request: NextRequest) {
  const session = await requireSession();
  if (!isStaff(session)) redirect('/today?denied=youtube');

  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;
  store.delete(STATE_COOKIE);

  const params = request.nextUrl.searchParams;

  if (params.get('error')) {
    redirect('/admin/youtube?error=denied');
  }
  if (!statesMatch(expected, params.get('state'))) {
    // 合言葉が合わない。こちらが始めた手続きではない。
    redirect('/admin/youtube?error=state');
  }

  const code = params.get('code');
  const credentials = googleCredentials();
  if (!code || !credentials) redirect('/admin/youtube?error=missing_code');

  const redirectUri = redirectUriFor(await currentAppUrl());

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });

  const body = (await response.json()) as TokenResponse;
  const result = readTokenResponse(body);

  if ('error' in result) {
    // 鍵そのものは載せない（75章）。理由だけを渡す。
    redirect(`/admin/youtube?error=token&reason=${encodeURIComponent(result.error.slice(0, 200))}`);
  }

  // どのチャンネルにつながったかを、その場で確かめる
  const channel = await fetchMyChannel(body.access_token ?? '');

  const saved = await saveConnection({
    teamId: session.teamId,
    channelId: channel.channelId,
    channelTitle: channel.title,
    uploadsPlaylistId: channel.uploadsPlaylistId,
    refreshToken: result.refreshToken,
    connectedBy: session.profileId,
  });

  if (saved.error) {
    redirect(`/admin/youtube?error=save&reason=${encodeURIComponent(saved.error.slice(0, 200))}`);
  }

  redirect('/admin/youtube?connected=1');
}
