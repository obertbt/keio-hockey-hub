'use server';

import webpush from 'web-push';

import { isStaff, requireSession } from '@/lib/auth/session';

/**
 * 通知の鍵をその場で作る（0028）。
 *
 * タブレットしか無い人でも設定を終えられるようにする。
 * 外のサイトを頼ると、その形式が違ったときに
 * **「applicationServerKey is not valid」としか出ない**。
 * 実際にそれで詰まった。
 *
 * 作った鍵はどこにも保存しない。画面に出すだけ。
 * 保存すると、DB を見られる人が全員に通知を送れるようになる。
 */
export interface KeygenState {
  publicKey?: string;
  privateKey?: string;
  error?: string;
}

export async function generateVapidKeys(): Promise<KeygenState> {
  const session = await requireSession();
  if (!isStaff(session)) return { error: '鍵を作れるのはスタッフだけです。' };

  const keys = webpush.generateVAPIDKeys();
  return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}
