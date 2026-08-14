import type { Metadata, Viewport } from 'next';

import { ServiceWorkerRegistrar } from '@/components/layout/service-worker';
import { env } from '@/lib/env';

import './globals.css';

export const metadata: Metadata = {
  title: env.NEXT_PUBLIC_APP_NAME,
  description: '慶應義塾大学 女子フィールドホッケー部のチーム管理システム',
  /*
    0028: ホーム画面に追加できるようにする。

    iPhone では、**追加していないと通知が届かない**。
    追加のしやすさが、そのまま通知の届きやすさになる。
  */
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: env.NEXT_PUBLIC_APP_NAME,
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    // iPhone は SVG を受け取らないので PNG を渡す
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 入力欄の拡大を止めつつ、利用者の拡大操作は妨げない
  maximumScale: 5,
  /*
    端末の上端（時刻や電池が出るところ）の色。

    ここは**画面の地の色に合わせる**もので、濃い色を置くと
    画面の上だけ帯が乗ったように見える。実際そう見えていた。
    暗い設定で開いている人には、暗いほうを渡す。
  */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f2f5fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0d1425' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">
        {children}
        {/* 0028: ホーム画面に追加できる条件を満たすため、開いた時点で登録する */}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
