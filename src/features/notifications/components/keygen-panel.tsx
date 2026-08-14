'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { generateVapidKeys, type KeygenState } from '@/features/notifications/keygen';

/**
 * 鍵を作って、そのまま貼れる形で出す（0028）。
 *
 * タブレットしか無い人でも設定を終えられるようにする。
 * 「作る」と「どこに入れるか」を同じ画面に置く。
 * 別の手順書を見に行かせると、そこで止まる。
 */
export function KeygenPanel() {
  const [state, setState] = useState<KeygenState | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const block =
    state?.publicKey && state.privateKey
      ? `NEXT_PUBLIC_VAPID_PUBLIC_KEY=${state.publicKey}\nVAPID_PRIVATE_KEY=${state.privateKey}`
      : '';

  return (
    <div className="space-y-3">
      {state?.error ? <FormMessage tone="error">{state.error}</FormMessage> : null}

      {block === '' ? (
        <>
          <p className="text-sm">押すと、この場で鍵を作ります。外のサイトは使いません。</p>
          <Button
            variant="action"
            block
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await generateVapidKeys());
              setBusy(false);
            }}
          >
            {busy ? '作っています…' : '鍵を作る'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">
            Vercel の Settings → Environment Variables に、この2つを入れてください。
          </p>

          {/*
            そのまま貼れる形にしておく。
            Vercel の環境変数の画面は、KEY=VALUE をまとめて貼れる。
            1つずつ写させると、必ずどこかで間違える。
          */}
          <textarea
            readOnly
            rows={6}
            value={block}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-lg border border-[--color-border] bg-[--color-surface] p-3 font-mono text-xs break-all"
          />

          <Button
            variant="outline"
            block
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(block);
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            {copied ? 'コピーしました' : 'まとめてコピー'}
          </Button>

          <div className="space-y-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs dark:bg-amber-950/40">
            <p className="font-medium">入れたあとに、必ず Redeploy してください。</p>
            <p>環境変数は、作り直さないと反映されません。</p>
            <p>
              <span className="font-medium">VAPID_PRIVATE_KEY に NEXT_PUBLIC_ を付けないこと。</span>
              付けると誰でも部員に通知を送れるようになります。
            </p>
            <p>
              <span className="font-medium">この鍵は作り直さないこと。</span>
              変えると、登録済みの端末には届かなくなります。
            </p>
          </div>

          <p className="text-xs text-[--color-muted]">
            この鍵はどこにも保存していません。この画面を閉じると二度と出せないので、 先に Vercel
            へ貼ってください。
          </p>
        </>
      )}
    </div>
  );
}
