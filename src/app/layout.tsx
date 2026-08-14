import type { Metadata, Viewport } from 'next';

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
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 入力欄の拡大を止めつつ、利用者の拡大操作は妨げない
  maximumScale: 5,
  themeColor: '#00317a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
