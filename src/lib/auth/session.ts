import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import type { Permission } from '@/lib/auth/permissions';
import { hasPermission, isStaffRole } from '@/lib/auth/permissions';
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

  const { data, error } = await supabase.rpc('current_session');
  if (error) return null;

  return parseSessionRow(data);
});

/**
 * ログイン必須のページで使う。未ログインならログイン画面へ送る。
 */
export async function requireSession(): Promise<AppSession> {
  const session = await getAppSession();
  if (!session) {
    redirect('/login');
  }
  return session;
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
