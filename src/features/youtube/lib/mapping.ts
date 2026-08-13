/**
 * YouTube の応答を、こちらの動画データに直す。
 *
 * ここは通信もDBも触らない。テストで固める。
 *
 * 部の映像は**限定公開**で置く前提（29章の考え方と同じ）。
 * 限定公開の動画は、外から一覧を引けない。
 * チャンネルの持ち主として認証したときだけ見える。
 * そのため、取り込みは「持ち主の許可」の上に成り立っている。
 */

/** 取り込みの対象にする公開設定。 */
export type YoutubePrivacy = 'public' | 'unlisted' | 'private';

/** YouTube から受け取る、1本ぶんの必要な情報。 */
export interface YoutubeVideo {
  videoId: string;
  title: string;
  description: string | null;
  /** ISO8601（PT1H2M3S）。 */
  duration: string | null;
  /** 公開日時。撮影日の代わりに使う。 */
  publishedAt: string | null;
  thumbnailUrl: string | null;
  privacy: YoutubePrivacy;
}

/** こちらの videos に入れる形。 */
export interface VideoDraft {
  provider: 'youtube';
  provider_video_id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  recorded_at: string | null;
  thumbnail_url: string | null;
  /**
   * 取り込んだものは部内全員に見せる。
   *
   * 最初はコーチとスタッフまでにしていたが、
   * **その動画は YouTube 側で既に部員全員が見られる**。
   * こちらだけ狭くしても、隠したことにはならず、
   * 「見たいのに見えない」を作るだけだった。
   *
   * 自分で撮って上げた切り抜き（22章）は別の話。
   * あちらは本人が決める。
   */
  visibility: 'team';
}

/**
 * ISO8601 の長さを秒に直す。
 *
 * YouTube は "PT1H2M3S" の形で返す。日をまたぐ動画は想定しないが、
 * "P1DT2H" のような形も来うるので日も見る。
 */
export function parseIso8601Duration(value: string | null | undefined): number | null {
  if (!value) return null;

  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(value.trim());
  if (!match) return null;

  const [, days, hours, minutes, seconds] = match;
  if (!days && !hours && !minutes && !seconds) return null;

  const total =
    Number(days ?? 0) * 86400 + Number(hours ?? 0) * 3600 + Number(minutes ?? 0) * 60 + Number(seconds ?? 0);

  return Number.isFinite(total) ? Math.round(total) : null;
}

/** いちばん大きいサムネイルを選ぶ。無ければ null。 */
export function pickThumbnail(
  thumbnails: Record<string, { url?: string; width?: number } | undefined> | undefined,
): string | null {
  if (!thumbnails) return null;

  const candidates = Object.values(thumbnails).filter(
    (item): item is { url: string; width?: number } => typeof item?.url === 'string',
  );
  if (candidates.length === 0) return null;

  return candidates.reduce((best, item) => ((item.width ?? 0) > (best.width ?? 0) ? item : best)).url;
}

/** YouTube の1本を、こちらの形に直す。 */
export function toVideoDraft(video: YoutubeVideo): VideoDraft {
  return {
    provider: 'youtube',
    provider_video_id: video.videoId,
    // 題が空の動画は作れないので、念のため置き換える
    title: video.title.trim() === '' ? '（無題の動画）' : video.title.trim(),
    description: emptyToNull(video.description),
    duration_seconds: parseIso8601Duration(video.duration),
    recorded_at: video.publishedAt,
    thumbnail_url: video.thumbnailUrl,
    // YouTube 側で既に部員が見られるものを、こちらだけ狭くしない。
    visibility: 'team',
  };
}

/**
 * 取り込みの対象にするか。
 *
 * 非公開（private）は、持ち主が「まだ出さない」と決めたもの。
 * 見えるからといって引っ張ってこない。
 */
export function shouldImport(video: YoutubeVideo): boolean {
  return video.privacy === 'public' || video.privacy === 'unlisted';
}

/** すでに入っているもの。突き合わせに要る分だけ。 */
export interface ExistingVideo {
  id: string;
  provider_video_id: string | null;
  title: string;
  duration_seconds: number | null;
  thumbnail_url: string | null;
}

export interface ImportPlan {
  /** 新しく入れるもの。 */
  create: VideoDraft[];
  /** すでにあるが、題や長さが空だったので補うもの。 */
  update: { id: string; patch: Partial<VideoDraft> }[];
  /** 触らないもの（すでに揃っている）。 */
  skipped: number;
  /** 対象外（非公開）。 */
  ignored: number;
}

/**
 * 何をするかを先に決める。
 *
 * **勝手に上書きしない**（37章の取り込みと同じ約束）。
 * 人が直した題を、YouTube 側の題で戻さない。
 * 埋めるのは、こちらが空のときだけ。
 */
export function planImport(fetched: YoutubeVideo[], existing: ExistingVideo[]): ImportPlan {
  const byVideoId = new Map(
    existing
      .filter((item) => item.provider_video_id !== null)
      .map((item) => [item.provider_video_id as string, item]),
  );

  const plan: ImportPlan = { create: [], update: [], skipped: 0, ignored: 0 };
  const seen = new Set<string>();

  for (const video of fetched) {
    if (!shouldImport(video)) {
      plan.ignored += 1;
      continue;
    }
    // 同じ動画が2回来ても1回しか扱わない
    if (seen.has(video.videoId)) continue;
    seen.add(video.videoId);

    const draft = toVideoDraft(video);
    const current = byVideoId.get(video.videoId);

    if (!current) {
      plan.create.push(draft);
      continue;
    }

    const patch: Partial<VideoDraft> = {};
    // 空いているところだけ埋める
    if (current.duration_seconds === null && draft.duration_seconds !== null) {
      patch.duration_seconds = draft.duration_seconds;
    }
    if ((current.thumbnail_url === null || current.thumbnail_url === '') && draft.thumbnail_url !== null) {
      patch.thumbnail_url = draft.thumbnail_url;
    }

    if (Object.keys(patch).length > 0) {
      plan.update.push({ id: current.id, patch });
    } else {
      plan.skipped += 1;
    }
  }

  return plan;
}

/** 取り込みの結果を、人に伝える言葉にする。 */
export function describePlan(plan: ImportPlan): string {
  const parts: string[] = [];
  if (plan.create.length > 0) parts.push(`${plan.create.length}本を取り込みました`);
  if (plan.update.length > 0) parts.push(`${plan.update.length}本の情報を補いました`);
  if (plan.skipped > 0) parts.push(`${plan.skipped}本は変更なし`);
  if (plan.ignored > 0) parts.push(`${plan.ignored}本は非公開のため対象外`);

  return parts.length === 0 ? '取り込む動画はありませんでした。' : `${parts.join('、')}。`;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
