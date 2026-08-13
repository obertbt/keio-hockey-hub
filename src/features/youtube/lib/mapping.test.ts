import { describe, expect, it } from 'vitest';

import {
  describePlan,
  parseIso8601Duration,
  pickThumbnail,
  planImport,
  shouldImport,
  toVideoDraft,
  type ExistingVideo,
  type YoutubeVideo,
} from './mapping';

/**
 * YouTube から取り込むときの決めごと。
 *
 * いちばん大事なのは **勝手に上書きしない** こと。
 * 人が直した題を、次の取り込みで戻してしまうと、
 * 「触ると壊れる」と思われて誰も直さなくなる。
 */

function video(overrides: Partial<YoutubeVideo> = {}): YoutubeVideo {
  return {
    videoId: 'abc123',
    title: '練習 8/12',
    description: null,
    duration: 'PT1H2M3S',
    publishedAt: '2026-08-12T09:00:00Z',
    thumbnailUrl: 'https://i.ytimg.com/vi/abc123/hqdefault.jpg',
    privacy: 'unlisted',
    ...overrides,
  };
}

describe('長さの読み取り', () => {
  it('時分秒を秒にする', () => {
    expect(parseIso8601Duration('PT1H2M3S')).toBe(3723);
    expect(parseIso8601Duration('PT45S')).toBe(45);
    expect(parseIso8601Duration('PT12M')).toBe(720);
  });

  it('日をまたぐ形も読む', () => {
    expect(parseIso8601Duration('P1DT2H')).toBe(93600);
  });

  it('小数の秒は丸める', () => {
    expect(parseIso8601Duration('PT1M30.5S')).toBe(91);
  });

  it('読めないものは null（勝手に0にしない）', () => {
    expect(parseIso8601Duration(null)).toBeNull();
    expect(parseIso8601Duration('')).toBeNull();
    expect(parseIso8601Duration('1:02:03')).toBeNull();
    expect(parseIso8601Duration('P')).toBeNull();
  });
});

describe('サムネイル', () => {
  it('いちばん大きいものを選ぶ', () => {
    expect(
      pickThumbnail({
        default: { url: 'small.jpg', width: 120 },
        high: { url: 'big.jpg', width: 480 },
        medium: { url: 'mid.jpg', width: 320 },
      }),
    ).toBe('big.jpg');
  });

  it('無ければ null', () => {
    expect(pickThumbnail(undefined)).toBeNull();
    expect(pickThumbnail({})).toBeNull();
  });
});

describe('取り込む対象', () => {
  it('限定公開は取り込む（部の映像はこれが普通）', () => {
    expect(shouldImport(video({ privacy: 'unlisted' }))).toBe(true);
  });

  it('公開も取り込む', () => {
    expect(shouldImport(video({ privacy: 'public' }))).toBe(true);
  });

  it('**非公開は取り込まない**（まだ出さないと決めたもの）', () => {
    expect(shouldImport(video({ privacy: 'private' }))).toBe(false);
  });
});

describe('動画データへの変換', () => {
  it('必要なものが揃う', () => {
    const draft = toVideoDraft(video());
    expect(draft.provider).toBe('youtube');
    expect(draft.provider_video_id).toBe('abc123');
    expect(draft.title).toBe('練習 8/12');
    expect(draft.duration_seconds).toBe(3723);
    expect(draft.recorded_at).toBe('2026-08-12T09:00:00Z');
  });

  it('**取り込んだものは部内全員に見せる**', () => {
    // その動画は YouTube 側で既に部員が見られる。
    // こちらだけ狭くしても隠したことにはならず、「見たいのに見えない」を作るだけ。
    expect(toVideoDraft(video()).visibility).toBe('team');
  });

  it('題が空でも作れる形にする', () => {
    expect(toVideoDraft(video({ title: '   ' })).title).toBe('（無題の動画）');
  });

  it('前後の空白は落とす', () => {
    expect(toVideoDraft(video({ title: '  練習  ' })).title).toBe('練習');
    expect(toVideoDraft(video({ description: '   ' })).description).toBeNull();
  });
});

describe('取り込みの段取り', () => {
  const existing: ExistingVideo[] = [
    {
      id: 'row-1',
      provider_video_id: 'already',
      title: 'コーチが直した題',
      duration_seconds: 1800,
      thumbnail_url: 'https://example.com/a.jpg',
    },
  ];

  it('知らない動画は入れる', () => {
    const plan = planImport([video({ videoId: 'new-one' })], existing);
    expect(plan.create).toHaveLength(1);
    expect(plan.create[0]?.provider_video_id).toBe('new-one');
  });

  it('**人が直した題を、YouTube 側の題で戻さない**', () => {
    const plan = planImport([video({ videoId: 'already', title: '自動で付いた題' })], existing);
    expect(plan.create).toHaveLength(0);
    expect(plan.update).toHaveLength(0);
    expect(plan.skipped).toBe(1);
  });

  it('空いているところだけ補う', () => {
    const thin: ExistingVideo[] = [
      { id: 'row-2', provider_video_id: 'thin', title: '題', duration_seconds: null, thumbnail_url: null },
    ];
    const plan = planImport([video({ videoId: 'thin' })], thin);
    expect(plan.update).toHaveLength(1);
    expect(plan.update[0]?.patch.duration_seconds).toBe(3723);
    expect(plan.update[0]?.patch.thumbnail_url).toContain('hqdefault');
    // 題は触らない
    expect(plan.update[0]?.patch.title).toBeUndefined();
  });

  it('非公開は数えるだけで触らない', () => {
    const plan = planImport([video({ videoId: 'secret', privacy: 'private' })], []);
    expect(plan.create).toHaveLength(0);
    expect(plan.ignored).toBe(1);
  });

  it('同じ動画が2回来ても1本として扱う', () => {
    const plan = planImport([video({ videoId: 'dup' }), video({ videoId: 'dup' })], []);
    expect(plan.create).toHaveLength(1);
  });

  it('何度流しても結果が変わらない', () => {
    const first = planImport([video({ videoId: 'x' })], []);
    expect(first.create).toHaveLength(1);

    // 1回目で入ったものとして、もう一度流す
    const after: ExistingVideo[] = [
      {
        id: 'row-x',
        provider_video_id: 'x',
        title: first.create[0]?.title ?? '',
        duration_seconds: first.create[0]?.duration_seconds ?? null,
        thumbnail_url: first.create[0]?.thumbnail_url ?? null,
      },
    ];
    const second = planImport([video({ videoId: 'x' })], after);
    expect(second.create).toHaveLength(0);
    expect(second.update).toHaveLength(0);
    expect(second.skipped).toBe(1);
  });
});

describe('結果の伝え方', () => {
  it('何が起きたかを数で伝える', () => {
    const plan = planImport(
      [video({ videoId: 'a' }), video({ videoId: 'b' }), video({ videoId: 'c', privacy: 'private' })],
      [],
    );
    expect(describePlan(plan)).toContain('2本を取り込みました');
    expect(describePlan(plan)).toContain('1本は非公開のため対象外');
  });

  it('何も無いときも黙らない', () => {
    expect(describePlan(planImport([], []))).toBe('取り込む動画はありませんでした。');
  });
});
