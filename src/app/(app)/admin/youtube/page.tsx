import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';

import { Card, CardHeader } from '@/components/ui/card';
import { DisconnectButton, SyncButton } from '@/features/youtube/components/connection-actions';
import { googleCredentials } from '@/features/youtube/client';
import { getConnectionStatus } from '@/features/youtube/store';
import { requireStaff } from '@/lib/auth/session';
import { formatDateTimeInTokyo } from '@/lib/datetime';

export const metadata: Metadata = { title: 'チャンネル連携' };
export const dynamic = 'force-dynamic';

/**
 * 部の YouTube チャンネルとつなぐ（24章の自動化）。
 *
 * 部の映像は限定公開なので、外から一覧を引けない。
 * チャンネルの持ち主が一度だけ許可を出すことで、取り込めるようになる。
 */
export default async function YoutubePage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; reason?: string }>;
}) {
  const session = await requireStaff();
  const { connected, error, reason } = await searchParams;

  const status = await getConnectionStatus(session);
  const hasCredentials = googleCredentials() !== null;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href="/settings" className="text-keio-700 dark:text-keio-300 underline">
          ← 設定へ戻る
        </Link>
      </p>

      <header>
        <h1 className="text-xl font-bold">チャンネル連携</h1>
        <p className="mt-1 text-sm text-[--color-muted]">
          部の YouTube チャンネルに上げた動画を、自動で取り込みます。
        </p>
      </header>

      {connected ? (
        <Card className="border-emerald-500">
          <p className="text-sm">つながりました。下の「いま取り込む」で最初の取り込みができます。</p>
        </Card>
      ) : null}

      {error ? (
        <Card className="border-red-400">
          <p className="text-sm">{errorMessage(error)}</p>
          {reason ? <p className="mt-1 text-xs break-all text-[--color-muted]">{reason}</p> : null}
        </Card>
      ) : null}

      {!hasCredentials ? (
        <Card className="border-amber-400">
          <CardHeader title="先に Google の設定が要ります" />
          <p className="text-sm">
            置き場所の環境変数に <code className="font-mono text-xs">GOOGLE_CLIENT_ID</code> と{' '}
            <code className="font-mono text-xs">GOOGLE_CLIENT_SECRET</code> を入れてください。
          </p>
          <p className="mt-2 text-xs text-[--color-muted]">
            手順は docs/youtube.md にあります。作業は最初の一度だけです。
          </p>
        </Card>
      ) : status.connected ? (
        <>
          <Card>
            <CardHeader title="つながっているチャンネル" />
            <p className="text-base font-semibold">{status.channelTitle ?? '（名前不明）'}</p>
            <dl className="mt-3 space-y-1 text-sm">
              <Row label="つないだ日">
                {status.connectedAt ? formatDateTimeInTokyo(status.connectedAt) : '—'}
              </Row>
              <Row label="最後の取り込み">
                {status.lastSyncedAt ? formatDateTimeInTokyo(status.lastSyncedAt) : 'まだ'}
              </Row>
              <Row label="そのときの結果">{status.lastResult ?? '—'}</Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="取り込む" description="新しく上がった動画を探して、こちらに登録します。" />
            <SyncButton />
            <p className="mt-3 text-xs text-[--color-muted]">
              取り込んだ動画は、まずコーチとスタッフまでの公開になります。
              部員に見せるものは、動画ごとに切り替えてください。
              題を直しても、次の取り込みで戻ることはありません。
            </p>
          </Card>

          <Card>
            <CardHeader title="解除" description="取り込んだ動画はそのまま残ります。" />
            <DisconnectButton />
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader
            title="チャンネルをつなぐ"
            description="チャンネルの持ち主の Google アカウントで許可してください。"
          />
          <Link
            href="/api/youtube/connect"
            className="bg-action-500 hover:bg-action-600 flex min-h-12 items-center justify-center rounded-lg px-4 text-sm font-semibold text-white"
          >
            Google で許可する
          </Link>
          <p className="mt-3 text-xs text-[--color-muted]">
            求めるのは「動画の一覧を読む」権限だけです。動画を変えたり消したりはできません。
            限定公開の動画も取り込めるようになります。
          </p>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'denied':
      return '許可されませんでした。もう一度お試しください。';
    case 'state':
      return '手続きの途中で情報が合わなくなりました。最初からやり直してください。';
    case 'missing_credentials':
      return 'Google の設定（GOOGLE_CLIENT_ID / SECRET）が入っていません。';
    case 'missing_code':
      return 'Google からの返事が足りませんでした。もう一度お試しください。';
    case 'token':
      return '鍵を受け取れませんでした。';
    case 'save':
      return '接続を保存できませんでした。';
    default:
      return 'うまくいきませんでした。もう一度お試しください。';
  }
}
