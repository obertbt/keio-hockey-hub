import { describe, expect, it } from 'vitest';

import {
  checkVapidPublicKey,
  describeDevice,
  describePushSupport,
  detectPushSupport,
  urlBase64ToUint8Array,
  type PushEnvironment,
} from './push-support';

/**
 * スマートフォンに通知が届くか（0028）。
 *
 * いちばん大事なのは
 * **iPhone に「この端末では使えません」と言わないこと**。
 * ホーム画面に追加すれば使えるので、それは嘘になる。
 * 嘘の案内をされた人は、そこで諦める。
 */

function environment(overrides: Partial<PushEnvironment> = {}): PushEnvironment {
  return {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    permission: 'default',
    isIos: false,
    isStandalone: false,
    ...overrides,
  };
}

describe('この端末で受け取れるか', () => {
  it('普通のブラウザは、そのまま登録できる', () => {
    expect(detectPushSupport(environment())).toEqual({ state: 'ready' });
  });

  it('**iPhone でホーム画面に追加していなければ、追加を案内する**', () => {
    expect(detectPushSupport(environment({ isIos: true, isStandalone: false }))).toEqual({
      state: 'needs_install',
    });
  });

  it('**iPhone で PushManager が無くても「使えません」と言わない**', () => {
    // ホーム画面に追加していない iOS では PushManager 自体が無い。
    // 順番を間違えると、追加すれば使えるのに「使えません」と出てしまう。
    const result = detectPushSupport(
      environment({ isIos: true, isStandalone: false, hasPushManager: false, hasServiceWorker: false }),
    );
    expect(result).toEqual({ state: 'needs_install' });
  });

  it('ホーム画面から開いた iPhone は登録できる', () => {
    expect(detectPushSupport(environment({ isIos: true, isStandalone: true }))).toEqual({
      state: 'ready',
    });
  });

  it('断られていたら、設定から戻してもらう', () => {
    expect(detectPushSupport(environment({ permission: 'denied' }))).toEqual({ state: 'denied' });
  });

  it('すでに許可されていれば、そのまま登録できる', () => {
    expect(detectPushSupport(environment({ permission: 'granted' }))).toEqual({ state: 'ready' });
  });

  it('仕組みが無いブラウザは、正直にそう言う', () => {
    expect(detectPushSupport(environment({ hasServiceWorker: false }))).toEqual({ state: 'unsupported' });
    expect(detectPushSupport(environment({ hasPushManager: false }))).toEqual({ state: 'unsupported' });
    expect(detectPushSupport(environment({ hasNotification: false }))).toEqual({ state: 'unsupported' });
  });

  it('断られているほうを、仕組みの有無より後に見る', () => {
    // 仕組みが無いのに「許可してください」と言っても、どうにもならない
    expect(detectPushSupport(environment({ hasPushManager: false, permission: 'denied' }))).toEqual({
      state: 'unsupported',
    });
  });
});

describe('言い方', () => {
  it('どの状態でも黙らない', () => {
    for (const state of ['ready', 'needs_install', 'denied', 'unsupported'] as const) {
      expect(describePushSupport({ state }).length).toBeGreaterThan(0);
    }
  });

  it('使えないときも、次にできることを言う', () => {
    expect(describePushSupport({ state: 'needs_install' })).toContain('ホーム画面に追加');
    expect(describePushSupport({ state: 'denied' })).toContain('設定');
    // 通知が無理でも、アプリを開けば分かることは伝える
    expect(describePushSupport({ state: 'unsupported' })).toContain('お知らせ');
  });
});

describe('鍵の変換', () => {
  it('base64url を、そのままのバイト列にする', () => {
    // 'Aa' → 0x01 0xa0（padding 無しの base64url）
    expect(Array.from(urlBase64ToUint8Array('AaA'))).toEqual([0x01, 0xa0]);
  });

  it('- と _ を元に戻す', () => {
    // '-_8' は '+/8' と同じ
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([0xfb, 0xff]);
  });

  it('長さが4の倍数でなくても読める（padding を足す）', () => {
    expect(() => urlBase64ToUint8Array('QQ')).not.toThrow();
    expect(Array.from(urlBase64ToUint8Array('QQ'))).toEqual([0x41]);
  });

  it('実際の長さの鍵を通しても落ちない（65バイト）', () => {
    const key = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
    expect(urlBase64ToUint8Array(key)).toHaveLength(65);
  });
});

describe('公開鍵の形（0028 で実際に詰まったところ）', () => {
  // 本物と同じ形（65バイト・先頭 0x04）
  const VALID = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U';
  // 秘密鍵と同じ形（32バイト）
  const PRIVATE_LOOKING = 'YRNUInIt4Zr3D95ZJDyznAR8Yh5xJetaSra2VNwrB8c';

  it('正しい公開鍵は通る', () => {
    expect(checkVapidPublicKey(VALID)).toEqual({ ok: true });
  });

  it('前後に空白が付いていても通る', () => {
    expect(checkVapidPublicKey(`  ${VALID}\n`)).toEqual({ ok: true });
  });

  it('**秘密鍵を入れ違えたことを言い当てる**', () => {
    // ブラウザは「applicationServerKey is not valid」としか言わない。
    // それでは何を直せばいいのか分からない。
    const result = checkVapidPublicKey(PRIVATE_LOOKING);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('秘密鍵');
  });

  it('未設定は、そう言う', () => {
    const result = checkVapidPublicKey('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('設定されていません');
  });

  it('途中で切れた鍵は、長さで気づかせる', () => {
    const result = checkVapidPublicKey(VALID.slice(0, 40));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('バイト');
  });

  it('使えない文字が混ざっていたら、貼り付けを疑わせる', () => {
    const result = checkVapidPublicKey('これは鍵ではありません');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('文字');
  });

  it('どの断り方でも、次にやることが書いてある', () => {
    for (const bad of ['', PRIVATE_LOOKING, VALID.slice(0, 40), '日本語']) {
      const result = checkVapidPublicKey(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('端末の名前', () => {
  it('よくある端末を見分ける', () => {
    expect(describeDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
    expect(describeDevice('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('iPad');
    expect(describeDevice('Mozilla/5.0 (Linux; Android 14)')).toBe('Android');
    expect(describeDevice('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe('Mac');
    expect(describeDevice('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
  });

  it('分からなくても黙らない', () => {
    expect(describeDevice('よく分からないもの')).toBe('この端末');
  });
});
