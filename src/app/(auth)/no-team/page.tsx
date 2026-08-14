import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { logout } from '@/features/auth/actions';

export const metadata: Metadata = { title: '部員として登録されていません' };

/**
 * ログインはできたが、まだどの部にも所属していない人の行き止まり（0029）。
 *
 * なぜ専用の画面が要るのか:
 *   この人をログイン画面へ送ると、proxy が「ログイン済み」と見て
 *   /today へ戻す。/today は素性が取れないのでまた /login へ送る。
 *   **送り返し合いになって、画面が開かなくなる。**
 *
 *   だから行き先は「ログインしていても追い返されない場所」でなければならない。
 *   ここは公開の道に入れてある（`PUBLIC_PATHS`）。
 *
 * 出しているのは、その人が次にできること2つだけ。
 *   * 誰に言えばよいか
 *   * 別のアカウントで入り直す
 */
export default function NoTeamPage() {
  return (
    <>
      <h2 className="mb-4 text-lg font-semibold">まだ部員として登録されていません</h2>

      <p className="text-sm">
        ログインはできています。ただ、このアカウントがどの部にも結び付いていないため、 中の画面を出せません。
      </p>

      <p className="mt-3 text-sm text-[--color-muted]">
        部の管理者に、招待リンクを送ってもらうか、名簿への追加を頼んでください。
        卒業や退部で在籍を外れた場合も、この画面になります。
      </p>

      <form action={logout} className="mt-6">
        <Button type="submit" variant="outline" block>
          別のアカウントでログインする
        </Button>
      </form>
    </>
  );
}
