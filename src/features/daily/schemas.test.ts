import { describe, expect, it } from 'vitest';

import {
  conditionSchema,
  dailyReportSchema,
  hasEnoughToSubmit,
  practiceGoalSchema,
  reportCommentSchema,
} from './schemas';

describe('練習前コンディション（15章）', () => {
  const base = {
    recorded_on: '2026-08-12',
    condition_level: '4',
    fatigue_level: '2',
    sleep_hours: '7',
    has_pain: false,
  };

  it('普通の入力を受け入れる', () => {
    const result = conditionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition_level).toBe(4);
      expect(result.data.sleep_hours).toBe(7);
    }
  });

  it('段階評価は未選択でもよい（負担を増やしすぎない）', () => {
    const result = conditionSchema.safeParse({ ...base, condition_level: '', fatigue_level: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.condition_level).toBeNull();
      expect(result.data.fatigue_level).toBeNull();
    }
  });

  it('範囲外の段階評価を弾く', () => {
    expect(conditionSchema.safeParse({ ...base, condition_level: '6' }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...base, condition_level: '0' }).success).toBe(false);
  });

  it('睡眠時間は0.5刻みで入る', () => {
    const result = conditionSchema.safeParse({ ...base, sleep_hours: '6.5' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sleep_hours).toBe(6.5);
  });

  it('あり得ない睡眠時間を弾く', () => {
    expect(conditionSchema.safeParse({ ...base, sleep_hours: '30' }).success).toBe(false);
    expect(conditionSchema.safeParse({ ...base, sleep_hours: '-1' }).success).toBe(false);
  });

  it('空欄の文章は null になる', () => {
    const result = conditionSchema.safeParse({ ...base, note: '   ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBeNull();
  });

  it('日付の形式が違えば弾く', () => {
    expect(conditionSchema.safeParse({ ...base, recorded_on: '2026/8/12' }).success).toBe(false);
  });
});

describe('今日の個人目標（15章）', () => {
  const base = { target_date: '2026-08-12', goal: '1対1で前を向く' };

  it('目標があれば通る', () => {
    expect(practiceGoalSchema.safeParse(base).success).toBe(true);
  });

  it('目標が空なら弾く（これだけは必須）', () => {
    const result = practiceGoalSchema.safeParse({ ...base, goal: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain('今日の目標');
  });

  it('達成したかどうかは後から入れられる', () => {
    expect(practiceGoalSchema.safeParse({ ...base, achieved: null }).success).toBe(true);
    expect(practiceGoalSchema.safeParse({ ...base, achieved: true }).success).toBe(true);
  });
});

describe('日報（16章）', () => {
  const base = {
    report_date: '2026-08-12',
    visibility: 'staff' as const,
    status: 'draft' as const,
  };

  it('中身が空でも下書きとしては通る', () => {
    expect(dailyReportSchema.safeParse(base).success).toBe(true);
  });

  it('公開範囲の初期値は staff（コーチまで）', () => {
    const result = dailyReportSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.visibility).toBe('staff');
  });

  it('知らない公開範囲を弾く', () => {
    expect(dailyReportSchema.safeParse({ ...base, visibility: 'public' }).success).toBe(false);
  });

  it('段階評価を数値に直す', () => {
    const result = dailyReportSchema.safeParse({ ...base, self_rating: '3', mood: '' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.self_rating).toBe(3);
      expect(result.data.mood).toBeNull();
    }
  });
});

describe('提出できるかどうか', () => {
  const empty = {
    report_date: '2026-08-12',
    event_id: null,
    personal_goal: null,
    what_happened: null,
    what_went_well: null,
    what_went_wrong: null,
    cause: null,
    improvement: null,
    prevention: null,
    response_taken: null,
    next_action: null,
    self_rating: null,
    intensity: null,
    fatigue_level: null,
    mood: null,
    condition_level: null,
    free_note: null,
    visibility: 'staff' as const,
    status: 'submitted' as const,
  };

  it('何も書いていなければ提出させない', () => {
    expect(hasEnoughToSubmit(empty)).toBe(false);
  });

  it('ひとつでも書いてあれば提出できる', () => {
    expect(hasEnoughToSubmit({ ...empty, what_went_well: '前を向けた' })).toBe(true);
    expect(hasEnoughToSubmit({ ...empty, next_action: '明日はここを直す' })).toBe(true);
    expect(hasEnoughToSubmit({ ...empty, free_note: 'ひとこと' })).toBe(true);
  });

  it('目標だけでは提出させない（振り返りが無い）', () => {
    expect(hasEnoughToSubmit({ ...empty, personal_goal: '前を向く' })).toBe(false);
  });

  it('**画面から外した項目では提出できない**（0027）', () => {
    // 入力欄を8つに絞ったとき、ここが古いままだと
    // 「画面に無い項目のせいで提出できる／できない」が起きて、理由が分からなくなる。
    expect(hasEnoughToSubmit({ ...empty, what_happened: '過去のデータ' })).toBe(false);
    expect(hasEnoughToSubmit({ ...empty, cause: '過去のデータ' })).toBe(false);
  });
});

describe('画面に残す項目（0027）', () => {
  /*
    入力欄を8つに絞ったとき、いちばん怖いのは
    **フォームが送らない列を null で上書きして、過去に書いたものを消すこと**。

    保存する列の一覧は actions.ts にあるが、そこは Server Action なので
    そのままは呼べない。ここでは「画面に出す項目」の取り決めを固定して、
    増減したときに気づけるようにしておく。
  */
  const ON_SCREEN = [
    'what_went_well',
    'what_went_wrong',
    'next_action',
    'self_rating',
    'fatigue_level',
    'free_note',
  ] as const;

  const OFF_SCREEN = [
    'personal_goal',
    'what_happened',
    'cause',
    'improvement',
    'prevention',
    'response_taken',
    'intensity',
    'mood',
    'condition_level',
  ] as const;

  it('画面に出す項目は8つ（目標と質問を含めて）', () => {
    // 中目標（タグ）と質問は別の表に入るので、日報の列としては6つ。
    expect(ON_SCREEN).toHaveLength(6);
  });

  it('**外した項目は、列としては残っている**', () => {
    // 消したのは入力欄だけ。過去に書いたものは詳細画面に出る。
    const parsed = dailyReportSchema.parse({
      report_date: '2026-08-12',
      what_happened: '過去のデータ',
      visibility: 'staff',
      status: 'draft',
      self_rating: '',
      intensity: '',
      fatigue_level: '',
      mood: '',
      condition_level: '',
    });
    expect(parsed.what_happened).toBe('過去のデータ');
  });

  it('画面に出す項目と、外した項目が重なっていない', () => {
    const overlap = ON_SCREEN.filter((key) => (OFF_SCREEN as readonly string[]).includes(key));
    expect(overlap).toEqual([]);
  });
});

describe('日報へのコメント（16章・0027）', () => {
  const reportId = '11111111-1111-1111-1111-111111111111';
  const otherId = '22222222-2222-2222-2222-222222222222';

  it('返信先と宛先を付けられる', () => {
    const parsed = reportCommentSchema.parse({
      daily_report_id: reportId,
      body: '返します',
      parent_id: otherId,
      mention_member_ids: [otherId],
    });
    expect(parsed.parent_id).toBe(otherId);
    expect(parsed.mention_member_ids).toEqual([otherId]);
  });

  it('返信先も宛先も、無くてよい', () => {
    const parsed = reportCommentSchema.parse({ daily_report_id: reportId, body: 'ひとこと' });
    expect(parsed.parent_id).toBeNull();
    expect(parsed.mention_member_ids).toEqual([]);
  });

  it('空文字の返信先は「返信ではない」として扱う', () => {
    const parsed = reportCommentSchema.parse({
      daily_report_id: reportId,
      body: 'ひとこと',
      parent_id: '',
    });
    expect(parsed.parent_id).toBeNull();
  });

  it('ひとことでも通る', () => {
    const parsed = reportCommentSchema.safeParse({ daily_report_id: reportId, body: 'いいね' });
    expect(parsed.success).toBe(true);
  });

  it('前後の空白は落とす', () => {
    const parsed = reportCommentSchema.parse({ daily_report_id: reportId, body: '  よかった  ' });
    expect(parsed.body).toBe('よかった');
  });

  it('空では出せない（無言の既読に見えてしまう）', () => {
    expect(reportCommentSchema.safeParse({ daily_report_id: reportId, body: '' }).success).toBe(false);
    expect(reportCommentSchema.safeParse({ daily_report_id: reportId, body: '   ' }).success).toBe(false);
  });

  it('長すぎるものは断る', () => {
    const parsed = reportCommentSchema.safeParse({
      daily_report_id: reportId,
      body: 'あ'.repeat(2001),
    });
    expect(parsed.success).toBe(false);
  });

  it('対象の日報が UUID でなければ断る', () => {
    expect(reportCommentSchema.safeParse({ daily_report_id: 'abc', body: 'いいね' }).success).toBe(false);
    expect(reportCommentSchema.safeParse({ daily_report_id: '', body: 'いいね' }).success).toBe(false);
  });
});
