import type { NavIconName } from '@/components/layout/nav-icon';
import type { Permission } from '@/lib/auth/permissions';

export interface NavLink {
  href: string;
  label: string;
  /**
   * アイコンの**名前**。部品そのものではない。
   *
   * この配列はサーバー側で絞り込んでからクライアントのナビへ渡す。
   * 境界を越えられるのはデータだけなので、部品を置くと落ちる。
   * 対応付けは nav-icon.tsx（クライアント側）で行う。
   */
  icon: NavIconName;
  /** この権限を持つ人にだけ見せる。 */
  permission?: Permission;
  /**
   * スタッフ（管理者・コーチ・マネージャー）にだけ見せる。
   *
   * 監査ログのように「特定の権限」ではなく立場で決まるものに使う。
   * RLS 側も同じ条件（app.is_staff）で守っている。
   */
  staffOnly?: boolean;
  /**
   * スマートフォンの下部ナビゲーションに出すか。
   *
   * 画面幅 360px で1つあたり 60px しか取れないため、6つが上限。
   * 毎日通る道（循環）だけを残し、それ以外は設定から辿れるようにする。
   */
  bottom?: boolean;
}

/**
 * 下部ナビゲーション（モバイル）と横のナビゲーション（PC）で同じ定義を使う。
 * 選手が最初に開くのは常に「今日」。
 */
export const MAIN_NAV: NavLink[] = [
  { href: '/today', label: '今日', icon: 'home', bottom: true },
  { href: '/schedule', label: '予定', icon: 'calendar', bottom: true },
  { href: '/videos', label: '動画', icon: 'video', permission: 'video.view_team', bottom: true },
  { href: '/feedback', label: '質問', icon: 'message', bottom: true },
  { href: '/skills', label: 'スキル', icon: 'award', bottom: true },
  { href: '/measurements', label: '測定', icon: 'ruler' },
  { href: '/notifications', label: 'お知らせ', icon: 'bell' },
  { href: '/members', label: '名簿', icon: 'users' },
  { href: '/admin/invitations', label: '招待', icon: 'invite', staffOnly: true },
  { href: '/admin/skills', label: 'スキル定義', icon: 'checks', permission: 'skill.review' },
  { href: '/trash', label: '消したもの', icon: 'trash' },
  { href: '/admin/export', label: '書き出し', icon: 'database' },
  { href: '/admin/import', label: 'データ移行', icon: 'clipboard', permission: 'import.execute' },
  { href: '/admin/storage', label: '保存容量', icon: 'storage', permission: 'storage.manage' },
  { href: '/admin/audit', label: '操作の記録', icon: 'scroll', staffOnly: true },
  { href: '/settings', label: '設定', icon: 'settings', bottom: true },
];
