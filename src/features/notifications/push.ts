import 'server-only';

import webpush from 'web-push';

import { vapidKeys } from '@/lib/env';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * スマートフォンへの通知を送る（0028）。
 *
 * **ここは 'use server' に置かない。** 呼ぶ側が認可を通したあとで使う。
 *
 * 送り先（endpoint / p256dh / auth）は「その端末に通知を出せる鍵」なので、
 * 画面には一切返さない。service role から引いて、ここで使って捨てる。
 *
 * 送れなくても本来の処理は止めない。
 * 通知はおまけで、日報や書き込みが保存されることのほうが大事。
 */

/** その端末はもう無い、を表す応答。 */
const GONE = new Set([404, 410]);

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  /** 同じ話の通知をまとめる目印。開くまでに同じものが並ばないように。 */
  tag?: string;
}

export async function sendPush(memberIds: string[], payload: PushPayload): Promise<void> {
  const targets = [...new Set(memberIds)].filter((id) => id !== '');
  if (targets.length === 0) return;

  const keys = vapidKeys();
  // 鍵が無ければ、そもそもこの機能を使わない設定。黙って何もしない。
  // アプリ内の通知は別に残っているので、ここで止める理由はない。
  if (!keys) return;

  const admin = createAdminClient();
  const { data: subscriptions, error } = await admin.rpc('list_push_targets', {
    p_team_member_ids: targets,
  });

  if (error) {
    console.warn(`[push] 送り先を引けませんでした: ${error.message}`);
    return;
  }
  if (!subscriptions || subscriptions.length === 0) return;

  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);

  const message = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
  });

  // 1台ずつ独立して送る。1台の失敗で残りを止めない。
  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth },
          },
          message,
          // 通知は鮮度が命。届かないまま溜めても意味がない。
          { TTL: 60 * 60 * 12 },
        );
        await admin.rpc('record_push_result', { p_endpoint: subscription.endpoint, p_ok: true });
      } catch (unexpected) {
        const status = statusOf(unexpected);

        // 端末を初期化した・アプリを消した。すぐ片付ける。
        // 残しておくと、送るたびに失敗し続ける。
        if (status !== null && GONE.has(status)) {
          await admin.rpc('drop_push_subscription', { p_endpoint: subscription.endpoint });
          return;
        }

        // それ以外は数えるだけ。電波が悪かっただけの人を切らない。
        await admin.rpc('record_push_result', { p_endpoint: subscription.endpoint, p_ok: false });

        // **送り先や鍵そのものはログに残さない**（62章）。
        console.warn(`[push] 送れませんでした（${status ?? '不明'}）`);
      }
    }),
  );
}

/** web-push が投げるエラーから、応答の番号だけを取り出す。 */
function statusOf(error: unknown): number | null {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const status = (error as { statusCode: unknown }).statusCode;
    if (typeof status === 'number') return status;
  }
  return null;
}
