import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { syncAllChannels, syncChannel } from '@/features/youtube/sync';
import { getAppSession, isStaff } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * 定期実行から取り込みを呼ぶ入口。
 *
 * 誰でも叩けてはいけないので、合言葉を確かめる。
 * 合言葉（CRON_SECRET）が未設定なら、**この入口は閉じたまま**にする。
 * 「設定を忘れたら誰でも通れる」が、いちばん危ない作り方なので。
 *
 * 画面から押す取り込みは、ログイン済みのスタッフとして通す。
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (secret && matches(secret, provided)) {
    // 定期実行。つながっているチームを全部まわす。
    const results = await syncAllChannels();
    return Response.json({ results });
  }

  // 合言葉が合わなければ、ログインしているスタッフとして扱う
  const session = await getAppSession();
  if (!session || !isStaff(session)) {
    return Response.json({ error: '権限がありません。' }, { status: 403 });
  }

  const result = await syncChannel({ teamId: session.teamId, profileId: session.profileId });
  return Response.json(result, { status: result.error ? 500 : 200 });
}

/** 長さを見てから比べる。応答時間から答えを探られないようにする。 */
function matches(expected: string, provided: string): boolean {
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
