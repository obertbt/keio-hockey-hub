'use server';

import { revalidatePath } from 'next/cache';

import { isStaff, requireSession } from '@/lib/auth/session';

import { removeConnection } from './store';
import { syncChannel } from './sync';

/**
 * チャンネル連携の操作（画面から押すもの）。
 *
 * 取り込み本体は sync.ts にある。
 * 'use server' から出した関数は外から直接呼べるので、
 * **ここに置くものには必ず認可の判断を入れる**。
 */

export interface YoutubeActionState {
  error?: string;
  success?: string;
}

/** 画面の「いま取り込む」ボタン。 */
export async function syncChannelNow(
  _prevState: YoutubeActionState,
  _formData: FormData,
): Promise<YoutubeActionState> {
  const session = await requireSession();
  if (!isStaff(session)) return { error: '取り込みはスタッフだけが行えます。' };

  const result = await syncChannel({ teamId: session.teamId, profileId: session.profileId });

  revalidatePath('/admin/youtube');
  revalidatePath('/videos');
  revalidatePath('/videos/team');

  return result.error ? { error: result.error } : { success: result.message };
}

/** つなぎを解く。鍵ごと消える。 */
export async function disconnectChannel(
  _prevState: YoutubeActionState,
  _formData: FormData,
): Promise<YoutubeActionState> {
  const session = await requireSession();
  if (!isStaff(session)) return { error: '解除はスタッフだけが行えます。' };

  const { error } = await removeConnection(session.teamId);
  if (error) return { error: `解除できませんでした: ${error}` };

  revalidatePath('/admin/youtube');
  return { success: 'チャンネルとのつながりを解きました。取り込んだ動画はそのまま残ります。' };
}
