/**
 * この端末で通知を受け取れるか（0028）。
 *
 * ここは通信も DOM も触らない。判定だけを置いてテストで固める。
 *
 * いちばん厄介なのが iPhone。
 * **ホーム画面に追加していないと、通知は届かない。**
 * Safari で開いているだけでは、そもそも登録の窓すら出せない。
 * これは Apple がそう作っているもので、こちらでは変えられない。
 *
 * だから「できません」で終わらせず、**何をすれば届くのか**を出す。
 * 断られた人がそこで止まると、その人にはもう二度と届かない。
 */

export type PushSupport =
  /** 押せば登録できる。 */
  | { state: 'ready' }
  /** iPhone/iPad で、ホーム画面に追加していない。追加すれば届く。 */
  | { state: 'needs_install' }
  /** 通知を断られている。端末の設定から戻してもらうしかない。 */
  | { state: 'denied' }
  /** この端末・このブラウザでは扱えない。 */
  | { state: 'unsupported' };

export interface PushEnvironment {
  /** Service Worker が使えるか。 */
  hasServiceWorker: boolean;
  /** PushManager が使えるか。 */
  hasPushManager: boolean;
  /** Notification が使えるか。 */
  hasNotification: boolean;
  /** いまの許可の状態。 */
  permission: 'default' | 'granted' | 'denied';
  /** iPhone / iPad か。 */
  isIos: boolean;
  /** ホーム画面から開いているか。 */
  isStandalone: boolean;
}

export function detectPushSupport(environment: PushEnvironment): PushSupport {
  /*
    iPhone は先に見る。

    ホーム画面に追加していない iOS では PushManager 自体が無いので、
    順番を逆にすると「この端末では使えません」と出てしまう。
    実際には**追加すれば使える**ので、それは嘘になる。
    嘘の案内をされた人は、そこで諦める。
  */
  if (environment.isIos && !environment.isStandalone) return { state: 'needs_install' };

  if (!environment.hasServiceWorker || !environment.hasPushManager || !environment.hasNotification) {
    return { state: 'unsupported' };
  }

  // 断られている。ここからはこちらでは何もできない。
  if (environment.permission === 'denied') return { state: 'denied' };

  return { state: 'ready' };
}

/** 画面に出す言葉。断られた人を責めない言い方にする。 */
export function describePushSupport(support: PushSupport): string {
  switch (support.state) {
    case 'ready':
      return 'この端末で通知を受け取れます。';
    case 'needs_install':
      return 'iPhone・iPad では、ホーム画面に追加すると通知を受け取れます。';
    case 'denied':
      return '通知が「許可しない」になっています。端末の設定から許可すると受け取れます。';
    case 'unsupported':
      return 'この端末では通知を受け取れません。アプリを開いたときに、お知らせで確認できます。';
  }
}

/**
 * VAPID の公開鍵を、ブラウザが受け取る形に直す。
 *
 * 鍵は base64url の文字列で来るが、`subscribe()` は生のバイト列を求める。
 * ここを間違えると、登録は通るのに**通知だけが届かない**。
 * 気づきにくいので、テストで固めておく。
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);

  // ArrayBuffer を明示して作る。
  // 型を省くと SharedArrayBuffer の可能性が残り、subscribe() に渡せない。
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

/**
 * 端末の名前。一覧で「どれを消すか」を選べるように。
 *
 * 細かく当てにいかない。当たらなかったときに嘘になるより、
 * 大ざっぱでも外さないほうがよい。
 */
export function describeDevice(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return 'iPhone';
  if (/iPad/.test(userAgent)) return 'iPad';
  if (/Android/.test(userAgent)) return 'Android';
  if (/Macintosh/.test(userAgent)) return 'Mac';
  if (/Windows/.test(userAgent)) return 'Windows';
  return 'この端末';
}
