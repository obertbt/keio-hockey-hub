import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';

import { syncAllChannels, syncChannel } from '@/features/youtube/sync';
import { getAppSession, isStaff } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';
// 取り込みは時間がかかる。既定の10秒では途中で切れる。
export const maxDuration = 60;

/**
 * 定期実行から取り込みを呼ぶ入口。
 *
 * **GET と POST の両方を受ける。**
 * Vercel の定期実行は GET で呼び、`CRON_SECRET` を入れてあれば
 * `Authorization: Bearer ...` を自動で付けてくれる。
 * 外の定期実行サービスから POST で呼ぶこともある。
 * どちらでも同じことが起きるようにしておく。
 *
 * 誰でも叩けてはいけないので、合言葉を確かめる。
 * **合言葉（CRON_SECRET）が未設定なら、この入口は閉じたまま**にする。
 * 「設定を忘れたら誰でも通れる」が、いちばん危ない作り方なので。
 */
export async function GET(request: NextRequest) {
  return handle(request, { allowSession: false });
}

export async function POST(request: NextRequest) {
  // 画面から押す取り込みは、ログイン済みのスタッフとして通す。
  return handle(request, { allowSession: true });
}

async function handle(request: NextRequest, options: { allowSession: boolean }): Promise<Response> {
  const secret = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';

  if (secret && matches(secret, provided)) {
    const results = await syncAllChannels();
    return Response.json({ ok: true, results });
  }

  if (!options.allowSession) {
    // GET は定期実行のためだけの入口。合言葉が無ければ、ここで終わり。
    return Response.json(
      { error: secret ? '合言葉が違います。' : 'CRON_SECRET が設定されていません。' },
      { status: 401 },
    );
  }

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
