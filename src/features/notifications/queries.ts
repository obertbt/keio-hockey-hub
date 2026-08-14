import 'server-only';

import { createClient } from '@/lib/supabase/server';

/**
 * 登録した端末の一覧（0028）。
 *
 * **鍵（endpoint / p256dh / auth）は選ばない。**
 * 画面に要るのは「どの端末をいつ登録したか」だけ。
 * 選ばなければ、うっかり画面へ渡ることもない（0023 と同じ考え方）。
 *
 * RLS が「自分のものだけ」に絞るので、他人の端末は返らない。
 */
export interface PushDevice {
  id: string;
  label: string | null;
  created_at: string;
  last_success_at: string | null;
}

export async function listMyPushDevices(): Promise<PushDevice[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('push_subscriptions')
    .select('id, label, created_at, last_success_at')
    .order('created_at', { ascending: false });

  return data ?? [];
}
