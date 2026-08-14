'use client';

import { useEffect } from 'react';
import { Link } from '@/components/ui/link';

import { Button } from '@/components/ui/button';

/**
 * 想定外の例外を受け止める。
 *
 * 原因の詳細は出さない（DB の構造や設定が漏れるため）。
 * かわりに **digest** を出す。
 *
 * Next.js は本番では例外の中身を隠し、代わりに digest という短い符号を付ける。
 * 同じ符号がサーバー側のログにも残るので、これがあれば突き合わせられる。
 *
 * 以前は「管理者へ連絡してください」とだけ書いていたが、
 * 連絡を受けた側に照合するものが無く、実際にそれで詰まった。
 * 出口の無い案内を書かない。
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // サーバー側のログに残す（本番では監視サービスへ送る）
    console.error('画面でエラーが発生しました', error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 text-center">
      <h1 className="text-lg font-bold">画面を表示できませんでした</h1>
      <p className="mt-2 text-sm text-[--color-muted]">
        時間をおいてもう一度お試しください。続く場合は管理者へ連絡してください。
      </p>

      {error.digest ? (
        <div className="mt-4 text-xs text-[--color-muted]">
          <p>連絡するときは、この符号を伝えてください。</p>
          <p className="mt-1 rounded-lg bg-[--color-surface] px-2 py-2 font-mono break-all">{error.digest}</p>
        </div>
      ) : null}

      <div className="mt-6 space-y-2">
        <Button onClick={reset} block>
          もう一度読み込む
        </Button>
        {/* 行き止まりにしない。設定が原因のことが多いので、確認先も出す。 */}
        <Link
          href="/setup-check"
          className="flex min-h-11 items-center justify-center rounded-lg border border-[--color-border] px-4 text-sm font-medium"
        >
          接続設定を確認する
        </Link>
      </div>
    </main>
  );
}
