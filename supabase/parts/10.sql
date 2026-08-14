-- ==========================================================
-- 自動生成: scripts/bundle-migrations.sh
-- 直接編集しない。直すのは supabase/migrations/ のほう。
-- 10 番目。中身: 0027_report_thread.sql 0028_push_subscriptions.sql 0029_current_session.sql 
-- ==========================================================


-- ---------- 0027_report_thread.sql ----------
-- =============================================================
-- 0027_report_thread.sql
-- 日報を短くし、コーチとのやり取りを閉じる（16章の作り直し）。
--
-- 直したいこと2つ。
--
-- (1) 日報の項目が多すぎた
--     10個の記述欄と5つの段階評価があった。必須はひとつも無いが、
--     **並んでいるだけで「全部書くもの」に見える**。
--     毎日のものなので、見えている量がそのまま負担になる（3章の7）。
--
--     残すのは8つだけ。
--       中目標（タグ）/ できたこと / 反省点 / 次回に向けた取り組み
--       自己評価 / 疲労度 / 自由記述 / 質問
--
--     **列は消さない。** 過去に書いたものが消えるほうが困る。
--     入力欄から外すだけ。詳細画面は、中身のある項目だけを出す。
--
-- (2) コーチの返事が読まれたか分からなかった
--     コメントは届くが、選手が読んだかどうかが誰にも分からない。
--     「見てもらえた」が伝わらないと、次から書かなくなる。
--     コーチの側も、返した言葉が届いたのか分からないまま次を書く。
--
--     3つで閉じる。
--       * 選手が**受け取りましたを押す**まで、「今日」から消えない
--       * 押すのは「開いた」ではなく「押した」。開いただけを既読にすると、
--         読んでいないのに読んだことになり、いちばん大事な信頼が静かに壊れる
--       * ひとこと返せる。**返信は任意**（毎回返させると負担になる）
--
-- あわせて、日報からコーチを名指しで呼べるようにする。
-- 「質問（あれば指定コーチをメンション）」がこれ。
-- 呼ばれた人にだけ通知が飛ぶ。動画の掲示板（0024）とまったく同じ形にする。
-- **同じことを2つの形で覚えさせない。**
-- =============================================================

-- -------------------------------------------------------------
-- 返信と、受け取りの印
-- -------------------------------------------------------------
alter table public.report_feedbacks
  add column if not exists parent_id uuid references public.report_feedbacks(id) on delete cascade;

-- 日報を書いた本人が「読みました」を押した時刻。
-- コーチが押すことはない（押せてしまうと意味が無くなる）。
alter table public.report_feedbacks
  add column if not exists acknowledged_at timestamptz;

-- 空のコメントを残さない（0024 と同じ）
alter table public.report_feedbacks
  drop constraint if exists report_feedbacks_body_check;
alter table public.report_feedbacks
  add constraint report_feedbacks_body_check check (length(btrim(body)) > 0);

create index if not exists report_feedbacks_parent_idx
  on public.report_feedbacks (parent_id, created_at);
create index if not exists report_feedbacks_unread_idx
  on public.report_feedbacks (daily_report_id, acknowledged_at)
  where acknowledged_at is null;

-- -------------------------------------------------------------
-- 宛先（メンション）
--
-- 本文に @名前 と書かせない。改名や同姓同名で壊れるうえ、
-- 誰に届いたのかが後から分からない（0024 と同じ理由）。
-- -------------------------------------------------------------
create table if not exists public.report_feedback_mentions (
  id                  uuid primary key default gen_random_uuid(),
  team_id             uuid not null references public.teams(id) on delete cascade,
  report_feedback_id  uuid not null references public.report_feedbacks(id) on delete cascade,
  team_member_id      uuid not null references public.team_members(id) on delete cascade,
  created_at          timestamptz not null default now(),

  unique (report_feedback_id, team_member_id)
);

create index if not exists report_feedback_mentions_member_idx
  on public.report_feedback_mentions (team_member_id, created_at desc);

-- -------------------------------------------------------------
-- その日報を書いたのが自分か
--
-- 「受け取りました」を押せるのは本人だけ、を何か所かで使う。
-- ポリシーの中から daily_reports を引くと、あちらの select ポリシーに
-- 引っかかって堂々巡りになるため security definer で切る（0022 と同じ）。
-- -------------------------------------------------------------
create or replace function app.is_own_report(p_report_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.daily_reports r
    join public.team_members m on m.id = r.team_member_id
    where r.id = p_report_id
      and r.deleted_at is null
      and m.profile_id = app.current_profile_id()
  );
$$;

revoke all on function app.is_own_report(uuid) from public;
grant execute on function app.is_own_report(uuid) to authenticated;

-- -------------------------------------------------------------
-- 筋を通す
-- -------------------------------------------------------------
create or replace function app.validate_report_feedback()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team   uuid;
  v_parent public.report_feedbacks;
begin
  select team_id into v_team from public.daily_reports where id = new.daily_report_id;
  if v_team is null then
    raise exception '対象の日報が見つかりません';
  end if;
  if v_team <> new.team_id then
    raise exception '別のチームの日報にはコメントできません';
  end if;

  if new.parent_id is not null then
    select * into v_parent from public.report_feedbacks where id = new.parent_id;
    if v_parent.id is null then
      raise exception '返信先のコメントが見つかりません';
    end if;
    if v_parent.daily_report_id <> new.daily_report_id then
      raise exception '別の日報のコメントには返信できません';
    end if;
    -- 枝分かれは追いにくい。部活の会話には要らない（0024 と同じ）。
    if v_parent.parent_id is not null then
      raise exception '返信への返信はできません。同じコメントに返してください';
    end if;
  end if;

  -- -----------------------------------------------------------
  -- **受け取りの印を、本人以外に動かさせない。**
  --
  -- テストで見つかった穴:
  --   report_feedbacks_write はスタッフにも update を許している
  --   （自分のコメントを直せるように）。そのままだと、
  --   コーチが acknowledged_at を自分で埋められてしまった。
  --
  --   コーチが「読まれたことにする」を作れると、この仕組みの意味が全部消える。
  --   選手は読んでいないのに、コーチには届いたように見える。
  --   ここは関数（acknowledge_report_feedback）だけの通り道にする。
  --
  -- 関数は security definer だが、app.current_profile_id() は
  -- 呼んだ人のまま。だから中を通れば、この判定を素通りできる。
  -- -----------------------------------------------------------
  if tg_op = 'INSERT' then
    if new.acknowledged_at is not null then
      raise exception '受け取りの印は、あとから本人が押します';
    end if;
  elsif new.acknowledged_at is distinct from old.acknowledged_at then
    if not app.is_own_report(new.daily_report_id) then
      raise exception '受け取りを押せるのは、日報を書いた本人だけです';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists report_feedbacks_validate on public.report_feedbacks;
create trigger report_feedbacks_validate
  before insert or update on public.report_feedbacks
  for each row execute function app.validate_report_feedback();

create or replace function app.validate_report_feedback_mention()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_feedback_team uuid;
  v_member_team   uuid;
begin
  select team_id into v_feedback_team from public.report_feedbacks where id = new.report_feedback_id;
  select team_id into v_member_team from public.team_members where id = new.team_member_id;

  if v_feedback_team is null or v_member_team is null then
    raise exception '宛先の指定が正しくありません';
  end if;
  if v_feedback_team <> new.team_id or v_member_team <> new.team_id then
    raise exception '別のチームの人は宛先にできません';
  end if;

  return new;
end;
$$;

drop trigger if exists report_feedback_mentions_validate on public.report_feedback_mentions;
create trigger report_feedback_mentions_validate
  before insert on public.report_feedback_mentions
  for each row execute function app.validate_report_feedback_mention();

-- -------------------------------------------------------------
-- 誰が書けるか
--
-- **ここを広げる。** これまではスタッフだけだった。
-- 日報から質問を出せるようにするので、**日報を書いた本人も書ける**。
--
-- 他人の日報に選手がコメントすることは、引き続き無い。
-- 「見えるから書ける」にすると、日報が人前のものになる。
-- -------------------------------------------------------------

drop policy if exists report_feedbacks_staff_write on public.report_feedbacks;
drop policy if exists report_feedbacks_write on public.report_feedbacks;

create policy report_feedbacks_write on public.report_feedbacks
  for all to authenticated
  using (
    deleted_at is null
    and app.can_see_report(daily_report_id)
    and (
      app.is_own_report(daily_report_id)
      or app.has_permission(team_id, 'report.view_all')
    )
  )
  with check (
    app.can_see_report(daily_report_id)
    and (
      app.is_own_report(daily_report_id)
      or app.has_permission(team_id, 'report.view_all')
    )
    -- 差出人を偽らせない（0015 の通知と同じ考え方）
    and author_id = app.current_profile_id()
  );

alter table public.report_feedback_mentions enable row level security;

drop policy if exists report_feedback_mentions_select on public.report_feedback_mentions;
create policy report_feedback_mentions_select on public.report_feedback_mentions
  for select to authenticated
  using (
    exists (
      select 1 from public.report_feedbacks f
      where f.id = report_feedback_id and f.deleted_at is null
    )
  );

-- 宛先を足せるのは、そのコメントを書いた本人だけ
drop policy if exists report_feedback_mentions_insert on public.report_feedback_mentions;
create policy report_feedback_mentions_insert on public.report_feedback_mentions
  for insert to authenticated
  with check (
    app.is_team_member(team_id)
    and exists (
      select 1 from public.report_feedbacks f
      where f.id = report_feedback_id
        and f.author_id = app.current_profile_id()
    )
  );

grant select, insert, delete on public.report_feedback_mentions to authenticated;

-- -------------------------------------------------------------
-- 受け取りました
--
-- 押せるのは**日報を書いた本人だけ**。
-- コーチが自分で「読まれたことにする」ことはできない。
--
-- 自分が書いたコメントには要らない（自分の言葉を自分で確認しない）。
-- -------------------------------------------------------------
create or replace function public.acknowledge_report_feedback(p_feedback_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.report_feedbacks;
begin
  select * into v_row from public.report_feedbacks
  where id = p_feedback_id and deleted_at is null;

  if v_row.id is null then
    raise exception '対象のコメントが見つかりません';
  end if;

  if not app.is_own_report(v_row.daily_report_id) then
    raise exception '自分の日報に届いたものだけ確認できます';
  end if;

  if v_row.author_id = app.current_profile_id() then
    raise exception '自分が書いたものは確認の対象ではありません';
  end if;

  -- すでに押してあれば、時刻を上書きしない。
  -- 最初に読んだのがいつかが、あとから見て意味を持つ。
  if v_row.acknowledged_at is null then
    update public.report_feedbacks set acknowledged_at = now() where id = p_feedback_id;
  end if;
end;
$$;

revoke all on function public.acknowledge_report_feedback(uuid) from public;
grant execute on function public.acknowledge_report_feedback(uuid) to authenticated;

-- -------------------------------------------------------------
-- まとめて確認する
--
-- 日報を開いて、届いているものを全部読んだとき用。
-- 1件ずつ押させると、3件来た日に3回押すことになる。
-- -------------------------------------------------------------
create or replace function public.acknowledge_report_feedbacks(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  if not app.is_own_report(p_report_id) then
    raise exception '自分の日報だけ確認できます';
  end if;

  update public.report_feedbacks
  set acknowledged_at = now()
  where daily_report_id = p_report_id
    and deleted_at is null
    and acknowledged_at is null
    and author_id <> app.current_profile_id();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.acknowledge_report_feedbacks(uuid) from public;
grant execute on function public.acknowledge_report_feedbacks(uuid) to authenticated;

-- -------------------------------------------------------------
-- まだ受け取っていないもの
--
-- 選手の「今日」に出す。**押すまで消えない。**
--
-- 素の select でも引けるが、
--   * 自分の日報である
--   * 自分が書いたものではない
--   * まだ押していない
-- の3つを画面ごとに書くと、必ずどこかで1つ落ちる。
-- -------------------------------------------------------------
create or replace function public.list_unacknowledged_feedbacks(p_limit integer default 20)
returns table (
  feedback_id     uuid,
  daily_report_id uuid,
  report_date     date,
  author_name     text,
  body            text,
  created_at      timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select f.id, f.daily_report_id, r.report_date,
         coalesce(nullif(p.display_name, ''), p.full_name, '不明'),
         f.body, f.created_at
  from public.report_feedbacks f
  join public.daily_reports r on r.id = f.daily_report_id
  join public.team_members m on m.id = r.team_member_id
  left join public.profiles p on p.id = f.author_id
  where m.profile_id = app.current_profile_id()
    and f.deleted_at is null
    and r.deleted_at is null
    and f.acknowledged_at is null
    and f.author_id <> app.current_profile_id()
  order by f.created_at desc
  limit p_limit;
$$;

revoke all on function public.list_unacknowledged_feedbacks(integer) from public;
grant execute on function public.list_unacknowledged_feedbacks(integer) to authenticated;

-- -------------------------------------------------------------
-- 通知の種別を足す
--
-- report_question   … 選手が日報から質問した（呼ばれたコーチへ）
-- report_replied    … その返事が来た（選手へ）
-- -------------------------------------------------------------
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;

alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'feedback_requested', 'feedback_assigned', 'feedback_answered',
    'feedback_follow_up', 'feedback_acknowledged', 'feedback_overdue',
    'share_approval_requested',
    'skill_applied', 'skill_application_updated',
    'report_commented', 'report_question', 'report_replied',
    'video_commented', 'video_mentioned',
    'report_missing', 'training_missing', 'general'));


-- ---------- 0028_push_subscriptions.sql ----------
-- =============================================================
-- 0028_push_subscriptions.sql
-- スマートフォンに通知を届ける（Web Push）。
--
-- これまでの通知はアプリの中だけだった。
-- 開かないと気づかないので、「見てもらえた」がなかなか成立しない。
-- ロック画面に出るようにする。
--
-- なぜ Web Push を選んだか（3章の10・11）:
--   * 特定の会社に依存しない。ブラウザの標準の仕組み
--   * 通数の制限も課金もない。部の予算で止まることがない
--   * 送る鍵（VAPID）は自分たちで作る。誰かの審査を待たない
--
--   LINE は学生がいちばん見るが、公式アカウントの開設と
--   全員の友だち追加が要り、無料は月200通まで。
--   （LINE Notify は 2025-03 で終了しているので使えない）
--
-- iPhone の制約:
--   **ホーム画面に追加していないと届かない。** Safari で開いただけでは駄目。
--   Android は追加なしで届く。
--   これはこちらでは変えられないので、画面で案内する。
--
-- -------------------------------------------------------------
-- ここに入るものは「その端末へ通知を送れる鍵」
--
-- endpoint + p256dh + auth の3つが揃うと、**その端末に
-- 通知を出せてしまう**。パスワードほどではないが、鍵に近い。
--
--   * 本人以外に読ませない（他人の端末へ送れてしまう）
--   * 送るのはサーバだけ。画面には返さない
--   * 消すのは本人（と、期限切れを片付けるサーバ）
-- =============================================================

create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references public.teams(id) on delete cascade,
  team_member_id uuid not null references public.team_members(id) on delete cascade,

  -- 送り先。ブラウザが発行する URL。端末ごとに違う。
  endpoint       text not null,
  -- 中身を暗号化するための鍵。ブラウザが発行する。
  p256dh         text not null,
  auth           text not null,

  -- どの端末か、人が見て分かるように（「iPhone の Safari」など）。
  -- 消すときに、どれを消すのかが分からないと選べない。
  label          text,

  -- 最後に送れた時刻。掃除の判断に使う。
  last_success_at timestamptz,
  -- 続けて失敗した回数。一定を超えたら畳む。
  failure_count  int not null default 0,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- 同じ端末を二重に登録しない。
  -- 登録し直すたびに増えると、同じ通知が何度も鳴る。
  unique (endpoint)
);

create index if not exists push_subscriptions_member_idx
  on public.push_subscriptions (team_member_id);

create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function app.set_updated_at();

-- -------------------------------------------------------------
-- 参照先の筋を通す（0011 の教訓）
-- -------------------------------------------------------------
create or replace function app.validate_push_subscription()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_member_team uuid;
begin
  select team_id into v_member_team from public.team_members where id = new.team_member_id;
  if v_member_team is null then
    raise exception '対象の部員が見つかりません';
  end if;
  if v_member_team <> new.team_id then
    raise exception '別のチームの部員には登録できません';
  end if;
  return new;
end;
$$;

drop trigger if exists push_subscriptions_validate on public.push_subscriptions;
create trigger push_subscriptions_validate
  before insert or update on public.push_subscriptions
  for each row execute function app.validate_push_subscription();

-- -------------------------------------------------------------
-- 誰に見えるか
--
-- **本人だけ。** コーチにも管理者にも見せない。
-- 見えたところで使い道が無く、他人の端末へ通知を送る材料になるだけ。
-- -------------------------------------------------------------
alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own on public.push_subscriptions
  for all to authenticated
  using (app.is_own_member(team_member_id))
  with check (app.is_team_member(team_id) and app.is_own_member(team_member_id));

grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- -------------------------------------------------------------
-- 送り先を取り出す
--
-- 送るのはサーバ（service role）。
-- **画面からは呼べない。** 他人の鍵を引けてしまうため、
-- authenticated には実行権限を与えない。
-- -------------------------------------------------------------
create or replace function public.list_push_targets(p_team_member_ids uuid[])
returns table (
  subscription_id uuid,
  team_member_id  uuid,
  endpoint        text,
  p256dh          text,
  auth            text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.team_member_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.team_member_id = any(p_team_member_ids);
$$;

revoke all on function public.list_push_targets(uuid[]) from public;
-- authenticated には渡さない。service role だけが呼ぶ。

-- -------------------------------------------------------------
-- 届かなくなった端末を片付ける
--
-- 端末を初期化したりアプリを消したりすると、送り先は消える。
-- 放っておくと、送るたびに失敗し続ける。
--
-- 送る側が 404/410 を受け取ったらすぐ消す。
-- それ以外の失敗（通信の不調など）は数えるだけにして、
-- 続けて失敗したときだけ畳む。1回の不調で消すと、
-- 電波の悪い場所にいただけの人が通知を受け取れなくなる。
-- -------------------------------------------------------------
create or replace function public.drop_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

revoke all on function public.drop_push_subscription(text) from public;

create or replace function public.record_push_result(p_endpoint text, p_ok boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.push_subscriptions
  set last_success_at = case when p_ok then now() else last_success_at end,
      failure_count   = case when p_ok then 0 else failure_count + 1 end
  where endpoint = p_endpoint;
$$;

revoke all on function public.record_push_result(text, boolean) from public;


-- ---------- 0029_current_session.sql ----------
-- =============================================================
-- 0029_current_session.sql
-- ログインしている人の「素性」を、1回の問い合わせで返す。
--
-- なぜ:
--   画面を1枚出すたびに、こちらは3回に分けて聞いていた。
--     1. profiles      … あなたは誰か
--     2. team_members  … どのチームの、どの立場か
--     3. member_permissions … 個別に足された/外された権限
--   3つは前のこたえが無いと次を聞けないので、順番待ちになる。
--   ここが往復3回ぶん、そのまま待ち時間になっていた。
--
--   1回で返せば、往復は1回で済む。
--   スマートフォンの回線だと、この差がそのまま「重い」になる。
--
-- 注意:
--   security definer なので RLS を通らない。
--   **必ず auth.uid() から辿ること。** 引数で誰かを指定できるようにすると、
--   他人の素性を引ける関数になってしまう。引数は取らない。
-- =============================================================

create or replace function public.current_session()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select p.id, p.user_id, p.full_name, p.display_name, p.email, p.avatar_url
    from public.profiles p
    where p.user_id = auth.uid()
      and p.deleted_at is null
    limit 1
  ),
  membership as (
    -- 在籍中の所属を1件。将来チームを複数持つときは、ここで選ばせる。
    select tm.id, tm.team_id, tm.role_code, t.display_name as team_name
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.profile_id = (select id from me)
      and tm.status = 'active'
      and tm.deleted_at is null
    order by tm.created_at
    limit 1
  )
  select case
    when (select id from membership) is null then null
    else jsonb_build_object(
      'user_id',        (select user_id from me),
      'profile_id',     (select id from me),
      'full_name',      (select full_name from me),
      'display_name',   (select display_name from me),
      'email',          (select email from me),
      'avatar_url',     (select avatar_url from me),
      'team_id',        (select team_id from membership),
      'team_name',      (select team_name from membership),
      'team_member_id', (select id from membership),
      'role',           (select role_code from membership),
      -- 上書きが1件も無いことのほうが多い。そのときは空の入れ物を返す。
      'overrides',      coalesce(
                          (
                            select jsonb_object_agg(mp.permission_code, mp.granted)
                            from public.member_permissions mp
                            where mp.team_member_id = (select id from membership)
                          ),
                          '{}'::jsonb
                        )
    )
  end;
$$;

-- ログインしていない人には実行させない
revoke all on function public.current_session() from public;
grant execute on function public.current_session() to authenticated;

