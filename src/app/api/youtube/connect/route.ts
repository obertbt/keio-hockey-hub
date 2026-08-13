import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { buildAuthUrl, redirectUriFor } from '@/features/youtube/lib/oauth';
import { googleCredentials } from '@/features/youtube/client';
import { currentAppUrl } from '@/lib/app-url';
import { isStaff, requireSession } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/** 差し替えを防ぐ合言葉の置き場所。使い捨て。 */
const STATE_COOKIE = 'yt_oauth_state';

/**
 * チャンネル連携をはじめる。
 *
 * 押した人がスタッフであることを、ここで確かめる。
 * この先で預かるのは「チャンネルの動画を読める鍵」なので、
 * 誰でも始められてはいけない。
 */
export async function GET() {
  const session = await requireSession();
  if (!isStaff(session)) redirect('/today?denied=youtube');

  const credentials = googleCredentials();
  if (!credentials) redirect('/admin/youtube?error=missing_credentials');

  const state = randomBytes(24).toString('base64url');

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 10 * 60,
  });

  redirect(
    buildAuthUrl({
      clientId: credentials.clientId,
      redirectUri: redirectUriFor(await currentAppUrl()),
      state,
    }),
  );
}
