/**
 * ログインなしで開ける道と、素性が取れなかった人の行き先（0029）。
 *
 * proxy と画面の**両方**がここを見る。
 * 別々に持つと、片方だけ直したときに送り返し合いになる。
 * 実際に一度そうなって、アプリが開かなくなった。
 */

export const PUBLIC_PATHS = [
  '/login',
  '/reset-password',
  '/invite',
  '/auth',
  '/setup-check',
  /*
    ログインはできたが、まだ部員として登録されていない人の行き止まり。
    **ここを公開の道から外さないこと。**
    外すと proxy が /today へ戻し、/today がまた送り返して、無限に往復する。
  */
  '/no-team',
] as const;

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * 素性が取れなかったとき、どこへ送るか。
 *
 * **ログインできている人を /login へ送ってはいけない。**
 * proxy が「ログイン済み」と見て /today へ戻すので、往復が終わらない。
 */
export function destinationWithoutSession(isLoggedIn: boolean): '/no-team' | '/login' {
  return isLoggedIn ? '/no-team' : '/login';
}
