'use client';

import {
  Award,
  Bell,
  CalendarDays,
  ClipboardList,
  Database,
  HardDrive,
  Home,
  ListChecks,
  MessageCircle,
  Ruler,
  ScrollText,
  Settings,
  Trash2,
  UserPlus,
  Users,
  Video,
} from 'lucide-react';

/**
 * ナビゲーションのアイコン。
 *
 * **部品そのものをサーバーからクライアントへ渡してはいけない。**
 * 渡せるのはデータだけ（文字列・数値・配列・素のオブジェクトなど）。
 * 関数や部品は境界を越えられず、こうなる:
 *
 *   Functions cannot be passed directly to Client Components
 *
 * 以前は nav-links.ts に `icon: Home` と部品を直接置き、
 * サーバー側の layout がそれをクライアントのナビへ渡していた。
 * ログイン画面にはナビが無いため、テストで一度も通らない道だった。
 *
 * いまは**名前（文字列）だけ**を渡し、部品への対応付けはここで行う。
 * ここはクライアント側なので、部品を持っていて構わない。
 */

const ICONS = {
  award: Award,
  bell: Bell,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  database: Database,
  storage: HardDrive,
  home: Home,
  checks: ListChecks,
  message: MessageCircle,
  ruler: Ruler,
  scroll: ScrollText,
  settings: Settings,
  trash: Trash2,
  invite: UserPlus,
  users: Users,
  video: Video,
} as const;

/** 使える名前。ここに無い名前は型で弾く。 */
export type NavIconName = keyof typeof ICONS;

export function NavIcon({
  name,
  size = 20,
  className,
}: {
  name: NavIconName;
  size?: number;
  className?: string;
}) {
  const Icon = ICONS[name];
  return <Icon size={size} className={className} aria-hidden />;
}
