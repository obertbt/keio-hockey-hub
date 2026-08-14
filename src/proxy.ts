import type { NextRequest } from 'next/server';

import { updateSession } from '@/lib/supabase/session';

/**
 * Next.js 16 で middleware は proxy に改称された。
 * ここでは認証セッションの更新と、未ログイン時のリダイレクトだけを行う。
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
      静的ファイルと画像以外のすべてのパスで認証セッションを更新する。

      **manifest.json と sw.js を外すこと。**

      ここを外し忘れて、ホーム画面に追加できなかった。
      Chrome は manifest を**ログイン情報を付けずに**取りに行く。
      認証の対象に入れたままだと、ログイン画面へ飛ばされ、
      Chrome は JSON の代わりに HTML を受け取る。
      manifest が読めないので「アプリ」と認識されず、
      「ショートカットを作成」しか出てこない。

      sw.js も同じ理由で外す。
      HTML が返ると、Service Worker の登録そのものが失敗する。

      どちらも見られて困る中身ではない（誰でも読めるファイルとして配る前提）。
    */
    '/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
