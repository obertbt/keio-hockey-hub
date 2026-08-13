import 'server-only';

import { headers } from 'next/headers';

import { env } from '@/lib/env';

/**
 * いま開かれているアプリのアドレス。
 *
 * **設定を忘れただけで壊れる作りにしない。**
 * 招待リンクを `NEXT_PUBLIC_APP_URL` から組み立てていたため、
 * 未設定のときに `http://localhost:3000/invite/...` を配ってしまい、
 * 受け取った学生が誰も開けなかった。実際に起きた。
 *
 * 見ている本人のアドレスバーには正しい値が出ている。
 * それを使う。設定は「上書きしたいとき」だけのものにする。
 *
 * 優先順:
 *   1. 実際のリクエストのホスト（いちばん確か）
 *   2. NEXT_PUBLIC_APP_URL（自前のドメインを使うときなど）
 *
 * ヘッダは利用者が名乗るものなので、素性は疑う。
 * ここで作るのは「人に渡すリンク」だけで、認可には使わない。
 */
export async function currentAppUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();

  try {
    const headerList = await headers();
    const host = headerList.get('x-forwarded-host') ?? headerList.get('host');

    if (host && isPlausibleHost(host)) {
      const protocol =
        headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
      return `${protocol}://${host}`;
    }
  } catch {
    // リクエストの外から呼ばれた場合。設定に落とす。
  }

  return configured && configured !== '' ? configured : env.NEXT_PUBLIC_APP_URL;
}

/**
 * ホスト名として通す形か。
 *
 * 変な値をそのままリンクに載せない。
 * 記号や空白が混ざったものは、貼り付けの事故か、細工されたもの。
 */
function isPlausibleHost(host: string): boolean {
  return /^[A-Za-z0-9.-]+(:\d+)?$/.test(host);
}
