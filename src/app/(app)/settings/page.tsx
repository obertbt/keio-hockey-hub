import type { Metadata } from 'next';
import { Link } from '@/components/ui/link';

import { Badge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { NavIcon } from '@/components/layout/nav-icon';
import { MAIN_NAV } from '@/components/layout/nav-links';
import { ROLE_LABELS, PERMISSION_LABELS, PERMISSIONS } from '@/lib/auth/permissions';
import { can, requireSession } from '@/lib/auth/session';
import { PushSetup } from '@/features/notifications/components/push-setup';
import { RemoveDeviceButton } from '@/features/notifications/components/remove-device';
import { listMyPushDevices } from '@/features/notifications/queries';
import { env, limits } from '@/lib/env';
import { formatDateLabel } from '@/lib/datetime';

export const metadata: Metadata = { title: '設定' };

export default async function SettingsPage() {
  const session = await requireSession();

  // 自分の端末だけが返る（RLS がそう決めている）
  const devices = await listMyPushDevices();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">設定</h1>

      {/* 下部ナビゲーションに入りきらないものは、ここから辿れるようにする */}
      <Card className="md:hidden">
        <CardHeader title="ほかの画面" />
        <ul className="space-y-2">
          {MAIN_NAV.filter((link) => !link.bottom && (!link.permission || can(session, link.permission))).map(
            (link) => {
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-[--color-border] px-3 text-sm"
                  >
                    <NavIcon name={link.icon} size={18} />
                    {link.label}
                  </Link>
                </li>
              );
            },
          )}
        </ul>
      </Card>

      {/* 0028: スマートフォンに通知を届ける */}
      <Card>
        <CardHeader
          title="スマートフォンへの通知"
          description="コーチからの返事や、名前を呼ばれた書き込みが、ロック画面に出ます。"
        />
        <PushSetup vapidPublicKey={env.NEXT_PUBLIC_VAPID_PUBLIC_KEY} />
        {devices.length > 0 ? (
          <div className="mt-3 border-t border-[--color-border] pt-3">
            <p className="mb-2 text-xs text-[--color-muted]">通知を受け取る端末</p>
            <ul className="space-y-1.5">
              {devices.map((device) => (
                <li key={device.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {device.label ?? 'この端末'}
                    <span className="ml-2 text-xs text-[--color-muted]">
                      {formatDateLabel(device.created_at.slice(0, 10))}に登録
                    </span>
                  </span>
                  <RemoveDeviceButton subscriptionId={device.id} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="あなたの情報" />
        <dl className="space-y-2 text-sm">
          <Row label="氏名" value={session.fullName} />
          <Row label="表示名" value={session.displayName} />
          <Row label="メールアドレス" value={session.email ?? '未登録'} />
          <Row label="チーム" value={session.teamName} />
          <Row label="役割" value={ROLE_LABELS[session.role]} />
        </dl>
      </Card>

      <Card>
        <CardHeader title="できること" description="役割ごとの既定に、個別の設定を足し引きした結果です。" />
        <ul className="space-y-1.5 text-sm">
          {PERMISSIONS.map((permission) => (
            <li key={permission} className="flex items-center justify-between gap-2">
              <span>{PERMISSION_LABELS[permission]}</span>
              {can(session, permission) ? (
                <Badge tone="success">あり</Badge>
              ) : (
                <Badge tone="neutral">なし</Badge>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="このシステムについて" />
        <dl className="space-y-2 text-sm">
          <Row label="名称" value={env.NEXT_PUBLIC_APP_NAME} />
          <Row
            label="動画の上限"
            value={`${limits.maxVideoDurationSeconds}秒 / ${Math.round(limits.maxVideoSizeBytes / 1024 / 1024)}MB`}
          />
          <Row label="1日の動画投稿" value={`${limits.maxDailyVideoUploadsPerUser}件まで`} />
          <Row label="表示タイムゾーン" value="Asia/Tokyo" />
        </dl>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[--color-muted]">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
