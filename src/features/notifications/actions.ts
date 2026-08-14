'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

/**
 * 端末の登録（0028）。
 *
 * 入るのは「その端末に通知を出せる鍵」。
 *   * 誰の端末かは**サーバが決める**。画面から受け取らない
 *   * 消せるのは本人だけ（RLS も同じ条件で守っている）
 *   * 画面には鍵を返さない
 */

export interface PushActionState {
  error?: string;
  success?: string;
}

const subscribeSchema = z.object({
  endpoint: z.url('登録の情報が正しくありません。'),
  p256dh: z.string().min(1, '登録の情報が正しくありません。'),
  auth: z.string().min(1, '登録の情報が正しくありません。'),
  label: z
    .string()
    .max(60)
    .optional()
    .transform((value) => {
      const trimmed = value?.trim() ?? '';
      return trimmed === '' ? null : trimmed;
    }),
});

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** この端末で通知を受け取る。 */
export async function subscribeToPush(
  _prevState: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  const session = await requireSession();

  const parsed = subscribeSchema.safeParse({
    endpoint: text(formData, 'endpoint'),
    p256dh: text(formData, 'p256dh'),
    auth: text(formData, 'auth'),
    label: text(formData, 'label'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? '登録できませんでした。' };
  }
  const input = parsed.data;

  const supabase = await createClient();

  /*
    同じ端末を登録し直すことは普通にある（許可を切って戻した、など）。
    そのたびに増えると、**同じ通知が何度も鳴る**。
    endpoint を鍵にして、あれば上書きする。
  */
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      team_id: session.teamId,
      // 誰の端末かはサーバが決める。画面から受け取らない。
      team_member_id: session.teamMemberId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      label: input.label,
      failure_count: 0,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return { error: `登録できませんでした: ${error.message}` };

  revalidatePath('/settings');
  return { success: 'この端末で通知を受け取ります。' };
}

/** この端末では受け取らない。 */
export async function unsubscribeFromPush(
  _prevState: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  await requireSession();

  const endpoint = text(formData, 'endpoint');
  if (endpoint === '') return { error: '対象の端末が分かりません。' };

  const supabase = await createClient();
  // RLS が「自分のものだけ」に絞る。他人の端末は消えない。
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);

  if (error) return { error: `解除できませんでした: ${error.message}` };

  revalidatePath('/settings');
  return { success: 'この端末では受け取らないようにしました。' };
}

/** 登録した端末を消す（一覧から）。 */
export async function removePushDevice(
  _prevState: PushActionState,
  formData: FormData,
): Promise<PushActionState> {
  await requireSession();

  const id = text(formData, 'subscription_id');
  if (id === '') return { error: '対象の端末が分かりません。' };

  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').delete().eq('id', id);

  if (error) return { error: `消せませんでした: ${error.message}` };

  revalidatePath('/settings');
  return { success: '登録を消しました。' };
}
