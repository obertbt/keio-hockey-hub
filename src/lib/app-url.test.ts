import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const headerValues = new Map<string, string>();
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (key: string) => headerValues.get(key.toLowerCase()) ?? null }),
}));

const { currentAppUrl } = await import('./app-url');

/**
 * 人に渡すリンクのアドレス。
 *
 * ここが設定頼みだったせいで、招待リンクが
 * http://localhost:3000/invite/... のまま配られ、誰も開けなかった。
 * 見ている本人のアドレスバーには正しい値が出ているのだから、それを使う。
 */

const saved = process.env.NEXT_PUBLIC_APP_URL;

beforeEach(() => {
  headerValues.clear();
  delete process.env.NEXT_PUBLIC_APP_URL;
});

afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = saved;
});

describe('いま開いているアドレスを使う', () => {
  it('設定が無くても、実際のホストから組み立てる', async () => {
    headerValues.set('host', 'keio-hockey-hub.vercel.app');
    headerValues.set('x-forwarded-proto', 'https');
    expect(await currentAppUrl()).toBe('https://keio-hockey-hub.vercel.app');
  });

  it('置き場所が付ける x-forwarded-host を優先する', async () => {
    headerValues.set('host', 'internal-1234.local');
    headerValues.set('x-forwarded-host', 'keio-hockey-hub.vercel.app');
    headerValues.set('x-forwarded-proto', 'https');
    expect(await currentAppUrl()).toBe('https://keio-hockey-hub.vercel.app');
  });

  it('**設定より実際のホストが強い**（設定漏れでも、設定間違いでも正しく出る）', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://古いアドレス.example.com';
    headerValues.set('host', 'keio-hockey-hub.vercel.app');
    headerValues.set('x-forwarded-proto', 'https');
    expect(await currentAppUrl()).toBe('https://keio-hockey-hub.vercel.app');
  });

  it('手元では http になる', async () => {
    headerValues.set('host', 'localhost:3000');
    expect(await currentAppUrl()).toBe('http://localhost:3000');
  });
});

describe('素性の疑わしいホストは使わない', () => {
  it('記号や空白が混ざっていたら設定に落とす', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://ok.example.com';
    headerValues.set('host', 'evil.example.com/path');
    expect(await currentAppUrl()).toBe('https://ok.example.com');
  });

  it('ホストが無ければ設定に落とす', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://ok.example.com';
    expect(await currentAppUrl()).toBe('https://ok.example.com');
  });

  it('設定も無ければ既定値（何も無い状態でも落ちない）', async () => {
    expect(await currentAppUrl()).toBe('http://localhost:3000');
  });
});
