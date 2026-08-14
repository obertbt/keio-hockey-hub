'use client';

import { useActionState, useEffect, useState, useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';
import { FormMessage } from '@/components/ui/field';
import { subscribeToPush, unsubscribeFromPush, type PushActionState } from '@/features/notifications/actions';
import {
  describeDevice,
  describePushSupport,
  detectPushSupport,
  urlBase64ToUint8Array,
  type PushSupport,
} from '@/features/notifications/lib/push-support';

/**
 * スマートフォンで通知を受け取る（0028）。
 *
 * ここだけはブラウザの機能を直に触る必要がある
 * （Service Worker の登録と、通知の許可）。
 *
 * 大事にしたこと:
 *   * **押す前に、何が起きるかを書く。** いきなり許可の窓が出ると断られる。
 *     一度断られると、こちらからは二度と出せない
 *   * iPhone には「使えません」と言わない。**追加すれば使える**ので、
 *     その手順をその場に出す
 */
/*
  この端末の状態は、描画のたびに変わるものではない。
  一度だけ調べて覚えておく。

  useEffect の中で setState すると、いったん描いてから描き直すことになり、
  「確認しています…」が一瞬ちらつく。
  ブラウザの機能を読むのは useSyncExternalStore の仕事。
*/
let cachedSupport: PushSupport | null = null;

function readSupport(): PushSupport {
  if (cachedSupport) return cachedSupport;

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
  // iPadOS 13 以降は Macintosh を名乗るので、指で触れるかどうかで見分ける
  const isIpadOs = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS だけは昔からの navigator.standalone を見る必要がある
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  cachedSupport = detectPushSupport({
    hasServiceWorker: 'serviceWorker' in navigator,
    hasPushManager: 'PushManager' in window,
    hasNotification: 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : 'default',
    isIos: isIos || isIpadOs,
    isStandalone,
  });
  return cachedSupport;
}

/** サーバ側では端末が分からない。描かないでおく。 */
const SERVER_SUPPORT: PushSupport | null = null;

function subscribeNoop(): () => void {
  // 端末の状態は途中で変わらない。監視するものが無い。
  return () => {};
}

export function PushSetup({ vapidPublicKey }: { vapidPublicKey: string }) {
  const detected = useSyncExternalStore(subscribeNoop, readSupport, () => SERVER_SUPPORT);

  // 「許可しない」を押されたときだけ、こちらで上書きする
  const [overridden, setOverridden] = useState<PushSupport | null>(null);
  const support = overridden ?? detected;

  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [subscribeState, subscribeAction] = useActionState<PushActionState, FormData>(subscribeToPush, {});
  const [unsubscribeState, unsubscribeAction] = useActionState<PushActionState, FormData>(
    unsubscribeFromPush,
    {},
  );

  const [pending, setPending] = useState<{ endpoint: string; p256dh: string; auth: string } | null>(null);

  // すでにこの端末で登録済みか。ここは待たないと分からないので effect で聞く。
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((existing) => setSubscribed(existing !== null))
      .catch(() => setSubscribed(false));
  }, []);

  async function enable() {
    setBusy(true);
    setMessage(null);

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        // 断られたことを責めない。あとから設定で戻せることだけ伝える。
        setOverridden({ state: 'denied' });
        setMessage('通知は届きません。端末の設定から、あとで許可することもできます。');
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        // 送り主が誰かを、必ず名乗る決まりにする。
        // false にすると、名乗らない通知が送れてしまう。
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = subscription.toJSON();
      if (!json.keys?.p256dh || !json.keys.auth) {
        setMessage('この端末では登録できませんでした。');
        return;
      }

      setPending({ endpoint: subscription.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      setSubscribed(true);
    } catch (unexpected) {
      setMessage(`登録できませんでした（${String(unexpected)}）`);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        setPending({ endpoint: subscription.endpoint, p256dh: '', auth: '' });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setMessage('解除できませんでした。');
    } finally {
      setBusy(false);
    }
  }

  if (support === null) return <p className="text-sm text-[--color-muted]">確認しています…</p>;

  if (vapidPublicKey === '') {
    return (
      <p className="text-sm text-[--color-muted]">
        スマートフォンへの通知は、まだ設定されていません（管理者が鍵を登録すると使えます）。
      </p>
    );
  }

  // iPhone・iPad：追加すれば使えるので、手順をその場に出す
  if (support.state === 'needs_install') {
    return (
      <div className="space-y-2">
        <p className="text-sm">{describePushSupport(support)}</p>
        <ol className="list-decimal space-y-1 rounded-lg bg-[--color-surface] px-5 py-3 text-sm">
          <li>この画面の下（または上）の共有ボタンを押す</li>
          <li>「ホーム画面に追加」を選ぶ</li>
          <li>ホーム画面にできたアイコンから開き直す</li>
          <li>この画面をもう一度開いて、通知を受け取るを押す</li>
        </ol>
        <p className="text-xs text-[--color-muted]">
          Safari で開いたままでは通知が届きません。iPhone がそう決まっているためで、こちらでは変えられません。
        </p>
      </div>
    );
  }

  if (support.state === 'unsupported' || support.state === 'denied') {
    return (
      <div className="space-y-2">
        <p className="text-sm">{describePushSupport(support)}</p>
        {message ? <p className="text-xs text-[--color-muted]">{message}</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {subscribeState.error ? <FormMessage tone="error">{subscribeState.error}</FormMessage> : null}
      {subscribeState.success ? <FormMessage tone="success">{subscribeState.success}</FormMessage> : null}
      {unsubscribeState.success ? <FormMessage tone="success">{unsubscribeState.success}</FormMessage> : null}
      {message ? <FormMessage tone="error">{message}</FormMessage> : null}

      {subscribed ? (
        <form action={unsubscribeAction} className="space-y-2">
          <input type="hidden" name="endpoint" value={pending?.endpoint ?? ''} />
          <p className="text-sm">この端末で通知を受け取ります。</p>
          <Button type="submit" variant="outline" block disabled={busy} onClick={disable}>
            この端末では受け取らない
          </Button>
        </form>
      ) : (
        <>
          <p className="text-sm">
            コーチからの返事や、名前を呼ばれた書き込みが、ロック画面に出るようになります。
          </p>
          <p className="text-xs text-[--color-muted]">
            届くのは、あなた宛のものだけです。部内の書き込みが全部鳴ることはありません。
          </p>
          <Button variant="action" block disabled={busy} onClick={enable}>
            {busy ? '登録しています…' : 'この端末で通知を受け取る'}
          </Button>
        </>
      )}

      {/*
        許可を取ったあと、サーバへ送る。
        許可の窓はボタンを押した流れの中でしか出せないので、
        送信はそのあとに分けている。
      */}
      {pending && pending.p256dh !== '' ? (
        <form action={subscribeAction} ref={(form) => form?.requestSubmit()}>
          <input type="hidden" name="endpoint" value={pending.endpoint} />
          <input type="hidden" name="p256dh" value={pending.p256dh} />
          <input type="hidden" name="auth" value={pending.auth} />
          <input type="hidden" name="label" value={describeDevice(navigator.userAgent)} />
        </form>
      ) : null}
    </div>
  );
}
