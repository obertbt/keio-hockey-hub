import { describe, expect, it, beforeEach, vi } from 'vitest';

// server-only はブラウザ側から読むと落ちる仕掛け。テストでは読み飛ばす。
vi.mock('server-only', () => ({}));

import { recentErrors, recordError } from './last-errors';

/**
 * 直近のエラーの覚え書き。
 * ここが動かないと、原因を知る手段が置き場所のログだけになる。
 */

beforeEach(() => {
  (globalThis as { __khhErrors?: unknown[] }).__khhErrors = [];
});

describe('記録', () => {
  it('例外の中身を取り出せる', () => {
    recordError({ path: '/today', digest: '231097770', error: new TypeError('壊れた') });
    const [first] = recentErrors();
    expect(first?.path).toBe('/today');
    expect(first?.digest).toBe('231097770');
    expect(first?.name).toBe('TypeError');
    expect(first?.message).toBe('壊れた');
  });

  it('例外でないものも受け取る', () => {
    recordError({ path: '/x', digest: null, error: '文字列が投げられた' });
    expect(recentErrors()[0]?.message).toBe('文字列が投げられた');
  });

  it('新しいものが先に来る', () => {
    recordError({ path: '/a', digest: null, error: new Error('古い') });
    recordError({ path: '/b', digest: null, error: new Error('新しい') });
    expect(recentErrors()[0]?.message).toBe('新しい');
  });

  it('溜め込みすぎない（5件まで）', () => {
    for (let i = 0; i < 12; i += 1) {
      recordError({ path: `/${i}`, digest: null, error: new Error(`${i}`) });
    }
    expect(recentErrors()).toHaveLength(5);
    expect(recentErrors()[0]?.message).toBe('11');
  });

  it('落ちた場所も残す', () => {
    recordError({ path: '/today', digest: null, error: new Error('どこかで') });
    expect(recentErrors()[0]?.where.length).toBeGreaterThan(0);
  });
});
