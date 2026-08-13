import { describe, expect, it } from 'vitest';

import { MAIN_NAV } from './nav-links';

/**
 * ナビゲーションの定義が、サーバーからクライアントへ渡せる形かどうか。
 *
 * ここが破れると、**ログイン後のすべての画面が落ちる**。
 * 実際に起きた。原因はアイコンの部品を直接置いていたこと。
 *
 *   Functions cannot be passed directly to Client Components
 *
 * ログイン画面にはナビが無いため、E2E でも一度も通らない道だった。
 * 型では防げない（部品も型としては通る）ので、値の形で確かめる。
 */

describe('クライアントへ渡せる形か', () => {
  it('関数や部品が混ざっていない', () => {
    for (const link of MAIN_NAV) {
      for (const [key, value] of Object.entries(link)) {
        expect(typeof value, `${link.href} の ${key}`).not.toBe('function');
        // forwardRef の部品は $$typeof を持つオブジェクト。これも渡せない。
        if (value !== null && typeof value === 'object') {
          expect(Object.hasOwn(value, '$$typeof'), `${link.href} の ${key}`).toBe(false);
        }
      }
    }
  });

  it('そのまま JSON にできる（境界を越えられる形）', () => {
    expect(() => JSON.parse(JSON.stringify(MAIN_NAV))).not.toThrow();
    // 変換して戻しても中身が変わらない = 落ちるものが無い
    expect(JSON.parse(JSON.stringify(MAIN_NAV))).toEqual(MAIN_NAV);
  });

  it('アイコンは名前（文字列）で持つ', () => {
    for (const link of MAIN_NAV) {
      expect(typeof link.icon, link.href).toBe('string');
    }
  });
});

describe('中身の約束', () => {
  it('行き先が重複していない', () => {
    const paths = MAIN_NAV.map((link) => link.href);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('下部ナビは6つまで（画面幅 360px で1つ 60px）', () => {
    expect(MAIN_NAV.filter((link) => link.bottom).length).toBeLessThanOrEqual(6);
  });

  it('どの行き先も / から始まる', () => {
    for (const link of MAIN_NAV) {
      expect(link.href.startsWith('/'), link.href).toBe(true);
    }
  });
});
