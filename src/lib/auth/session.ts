import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { readUserId } from '@/lib/supabase/claims';
import { createClient } from '@/lib/supabase/server';
import type { Permission } from '@/lib/auth/permissions';
import { hasPermission, isStaffRole } from '@/lib/auth/permissions';
import { destinationWithoutSession } from '@/lib/auth/public-paths';
import { parseSessionRow, type SessionRow } from '@/lib/auth/session-row';

/**
 * ログイン中の利用者と、その所属チームでの立場。
 *
 * 画面と Server Action はここを起点にする。
 * 「権限を確認する場所」を1か所にまとめるための層（75章）。
 *
 * 中身は `current_session()` が返すものそのまま（0029）。
 * 同じ形を2か所に書くと、片方だけ直したときに気づけない。
 */
export type AppSession = SessionRow;

/**
 * 現在のセッションを組み立てる。まだチームに属していなければ null。
 *
 * React の cache でリクエスト内は1回だけ引く。
 * 1画面で何度も呼んでも問い合わせは増えない。
 *
 * 0029: ここは profiles → team_members → member_permissions と
 * 3回に分けて聞いていた。前のこたえが無いと次を聞けないので、
 * 往復3回ぶんがそのまま待ち時間になっていた。
 * 1回で返す関数を用意して、1往復にした。
 */
export const getAppSession = cache(async (): Promise<AppSession | null> => {
  const supabase = await createClient();

  /*
    先に「そもそもログインしているか」を見る。

    ここを飛ばすと、ログインしていない人の要求が
    `current_session()` まで届いて「権限がありません」で落ちる。
    それは**エラーではなく、ただの未ログイン**なので、
    区別できる形にしておく。

    署名の確認はその場で終わる（0029）ので、この1行に往復は無い。
  */
  const userId = await readUserId(supabase);
  if (!userId) return null;

  const { data, error } = await supabase.rpc('current_session');

  /*
    **ここで null を返してはいけない。**

    null は「まだ部員として登録されていない」という意味に使っている。
    データベース側の不具合まで null にすると、
    ログインできている人が「未ログイン扱い」になり、
      proxy「ログイン済みだから /today へ」
      画面「素性が取れないから /login へ」
    と互いに送り返し合って、**画面が開かなくなる**。
    実際にそうなった（0029 を流す前のデプロイ）。

    直せる形で、はっきり止める。
  */
  if (error) {
    throw new Error(
      error.code === 'PGRST202'
        ? 'データベースの更新がまだ済んでいません。Supabase の SQL Editor で supabase/updates/0029.sql を実行してください。'
        : `ログイン情報を読み取れませんでした（${error.code ?? 'unknown'}）。`,
    );
  }

  return parseSessionRow(data);
});

/**
 * ログイン必須のページで使う。
 *
 * 行き先を2つに分ける。ここを1つにすると、送り返し合いになる。
 *   * ログインしていない      → ログイン画面
 *   * ログインはできたが部員でない → 説明の画面（proxy が /today へ戻さない場所）
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (session) return session;

  const supabase = await createClient();
  const userId = await readUserId(supabase);

  redirect(destinationWithoutSession(userId !== null));
}

/**
 * 権限必須のページ・Server Action で使う。
 *
 * RLS でも守られているが、アプリ側でも必ず確認する（75章）。
 * RLS だけに頼ると「0件が返るだけ」で、利用者には理由が分からない。
 */
export async function requirePermission(permission: Permission): Promise<AppSession> {
  const session = await requireSession();
  if (!hasPermission({ role: session.role, overrides: session.overrides }, permission)) {
    redirect('/today?denied=' + encodeURIComponent(permission));
  }
  return session;
}

/**
 * スタッフ（管理者・コーチ・マネージャー）だけの画面で使う。
 *
 * 特定の権限ではなく立場で決まるもの（監査ログ、チャンネル連携）に使う。
 * RLS 側も同じ条件（app.is_staff）で守っている。
 */
export async function requireStaff(): Promise<AppSession> {
  const session = await requireSession();
  if (!isStaffRole(session.role)) {
    redirect('/today?denied=' + encodeURIComponent('スタッフ限定'));
  }
  return session;
}

/** 画面の出し分け用。リダイレクトはしない。 */
export function can(session: AppSession, permission: Permission): boolean {
  return hasPermission({ role: session.role, overrides: session.overrides }, permission);
}

export function isStaff(session: AppSession): boolean {
  return isStaffRole(session.role);
}
