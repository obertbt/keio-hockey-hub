import type { Metadata } from 'next';

import { diagnose, type CheckState } from '@/features/ops/diagnose';
import { isSupabaseConfigured } from '@/lib/env';
import { isStorageConfigured } from '@/lib/storage/r2';

export const metadata: Metadata = { title: '接続設定の確認' };

// 毎回その場で確かめる。結果を貯めると、直したのに直っていないように見える。
export const dynamic = 'force-dynamic';

/**
 * 設定の自己診断。
 * 「動かない」時に、まずここを見れば原因が分かるようにする。
 *
 * 値そのものは絶対に表示しない（設定済みかどうかだけ）。
 *
 * 設定が入っているかだけでは足りなかった。
 * 「設定は済んでいるのに中の画面だけ落ちる」が実際に起き、
 * 原因を知るには置き場所のログを掘るしかなかった。
 * サーバー側から実際に読んでみるところまで、この画面でやる。
 */
export default async function SetupCheckPage() {
  const checks = [
    {
      label: 'Supabase（NEXT_PUBLIC_SUPABASE_URL / ANON_KEY）',
      ok: isSupabaseConfigured(),
      hint: 'ログインとデータ保存に必要です。',
    },
    {
      label: 'Supabase サービスロールキー（SUPABASE_SERVICE_ROLE_KEY）',
      ok: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      hint: 'データ移行と招待で使います。ブラウザには渡していません。',
    },
    {
      label: 'Cloudflare R2（R2_*）',
      ok: isStorageConfigured(),
      hint: 'Phase 7 の動画投稿で使います。今の段階では未設定でも動きます。',
    },
  ];

  // 設定が無ければ、その先を試しても同じことしか分からない。
  //
  // 診断そのものが落ちてこの画面まで見られなくなる、が一番困る。
  // ここだけは何があっても表示を返す。
  let diagnosis: Awaited<ReturnType<typeof diagnose>> = [];
  if (isSupabaseConfigured()) {
    try {
      diagnosis = await diagnose();
    } catch (unexpected) {
      diagnosis = [
        {
          label: '自己診断そのものが失敗しました',
          state: 'ng',
          detail: String(unexpected).slice(0, 200),
        },
      ];
    }
  }

  return (
    <main className="mx-auto w-full max-w-md px-5 py-10">
      <h1 className="mb-1 text-lg font-bold">接続設定の確認</h1>
      <p className="mb-6 text-sm text-gray-500">設定されているかどうかだけを表示します。値は表示しません。</p>

      <ul className="space-y-3">
        {checks.map((check) => (
          <li key={check.label} className="rounded-xl border border-gray-200 p-4">
            <p className="flex items-center justify-between gap-2 text-sm font-medium">
              {check.label}
              <span className={check.ok ? 'text-emerald-600' : 'text-amber-600'}>
                {check.ok ? '設定済み' : '未設定'}
              </span>
            </p>
            <p className="mt-1 text-xs text-gray-500">{check.hint}</p>
          </li>
        ))}
      </ul>

      {diagnosis.length > 0 ? (
        <>
          <h2 className="mt-8 mb-1 text-base font-bold">サーバーから実際に読んでみる</h2>
          <p className="mb-4 text-xs text-gray-500">
            上から順に確かめます。最初に「だめ」になったところが原因です。
          </p>

          <ul className="space-y-3">
            {diagnosis.map((item) => (
              <li key={item.label} className="rounded-xl border border-gray-200 p-4">
                <p className="flex items-start justify-between gap-2 text-sm font-medium">
                  <span className="min-w-0">{item.label}</span>
                  <StateMark state={item.state} />
                </p>
                <p className="mt-1 text-xs break-all text-gray-500">{item.detail}</p>
                {item.next ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                    {item.next}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <p className="mt-6 text-xs text-gray-500">
        設定方法は README と docs/deployment.md を参照してください。
      </p>
    </main>
  );
}

function StateMark({ state }: { state: CheckState }) {
  const map: Record<CheckState, { text: string; className: string }> = {
    ok: { text: '大丈夫', className: 'text-emerald-600' },
    ng: { text: 'だめ', className: 'text-red-600' },
    skip: { text: '未確認', className: 'text-gray-500' },
  };
  const { text, className } = map[state];
  return <span className={`shrink-0 text-xs font-semibold ${className}`}>{text}</span>;
}
