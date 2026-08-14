import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { readUserId } from '@/lib/supabase/claims';
import { env, getServerEnv } from '@/lib/env';
import type { Database } from '@/types/database.types';

/**
 * Server Component / Server Action / Route Handler 用クライアント。
 *
 * Server Component からは Cookie を書き込めないため、set が失敗しても無視する。
 * セッションの更新は proxy 側でまとめて行う。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component からの呼び出し。proxy が更新するため問題ない。
        }
      },
    },
  });
}

/**
 * RLS を迂回する管理用クライアント。
 *
 * 使ってよいのは、RLS では表現できない処理だけ:
 *   - 招待の受け入れ（まだどのチームにも属していない人を処理する）
 *   - R2 の物理削除など、バックグラウンド処理
 *
 * 呼ぶ前に必ずアプリ側で権限を確認すること（75章: 両方で守る）。
 */
export function createAdminClient() {
  const { SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // 管理用クライアントはセッションを持たない
      },
    },
  });
}

/**
 * 署名を確かめて、ログイン中の利用者の id を取り出す。ログインしていなければ null。
 *
 * `getSession()` は Cookie の中身をそのまま信じるため、サーバー側では使わない。
 *
 * `getClaims()` は Cookie の中の署名を**その場で確かめる**。
 * 鍵が公開鍵方式（ECC/RSA）なら通信は起きない。
 * 共通鍵方式のままなら、これまでどおり Auth サーバーへ聞きに行く。
 * つまり **これまでより緩くなることはない**。
 *
 * なぜ `getUser()` から変えたか:
 *   あちらは毎回 Auth サーバーへの往復が入る。
 *   画面を1枚出すのに proxy とページの2か所で呼んでいたので、
 *   何も起きていない時間が往復2回ぶん積まれていた。
 *
 * 確かめた署名を信じてよいのか:
 *   **データベースが同じものを信じている。**
 *   RLS の `auth.uid()` は、この同じ Cookie の中の JWT から取っている。
 *   ここだけ別の信じ方をしても、守りは1ミリも厚くならない。
 *
 * 引き換えに手放したもの:
 *   退部などで利用者を消したとき、`getUser()` なら次の1回で弾ける。
 *   こちらは手元の JWT が切れるまで（既定で最大1時間）通ってしまう。
 *   ただしその間も、見えるものは RLS が決める。
 *   所属を外せば、その人に見えるものは無くなる。
 */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  return readUserId(supabase);
}
