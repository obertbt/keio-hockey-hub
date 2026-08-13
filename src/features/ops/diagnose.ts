import 'server-only';

import { getAppSession } from '@/lib/auth/session';
import { createClient, getCurrentUser } from '@/lib/supabase/server';

/**
 * サーバー側から見た自己診断（79章の運用の話）。
 *
 * 設定が入っているかだけでは足りなかった。
 * 実際に起きたのは「設定は済んでいるのに、中の画面だけ落ちる」で、
 * 原因を知るには置き場所のログを掘るしかなかった。
 *
 * **画面から自分で調べられるようにする。**
 * 依頼書3章の11「自分たちで長く運用できる」は、
 * 動かなくなった時に自力で切り分けられることまで含む。
 *
 * ここは順に確かめる。前が駄目なら後ろは見ない。
 * 「最初に倒れた場所」だけが知りたいことなので。
 */

export type CheckState = 'ok' | 'ng' | 'skip';

export interface DiagnosisItem {
  label: string;
  state: CheckState;
  /** 何が起きたか。利用者に見せる短い言葉。 */
  detail: string;
  /** 次にやること。 */
  next?: string;
}

/** 画面に出す文字列にする。長すぎるものは切る。 */
function short(message: string): string {
  const trimmed = message.trim().replace(/\s+/g, ' ');
  return trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
}

export async function diagnose(): Promise<DiagnosisItem[]> {
  const items: DiagnosisItem[] = [];

  // 1. サーバーから Supabase へ届くか
  const supabase = await createClient();
  const { error: reachError } = await supabase.from('teams').select('id').limit(1);

  if (reachError) {
    items.push({
      label: 'サーバーから Supabase へつながるか',
      state: 'ng',
      detail: short(reachError.message),
      next: 'URL と鍵が正しいか、Vercel の環境変数を確かめてください。値を変えたら Redeploy が要ります。',
    });
    return items;
  }
  items.push({
    label: 'サーバーから Supabase へつながるか',
    state: 'ok',
    detail: 'つながっています。',
  });

  // 2. 表と関数がそろっているか
  const { error: rpcError } = await supabase.rpc('list_submission_status', {
    p_team_id: '00000000-0000-0000-0000-000000000000',
    p_date: '2000-01-01',
  });

  // 権限が無い、は「関数が在る」ということ。ここでは在るかどうかだけを見る。
  const missingFunction =
    rpcError !== null && /(does not exist|could not find|schema cache)/i.test(rpcError.message);

  items.push({
    label: '必要な関数がそろっているか',
    state: missingFunction ? 'ng' : 'ok',
    detail: missingFunction ? short(rpcError.message) : 'そろっています。',
    next: missingFunction ? 'supabase/parts/ の 01 から 07 を、番号順に流し直してください。' : undefined,
  });

  // 3. ログインしているか
  const user = await getCurrentUser();
  if (!user) {
    items.push({
      label: 'ログインしているか',
      state: 'skip',
      detail: 'ログインしていません。ここから先はログイン後に確かめられます。',
    });
    return items;
  }
  items.push({ label: 'ログインしているか', state: 'ok', detail: 'しています。' });

  // 4. そのログインが部員に結び付いているか
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle();

  if (profileError || !profile) {
    items.push({
      label: 'ログインと人の登録が結び付いているか',
      state: 'ng',
      detail: profileError ? short(profileError.message) : 'この利用者に対応する人の登録がありません。',
      next: 'supabase/setup/first-admin.sql を、いまログインしているメールアドレスで流してください。',
    });
    return items;
  }
  items.push({
    label: 'ログインと人の登録が結び付いているか',
    state: 'ok',
    detail: `${profile.full_name} として登録されています。`,
  });

  // 5. チームに所属しているか
  const { data: membership, error: membershipError } = await supabase
    .from('team_members')
    .select('id, role_code, team_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    items.push({
      label: 'チームに所属しているか',
      state: 'ng',
      detail: membershipError ? short(membershipError.message) : '在籍中の所属がありません。',
      next: 'supabase/setup/first-admin.sql を流してください。',
    });
    return items;
  }
  items.push({
    label: 'チームに所属しているか',
    state: 'ok',
    detail: `${membership.role_code} として在籍しています。`,
  });

  // 6. 権限のマスタが入っているか
  //    ここが空だと、画面は開けるのに何も操作できない状態になる。
  const { count, error: permissionError } = await supabase
    .from('role_permissions')
    .select('*', { count: 'exact', head: true });

  const hasPermissions = !permissionError && (count ?? 0) > 0;
  items.push({
    label: '役割と権限のマスタが入っているか',
    state: hasPermissions ? 'ok' : 'ng',
    detail: permissionError
      ? short(permissionError.message)
      : hasPermissions
        ? `${count} 件`
        : '1件も入っていません。',
    next: hasPermissions ? undefined : 'supabase/parts/05.sql を流し直してください。',
  });

  // 7. 「今日」が組み立てられるか
  //    ここまで通っていれば、あとは実際に読んでみるのが早い。
  const session = await getAppSession();
  if (!session) {
    items.push({
      label: '「今日」を組み立てられるか',
      state: 'ng',
      detail: 'ログイン情報から所属を決められませんでした。',
      next: '上の項目を先に直してください。',
    });
    return items;
  }

  const probes: { label: string; run: () => Promise<{ error: { message: string } | null }> }[] = [
    {
      label: 'シーズン',
      run: async () =>
        supabase.from('seasons').select('id').eq('team_id', session.teamId).limit(1).then(toResult),
    },
    {
      label: '予定',
      run: async () =>
        supabase.from('events').select('id').eq('team_id', session.teamId).limit(1).then(toResult),
    },
    {
      label: '日報',
      run: async () =>
        supabase.from('daily_reports').select('id').eq('team_id', session.teamId).limit(1).then(toResult),
    },
    {
      label: 'スキル',
      run: async () =>
        supabase.from('skills').select('id').eq('team_id', session.teamId).limit(1).then(toResult),
    },
    {
      label: 'お知らせ',
      run: async () =>
        supabase.from('notifications').select('id').eq('team_id', session.teamId).limit(1).then(toResult),
    },
    {
      label: '提出状況',
      run: async () =>
        supabase
          .rpc('list_submission_status', { p_team_id: session.teamId, p_date: '2000-01-01' })
          .then(toResult),
    },
  ];

  const failures: string[] = [];
  for (const probe of probes) {
    try {
      const { error } = await probe.run();
      if (error) failures.push(`${probe.label}: ${short(error.message)}`);
    } catch (unexpected) {
      failures.push(`${probe.label}: ${short(String(unexpected))}`);
    }
  }

  items.push({
    label: '「今日」が読むものを、ひとつずつ確かめる',
    state: failures.length === 0 ? 'ok' : 'ng',
    detail: failures.length === 0 ? 'すべて読めました。' : failures.join(' / '),
    next: failures.length === 0 ? undefined : '上に出ている表や関数が足りていません。',
  });

  return items;
}

function toResult(response: { error: { message: string } | null }): { error: { message: string } | null } {
  return { error: response.error };
}
