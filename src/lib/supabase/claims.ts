/**
 * Cookie の中の署名を確かめて、利用者の id を取り出す（0029）。
 *
 * proxy からもページからも呼ぶ。
 * proxy は `next/headers` を使えないので、この関数だけは
 * Cookie の取り方を知らないままにしてある（クライアントを受け取る形）。
 */

/** `getClaims()` を持っていれば何でもよい。 */
interface ClaimsReader {
  auth: {
    getClaims: () => Promise<{ data: { claims: { sub?: unknown } } | null; error: unknown }>;
  };
}

export async function readUserId(supabase: ClaimsReader): Promise<string | null> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) return null;

  // sub が利用者の id。入っていない形の JWT は受け付けない。
  const sub = data.claims.sub;
  return typeof sub === 'string' && sub !== '' ? sub : null;
}
