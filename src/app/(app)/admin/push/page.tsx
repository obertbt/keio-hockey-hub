import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';
import { redirect } from 'next/navigation';

import { Card, CardHeader } from '@/components/ui/card';
import { KeygenPanel } from '@/features/notifications/components/keygen-panel';
import { checkVapidPublicKey } from '@/features/notifications/lib/push-support';
import { isStaff, requireSession } from '@/lib/auth/session';
import { env } from '@/lib/env';

export const metadata: Metadata = { title: '通知の設定' };

/**
 * スマートフォンへの通知の下ごしらえ（0028）。
 *
 * 鍵をその場で作れるようにする。
 * タブレットしか無い人でも、ここだけで設定を終えられる。
 */
export default async function PushAdminPage() {
  const session = await requireSession();
  if (!isStaff(session)) redirect('/today?denied=通知の設定');

  const current = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const check = checkVapidPublicKey(current);

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/settings" className="text-keio-700 dark:text-keio-300 underline">
          ← 設定へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">スマートフォンへの通知の設定</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          一度だけの作業です。終わると、部員が各自の端末で通知を受け取れるようになります。
        </p>
      </header>

      <Card className={check.ok ? 'border-emerald-500' : 'border-amber-400'}>
        <CardHeader title="いまの状態" />
        {check.ok ? (
          <p className="text-sm">公開鍵は正しく入っています。あとは部員が各自の端末で登録するだけです。</p>
        ) : (
          <>
            <p className="text-sm">まだ使えません。</p>
            <p className="mt-1 text-sm text-amber-900 dark:text-amber-200">{check.reason}</p>
          </>
        )}
      </Card>

      <Card>
        <CardHeader
          title="鍵を作る"
          description="外のサイトは使いません。この場で作って、そのまま貼れる形で出します。"
        />
        <KeygenPanel />
      </Card>

      <Card>
        <CardHeader title="部員への案内" />
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium">Android の人</p>
            <p className="text-[--color-muted]">設定 → 「この端末で通知を受け取る」 → 許可。以上です。</p>
          </div>
          <div>
            <p className="font-medium">iPhone・iPad の人</p>
            <p className="text-[--color-muted]">
              先に「ホーム画面に追加」が要ります。共有ボタン → ホーム画面に追加 → できたアイコンから開き直す →
              設定 → 通知を受け取る。
            </p>
            <p className="mt-1 text-xs text-[--color-muted]">
              Safari のタブのままだとボタンが出ず、代わりに手順が画面に出ます。
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
