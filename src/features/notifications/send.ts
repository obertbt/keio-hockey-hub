import 'server-only';

import { randomUUID } from 'node:crypto';

import type { AppSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

import { sendPush } from './push';

/**
 * 知らせを送る（0028）。
 *
 * **ここは 'use server' に置かない。** 呼ぶ側が認可を通したあとで使う。
 *
 * ---------------------------------------------------------------
 * なぜ1か所にまとめたか（実際に起きた不具合）
 *
 * 「動画にコメントしたのに通知が来ない」と報告があった。
 * 5か所すべてが、こう書いてあった。
 *
 *   const { data, error } = await supabase
 *     .from('notifications').insert({...}).select('id').single();
 *   if (error || !data) return;          // ← ここで必ず抜けていた
 *   await supabase.from('notification_targets').insert(...);
 *
 * **insert のあとの .select() には、SELECT ポリシーが効く。**
 * notifications は「自分が宛先の通知だけ見える」ので、
 * 宛先を入れる前の通知は、作った本人にも見えない。
 * 行そのものは作られているのに `.single()` が 0 件で失敗し、
 * **宛先を入れずに黙って返っていた**。
 *
 * つまり「通知は作られたが、誰にも届かない行」が溜まっていた。
 *
 * 0015 のコメントは、まさにこの循環に気づいて
 * ポリシー側を security definer の関数に逃がしていた。
 * ところが**書き込む側の .select() は見落としていた**。
 * 同じ落とし穴の、反対側の口だった。
 *
 * 直し方: **読み返さない。** id をこちらで決めてから入れる。
 * 書いたものを読み返さなければ、SELECT ポリシーは関係なくなる。
 * ---------------------------------------------------------------
 */
export async function sendNotification(
  session: AppSession,
  input: {
    type: string;
    title: string;
    body?: string | null;
    linkPath?: string | null;
    relatedTable?: string | null;
    relatedId?: string | null;
    /** 宛先。空なら何もしない（誰にも飛ばさない、は正しい状態）。 */
    memberIds: string[];
  },
): Promise<{ error?: string }> {
  const targets = [...new Set(input.memberIds)].filter((id) => id !== '');
  if (targets.length === 0) return {};

  const supabase = await createClient();

  // id を先に決める。作ったあとに読み返さないで済む。
  const notificationId = randomUUID();

  const { error } = await supabase.from('notifications').insert({
    id: notificationId,
    team_id: session.teamId,
    notification_type: input.type,
    title: input.title,
    body: input.body ?? null,
    link_path: input.linkPath ?? null,
    related_table: input.relatedTable ?? null,
    related_id: input.relatedId ?? null,
    // 差出人はサーバが決める（0015）。
    created_by: session.profileId,
  });

  if (error) return { error: error.message };

  const { error: targetError } = await supabase.from('notification_targets').insert(
    targets.map((memberId) => ({
      notification_id: notificationId,
      team_member_id: memberId,
    })),
  );

  // ここで失敗すると「誰にも届かない通知」が残る。
  // 消しに行きたいところだが、notifications の delete は剥奪してある（0015）。
  // 黙って捨てず、呼び元が気づけるように理由を返す。
  if (targetError) return { error: targetError.message };

  /*
    0028: スマートフォンにも出す。

    アプリ内の通知は「開けば分かる」だけで、開かない人には届かない。
    ロック画面に出て初めて、返事が届いたことに気づける。

    **ここで失敗しても、アプリ内の通知は成立している。**
    送れなかったからといって、書き込みや日報を巻き戻さない。
    端末を登録していない人、鍵を設定していないチームでは
    何も起きないだけで、それで正しい。
  */
  await sendPush(targets, {
    title: input.title,
    body: input.body ?? '',
    url: input.linkPath ?? '/today',
    // 同じ場所についての通知は、後のもので置き換える。
    // 開くまでに同じ知らせが5件並ぶ、を避ける。
    tag: input.linkPath ?? undefined,
  });

  return {};
}
