import 'server-only';

import { GOOGLE_TOKEN_ENDPOINT } from './lib/oauth';
import { pickThumbnail, type YoutubePrivacy, type YoutubeVideo } from './lib/mapping';

/**
 * YouTube への問い合わせ。
 *
 * 鍵はここから外に出さない。返すのは動画の情報だけ。
 * 失敗したときも、鍵の値は絶対にメッセージに載せない（75章）。
 */

const API = 'https://www.googleapis.com/youtube/v3';

/** 1回の取り込みで見にいく本数の上限。多すぎると時間も枠も食う。 */
const MAX_VIDEOS = 100;

export function googleCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** 更新トークンから、その場限りの鍵を作る。 */
export async function fetchAccessToken(refreshToken: string): Promise<string> {
  const credentials = googleCredentials();
  if (!credentials) throw new Error('Google の設定（GOOGLE_CLIENT_ID / SECRET）が入っていません。');

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
    cache: 'no-store',
  });

  const body: unknown = await response.json();
  const token = readString(body, 'access_token');

  if (!response.ok || !token) {
    // 向こうの言い分だけを載せる。こちらの鍵は載せない。
    const reason = readString(body, 'error_description') ?? readString(body, 'error') ?? '理由不明';
    throw new Error(`Google への接続が切れています（${reason}）。つなぎ直してください。`);
  }

  return token;
}

/** つないだチャンネルの素性。 */
export interface ChannelInfo {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
}

export async function fetchMyChannel(accessToken: string): Promise<ChannelInfo> {
  const body = await call(accessToken, `${API}/channels?part=snippet,contentDetails&mine=true`);
  const items = readArray(body, 'items');
  const first = items[0];

  if (!first) {
    throw new Error(
      'このアカウントにチャンネルが見つかりません。部のチャンネルを持つアカウントでお試しください。',
    );
  }

  const uploads = readString(readObject(readObject(first, 'contentDetails'), 'relatedPlaylists'), 'uploads');
  const channelId = readString(first, 'id');

  if (!channelId || !uploads) {
    throw new Error('チャンネルの情報を読み取れませんでした。');
  }

  return {
    channelId,
    title: readString(readObject(first, 'snippet'), 'title') ?? 'チャンネル',
    uploadsPlaylistId: uploads,
  };
}

/**
 * チャンネルに上がっている動画を集める。
 *
 * 一覧（playlistItems）には公開設定が入らないので、
 * 動画の詳細（videos）をまとめて引き直す。
 * 限定公開かどうかは、こちらでしか分からない。
 */
export async function fetchChannelVideos(
  accessToken: string,
  uploadsPlaylistId: string,
): Promise<YoutubeVideo[]> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;

  while (videoIds.length < MAX_VIDEOS) {
    const url = new URL(`${API}/playlistItems`);
    url.searchParams.set('part', 'contentDetails');
    url.searchParams.set('playlistId', uploadsPlaylistId);
    url.searchParams.set('maxResults', '50');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const body = await call(accessToken, url.toString());

    for (const item of readArray(body, 'items')) {
      const id = readString(readObject(item, 'contentDetails'), 'videoId');
      if (id) videoIds.push(id);
    }

    pageToken = readString(body, 'nextPageToken') ?? undefined;
    if (!pageToken) break;
  }

  const videos: YoutubeVideo[] = [];

  // videos は50件ずつまとめて引ける
  for (let index = 0; index < videoIds.length; index += 50) {
    const chunk = videoIds.slice(index, index + 50);
    const body = await call(
      accessToken,
      `${API}/videos?part=snippet,contentDetails,status&id=${chunk.join(',')}`,
    );

    for (const item of readArray(body, 'items')) {
      const snippet = readObject(item, 'snippet');
      const id = readString(item, 'id');
      if (!id) continue;

      videos.push({
        videoId: id,
        title: readString(snippet, 'title') ?? '',
        description: readString(snippet, 'description'),
        duration: readString(readObject(item, 'contentDetails'), 'duration'),
        publishedAt: readString(snippet, 'publishedAt'),
        thumbnailUrl: pickThumbnail(readThumbnails(snippet)),
        privacy: readPrivacy(readString(readObject(item, 'status'), 'privacyStatus')),
      });
    }
  }

  return videos;
}

async function call(accessToken: string, url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });

  const body: unknown = await response.json();
  if (!response.ok) {
    const reason =
      readString(readObject(readObject(body, 'error'), 'error'), 'message') ??
      readString(readObject(body, 'error'), 'message') ??
      `HTTP ${response.status}`;
    throw new Error(`YouTube から取得できませんでした（${reason}）`);
  }
  return body;
}

// -------------------------------------------------------------
// 受け取った JSON を、型を付けずに安全に読む
// （any を使わない。形が違えば undefined に倒す）
// -------------------------------------------------------------

function readObject(value: unknown, key: string): unknown {
  if (value === null || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key];
}

function readString(value: unknown, key: string): string | null {
  const found = readObject(value, key);
  return typeof found === 'string' && found !== '' ? found : null;
}

function readArray(value: unknown, key: string): unknown[] {
  const found = readObject(value, key);
  return Array.isArray(found) ? found : [];
}

function readThumbnails(snippet: unknown): Record<string, { url?: string; width?: number }> | undefined {
  const found = readObject(snippet, 'thumbnails');
  if (found === null || typeof found !== 'object') return undefined;
  return found as Record<string, { url?: string; width?: number }>;
}

function readPrivacy(value: string | null): YoutubePrivacy {
  if (value === 'public' || value === 'unlisted' || value === 'private') return value;
  // 分からないものは、いちばん狭く見る。取り込まない側に倒す。
  return 'private';
}
