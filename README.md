# 慶應ホッケーハブ（Keio Hockey Hub）

慶應義塾大学 女子フィールドホッケー部のための、チームマネジメントシステムです。

Notion や Google スプレッドシートで分かれている運営を1つにまとめ、
**選手が「今日何をすればいいか」で迷わない**ことを最優先に作っています。

```
シーズン目標 → 今週のテーマ → 今日の練習 → 練習前の準備 → 練習・試合
   → 日報 → トレーニング記録 → 動画による質問 → コーチのフィードバック
   → 次回の個人課題 → 自分の目標に積み上がる → 次の練習へ
```

この循環をシステム上でつなげることが目的です。

---

## いまどこまでできているか

| Phase   | 内容                                                                | 状態              |
| ------- | ------------------------------------------------------------------- | ----------------- |
| Phase 0 | 基盤（Next.js / TypeScript / Tailwind / テスト / CI / Docker）      | ✅ 完了           |
| Phase 1 | 認証・チーム・ロール・権限・RLS・モバイルナビ                       | ✅ 完了           |
| Phase 2 | データ移行（選手プロフィール）Import Center                         | ✅ 完了           |
| Phase 3 | シーズン・週・イベント・今日のダッシュボード                        | ✅ 完了           |
| Phase 4 | コンディション・個人目標・日報・トレーニング記録・提出状況          | ✅ 完了           |
| Phase 5 | YouTube動画・仮想クリップ・質問投稿                                 | ✅ 完了           |
| Phase 6 | コーチ回答・再質問・チーム共有・通知（**循環が閉じた**）            | ✅ 完了           |
| Phase 7 | R2 への動画投稿・署名付き URL での再生・削除                        | ✅ 完了           |
| Phase 8 | スキル階層・申請・根拠の添付・コーチの審査・承認履歴                | 🗄 0026 で置き換え |
| Phase 9 | お知らせ一覧・保存容量の集計と掃除・操作の記録・CSV 書き出し        | ✅ 完了           |
| 追加    | 測定の記録と推移（自己ベスト・前回比・折れ線）                      | ✅ 完了           |
| 追加    | スキル定義の管理・役割と権限の変更（SQL 不要で運用できる）          | ✅ 完了           |
| 追加    | 消したものを戻す（動画は30日以内、記録は期限なし）                  | ✅ 完了           |
| 追加    | 招待リンク（新入部員が自分でアカウントを作れる）                    | ✅ 完了           |
| 追加    | 日報へのコーチのコメント（動画を使わない、短い往復）                | ✅ 完了           |
| 追加    | 「出したこと」と「中身」を分ける（自分だけの日報も提出済み）        | ✅ 完了           |
| 追加    | 動画を掲示板に一本化（時間+コメント、メンションで会話）             | ✅ 完了           |
| 追加    | 部のチャンネルから動画を自動で取り込む（限定公開に対応）            | ✅ 完了           |
| 追加    | 動画ごとに見せる相手を手で変える（広げられるのは上げた本人）        | ✅ 完了           |
| 追加    | 目標を2段階に（大分類は固定、中目標は各自が書く。申請は廃止）       | ✅ 完了           |
| 追加    | 日報を8項目に絞る／コーチの返事を読むまで閉じない                   | ✅ 完了           |
| 追加    | 通知が届かなかったのを直す（RLS と insert().select() の噛み合わせ） | ✅ 完了           |
| 追加    | スマートフォンに通知を届ける（Web Push。ロック画面に出る）          | ✅ 完了           |
| 追加    | 押した手ごたえを出す／画面が出るまでの往復を5回から1回へ            | ✅ 完了           |

進め方の詳細は [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)、
細かい作業一覧は [TASKS.md](TASKS.md) にあります。

**いま動くこと**

依頼書66章の「最初の到達点」と、67章の「次の到達点」まで通しで動きます。

```
管理者: ログイン → Google Sheets から選手をコピペ登録
        → シーズン作成 → 今週のテーマ作成 → 練習予定作成
        → 提出状況の確認

選手:   ログイン → 今日のダッシュボード → 今週のテーマ → 今日の練習予定
        → 練習前コンディション → 今日の個人目標
        → 練習 → 日報（8項目。中目標を押す + 聞きたいことがあれば質問）
        → コーチの返事を読んで「読みました」を押す（押すまで今日に残る）
        → 動画に時間+ひとことを書き込む（掲示板）→ 呼びたい人を選ぶ
        → または自主練をその場で撮って投稿 → そこにも書き込める
        → 返事を読む → その「次回の課題」が明日の個人目標になる
        → 日報や書き込みに自分の目標を付ける → その目標に回数が積み上がる

コーチ: 返事待ちの書き込みを確認（呼ばれていないものも拾える）
        → 返信する → 必要なら部内全員へ広げてもらう
        → 提出状況からその日の日報を開いて、ひとこと返す
        → 返した言葉は、選手が「読みました」を押すまで未読のまま残る
```

**依頼書の循環が一周つながりました。**
コーチの回答に書いた「次回の課題」は、選手の次の練習の個人目標の候補として
そのまま出てきます（`practice_goals.source_feedback_id` に出どころを残します）。
日報や動画の書き込みに自分の目標を付けておくと、その目標に回数が積み上がります。

積み上がったものは「今日」の画面に出ます。
**到達度（%）ではなく「何回向き合ったか」**です。
承認の数を追いかけると、承認されにくい目標を書かなくなるためです。
記録が形として残ることが、続ける支えになります。

測定の記録は、項目ごとに推移を折れ線で見られます。
50m走のように**小さいほど良い項目でも、線は良い方向が上**になります。
自己ベストを更新すると「今日」の画面に出ます。

記録は CSV で取り出せます（「書き出し」）。
出るのは自分に見えているものだけで、選手が押せば自分の記録、
コーチが押せば見える範囲すべてが出ます。
Excel でも Google スプレッドシートでも開けます。

「今日」の画面は、練習前・練習中・練習後で出す内容が変わります。
練習前に日報を求めたり、オフの日に記録を迫ったりはしません。

長い動画は YouTube に限定公開で置き、このシステムは
「どの動画の、どこからどこまでか」だけを覚えます（[docs/video-architecture.md](docs/video-architecture.md)）。

短い動画（既定で60秒・50MBまで）は Cloudflare R2 に置きます。
動画本体はこのシステムのサーバーを通らず、ブラウザから直接送られます。
再生用のリンクはその都度発行し、保存しません（[docs/storage.md](docs/storage.md)）。
投稿した動画は、はじめはコーチとスタッフだけが見られます。

部のチャンネルから取り込んだ動画は「部内全員」で入ります（YouTube 側で既に見られるため）。
1本ずつ手で狭められますが、**コーチでも、ほかの人が上げた動画を部内全員へ広げることはできません**。
広げられるのは上げた本人だけです（[docs/youtube.md](docs/youtube.md)）。

---

## 動かし方（タブレット・スマートフォンだけの場合）

**何もインストールせずに、ブラウザだけで動かせます。**
iPad には Node.js を入れられませんし、Android でも骨が折れます。
そのかわり、置き場所（Vercel）に任せて、できあがった画面を開きます。

使うのは3つのサイト、どれもブラウザだけで終わります。

```
GitHub    …… ここ。コードはもう置いてある
Supabase  …… データの置き場所。SQL を3回貼り付ける
Vercel    …… アプリの置き場所。GitHub とつなぐだけ
```

### 手順1: Supabase を用意する（10分）

1. <https://supabase.com> で **Sign in with GitHub** → **New project**
2. Region は **Northeast Asia (Tokyo)** を選びます
3. Database Password は控えておきます（今回は使いませんが、後で要ります）
4. 出来上がるまで2分ほど待ちます

### 手順2: SQL を12回貼り付ける（20分）

左の **SQL Editor** を開き、**New query** で次を**番号順に**実行します。
それぞれ GitHub 上のファイルを開き、**Raw** を押して全選択・コピーします。

| 順    | ファイル                            | 何をするか                       |
| ----- | ----------------------------------- | -------------------------------- |
| 1〜10 | `supabase/parts/01.sql` 〜 `10.sql` | 表・RLS・関数を全部作る          |
| 11    | `supabase/seed.sql`                 | 見本のチーム・今週・練習予定など |
| 12    | `supabase/setup/first-admin.sql`    | 自分を管理者にする（下記）       |

**あとから migration が増えたときは、増えたぶんだけ流せば済みます。**
`supabase/updates/` に、1つずつ・コメントを落とした短い版を置いてあります。
（例: 0028 だけなら 4千文字。同じ結果になることをテストで確かめてあります）

`parts/` は最初にまとめて流す用です。
1ファイル版（`supabase/bundled.sql`）は19万文字あり、
タブレットでは全選択もコピーも重くなります。実際にそこで詰まりました。

分割の境目は migration の切れ目に置いてあるので、
順に流せば1ファイル版とまったく同じ結果になります。
（1ファイル版との構造の一致と、DB テスト19種の通過を確認済み）

同じクエリ画面を使い回して構いません。**毎回、前の中身を消してから**貼ってください。

> 黄色い `... does not exist, skipping` がたくさん出ますが正常です。
> **赤い ERROR** が出ていなければ次へ進んでください。

12 の前に、**Authentication → Users → Add user → Create new user** で
自分のメールとパスワードを登録してください。
**Auto Confirm User を必ず有効に**します（確認メールを待たずに入れます）。

そのうえで 12 のファイルの冒頭2行だけ書き換えて実行します。

```sql
v_email     text := 'いま登録したメールアドレス';
v_full_name text := '自分の名前';
```

`完了: ... を管理者にしました。` と出れば成功です。

### 手順3: Vercel に置く（10分）

1. <https://vercel.com> で **Continue with GitHub**
2. **Add New → Project** → `keio-hockey-hub` を **Import**
3. 設定は**そのままで構いません**。
   このリポジトリはルートに `package.json` があるので、
   Root Directory も枝も触る必要はありません。
4. **Environment Variables** に3つ入れます。
   値は Supabase の **Project Settings → API** にあります。

   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJ...   ← anon public
   SUPABASE_SERVICE_ROLE_KEY      = eyJ...   ← service_role
   ```

   > `SUPABASE_SERVICE_ROLE_KEY` に `NEXT_PUBLIC_` を付けてはいけません。
   > 付けるとブラウザに配られ、誰でも全データを読めるようになります。

5. **Deploy** を押して、2〜3分待ちます

> Docker 向けの `output: 'standalone'` は、Vercel では自動で外れます
> （`next.config.ts`）。Vercel は同じことを自前でやるため、
> 指定したままだとビルドが失敗します。

### ビルドが失敗したとき

**Redeploy を押しても直りません。**
Redeploy は「そのときのコミット」をもう一度ビルドし直すものなので、
あとから直した内容は入りません。ここで一度つまずきました。

直したら **push します**。つながっていれば Vercel が自動で始めます。
**Deployments** の一番上に、新しいコミット名の行が現れるので、それを見ます。

| 見え方   | 意味                                                             |
| -------- | ---------------------------------------------------------------- |
| Building | 実行中。2〜3分                                                   |
| Ready    | 成功。開けます                                                   |
| Error    | 失敗。行をタップ → **Building** を開いて、下のほうの赤い行を読む |

一番上の行が古いコミットのままなら、Vercel が変更を受け取れていません。
**Settings → Git** で、つながっているリポジトリを確かめてください。

### 手順4: 戻り先を教える（ログインに必要）

Vercel が出した URL（`https://～.vercel.app`）を控えて、2か所に入れます。

1. Supabase の **Authentication → URL Configuration → Site URL** に貼る
2. Vercel の **Settings → Environment Variables** に足して、**Redeploy**

   ```
   NEXT_PUBLIC_APP_URL = https://～.vercel.app
   ```

これをしないと、パスワード再設定や招待リンクが localhost へ戻ろうとします。

### 手順5: 開く

タブレットで `https://～.vercel.app` を開き、手順2で作ったメールとパスワードでログインします。

うまくいかないときは `https://～.vercel.app/setup-check` を開いてください。
どの設定が入っていて、どれが空かだけを表示します（値そのものは出しません）。

> **ホーム画面に追加**しておくと、アドレスバーが消えて実際の使い勝手に近くなります。
> スマートフォンで片手で使う前提の作りなので、そちらでも確かめてみてください。

### migration を足したときは、必ず先に流す

**コードだけ先に出すと、アプリが開かなくなります。**
実際に 0029 でそうなりました（`ERR_TOO_MANY_REDIRECTS`）。

新しい migration が増えたときは、Vercel のビルドが終わる前後に
Supabase の **SQL Editor** で `supabase/updates/` の同じ番号を実行してください。

```
supabase/updates/0029.sql   ← 番号ぶんだけ。短いので数十秒で終わります
```

流し忘れた場合、いまは**画面に理由が出ます**
（「データベースの更新がまだ済んでいません」）。
以前は無言で往復し続けるだけでした。

### 手順6: 鍵の方式を切り替える（速くなる・1分）

Supabase の **Authentication → JWT Keys** を開いて、
公開鍵方式（ECC / RSA）へ切り替えます。

これをすると、**画面を出すたびの往復が2回減ります。**
ログインしている人かどうかを、Supabase へ聞きに行かずに
手元で確かめられるようになるためです。

切り替えなくても動きます。そのときは、いままでどおり毎回聞きに行きます
（安全性は変わりません。速さだけの話です）。
理由は [docs/responsiveness.md](docs/responsiveness.md) と
[docs/security.md](docs/security.md) の 17-8 に書きました。

---

## 動かし方（パソコンがある場合）

### 1. 必要なもの

- Node.js 22 以上
- pnpm 10 以上
- Supabase のプロジェクト（無料枠で始められます）
- Cloudflare R2（短い動画の投稿に必要。未設定でも他の機能は動きます）

### 2. 準備

```bash
pnpm install
cp .env.example .env.local
```

`.env.local` に Supabase の値を入れます。値は Supabase の
「Project Settings → API」から取得できます。

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

> `SUPABASE_SERVICE_ROLE_KEY` はサーバーだけで使う鍵です。
> `NEXT_PUBLIC_` を付けてはいけません（ブラウザに配られてしまいます）。

短い動画の投稿を使う場合は、Cloudflare R2 の値も入れます。
未設定でも他の機能は動きます（投稿画面だけが「まだ使えません」と出ます）。

```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_ENDPOINT=https://<accountId>.r2.cloudflarestorage.com
STORAGE_LIMIT_BYTES=26843545600
```

> Bucket は Public Access を無効にしてください。
> ブラウザから直接 PUT するので、CORS の設定も要ります。
> 手順は [docs/storage.md](docs/storage.md) の8章にあります。

### 3. データベースを作る

migration を1つのファイルにまとめてから、SQL Editor に貼り付けます。
23 個を順に貼るのは、順番を間違える余地が 23 回あるということなので、
まとめてしまうほうが確実です。

`supabase/bundled.sql` がその1ファイルです（git に入れてあります）。
migration を足したときは作り直します。

```bash
./scripts/bundle-migrations.sh   # supabase/bundled.sql を作り直す
```

このファイルの中身を Supabase の SQL Editor に貼り付けて、実行します。
「Success. No rows returned」と出れば完了です
（`... does not exist, skipping` という NOTICE は正常です。
作り直しに備えて `drop ... if exists` を書いてあるためです）。

中身は次の順です。

```
0001_core.sql              チーム・プロフィール・所属・権限
0002_auth_helpers.sql      RLS から呼ぶ補助関数
0003_timeline.sql          シーズン・週・イベント
0004_daily.sql             コンディション・日報・トレーニング
0005_files_videos.sql      ファイル・動画・仮想クリップ
0006_feedback_skills.sql   動画フィードバック・スキル
0007_import_notifications.sql  データ移行・通知・測定
0008_rls.sql               Row Level Security
0009_master_data.sql       ロールと権限のマスタ（必須）
0010_grants.sql            テーブル権限
0011_cross_team_reference_guard.sql  別チームのレコードを参照させない
0012_video_visibility_fix.sql        公開範囲を「見てよい人」の判定に効かせる
0013_soft_delete_rpc.sql             動画の論理削除（RLS を通すための関数）
0014_skill_guards.sql                自分で自分を承認させない・履歴を自動で残す
0015_notification_insert.sql         通知を作れるようにする（ポリシーが無かった）
0016_storage_ops.sql                 容量の集計と掃除（関数を通す）
0017_measurement_guards.sql          測定の参照先チェックと、自分の記録の入力
0018_role_guards.sql                 役割を自分で上げられないようにする
0019_soft_delete_visibility.sql      消した記録が消した人からも見えないようにする
0020_restore.sql                     消したものを戻せるようにする
0021_invitations.sql                 招待リンク（生の値は保存しない）
0022_report_feedback.sql             日報のコメントを、日報の公開範囲に合わせる
0023_submission_status.sql           出したことと中身を分ける（RLS では書けないため）
0024_video_comments.sql              動画の掲示板（時間+コメント、返信、宛先）
0025_youtube_connection.sql          チャンネル連携（鍵は画面から読めない）
0026_member_goals.sql                中目標（各自が書く）とタグ。申請・承認は廃止
0027_report_thread.sql               日報のやり取り（返信・宛先・受け取りの印）
```

Supabase CLI が使える場合は次でも構いません。

```bash
pnpm db:reset   # migration → seed をまとめて流す
```

続けて `supabase/seed.sql` も同じように実行します。
**最初に試すときは入れておくことをおすすめします。**
チーム・シーズン・今週・練習予定・スキル階層・測定項目が入り、
どの画面も空っぽでない状態から触れます。
（今日を含む週を必ず作るので、いつ動かしても「今週」が出ます）

> **SQL が要るのは最初の1人だけです。**
> 2人目以降は「招待」からリンクを渡せば、本人がアカウントを作れます。
> 役割の変更も画面から行えます（名簿 → 設定）。

### 4. 最初の管理者を作る

移行で作る選手は「まだログインしていない人」として登録されます（[ADR-0002](docs/decisions/0002-profile-identity.md)）。
最初の管理者だけは手で作ります。

1. Supabase の Authentication → Users → 「Add user」で
   自分のメールとパスワードを登録します。
   **Auto Confirm User を有効に**しておくと、確認メールを待たずに入れます。
2. `supabase/setup/first-admin.sql` を開き、**冒頭の2行だけ**書き換えて
   SQL Editor で実行します。

```sql
v_email     text := 'ここに管理者のメールアドレス';
v_full_name text := 'ここに氏名';
```

`完了: ... を管理者にしました。` と出て、
下の確認用の SELECT が1行返れば成功です。

seed の見本（`admin@example.com`）と同じメールで作った場合は、
新しく作らずにその人へログインを結び付けます。
何度実行しても二重にはなりません。

### 5. 起動する

```bash
pnpm dev
```

<http://localhost:3000> を開き、手順4で作ったメールとパスワードでログインします。

うまくいかないときは <http://localhost:3000/setup-check> を開いてください。
どの設定が入っていて、どれが空かだけを表示します
（値そのものは表示しません）。

**最初に見るとよい順番**

```
今日            いまの状況。ここが入口
日報            書いて提出する。公開範囲を変えると説明が変わる
提出状況        コーチとして、誰が出していないかを見る（管理者・コーチのみ）
名簿 → 招待     2人目を招く。リンクを渡すだけ
データ移行      スプレッドシートの名簿を貼り付けて取り込む
```

選手としての画面も見たい場合は、招待でもう1つアカウントを作り、
別のブラウザ（またはプライベートウィンドウ）でログインすると、
両方を並べて確かめられます。

---

## 過去データの移行

Google スプレッドシートの選手名簿を、そのままコピー＆ペーストで取り込めます。

```
管理者でログイン → 「データ移行」
  → スプレッドシートで範囲を選んでコピー → 貼り付け
  → 列の対応づけを確認 → プレビューで件数と警告を確認 → 取り込む
```

- 「名前 / 氏名 / 選手名 / Player」などの表記ゆれは自動で対応づけます
- 「3 / 3年 / 3年生」「Forward / フォワード / FW」なども吸収します
- 判断できないものは**勝手に決めず**、警告やエラーとして 人に返します
- 既定では**既存データを上書きしません**
- 取り込んだあと、その回ぶんをまとめて**取り消せます**

詳しくは [docs/import.md](docs/import.md) と [docs/migration-guide.md](docs/migration-guide.md) を参照してください。

---

## 開発

```bash
pnpm dev           # 開発サーバー
pnpm type-check    # 型検査
pnpm lint          # ESLint
pnpm test          # 単体テスト（Vitest）
pnpm test:e2e      # E2E（Playwright）
pnpm build         # 本番ビルド
pnpm db:test       # Migration + RLS + 制約テスト（一時的な PostgreSQL を立てて実行）
pnpm check         # 型・Lint・単体テスト・ビルドをまとめて
pnpm icons         # ホーム画面のアイコンを作り直す
```

### ホーム画面のアイコン

元の絵は `scripts/generate-icons.mjs` の中の SVG だけです。
`public/icon.svg` と `public/icon-192.png` / `icon-512.png` は、そこから作ります。
PNG を直接描き換えると、次に直す人が「どれが本物か」を探すことになります。

案を差し替えるときは、同じファイルの `DESIGN` を書き換えて `pnpm icons` を流します
（`ivory` / `ink` / `sandbars` / `sand` / `rose`。いまは `sandbars`）。
`manifest.json` の `background_color`（起動直後の一瞬に出る色）も一緒に揃います。

Android は端末ごとに違う形へ勝手に切り抜くので（maskable）、
絵は外側 20% が切られる前提で中央に置いてあります。

### テストの構成

| 種類 | 場所                   | 何を守るか                                                                      |
| ---- | ---------------------- | ------------------------------------------------------------------------------- |
| 単体 | `src/**/*.test.ts`     | 権限判定、Import の解析・正規化・照合、容量・動画の制限、今日やることの判定     |
| DB   | `supabase/tests/*.sql` | RLS（他人の日報が見えないこと等）、状態遷移、制約、別チーム参照の禁止、公開範囲 |
| E2E  | `e2e/`                 | 未ログイン時の振り分け、入力欄、スマートフォン幅での崩れ                        |

`e2e/authenticated/` は Supabase を用意した環境でだけ動きます。

```bash
E2E_SUPABASE=1 E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... pnpm test:e2e
```

### 型の生成

`src/types/database.types.ts` は現在手で書いています。
Supabase をローカルに用意できる環境では、生成に切り替えてください。

```bash
pnpm db:types
```

---

## ドキュメント

| 文書                                                     | 内容                                              |
| -------------------------------------------------------- | ------------------------------------------------- |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)         | 要件の理解・MVP・Phase 計画・技術的なリスク・前提 |
| [TASKS.md](TASKS.md)                                     | 作業のチェックリスト                              |
| [docs/architecture.md](docs/architecture.md)             | 全体構成、レイヤー、インフラの役割分担            |
| [docs/database.md](docs/database.md)                     | ER図とテーブルの説明                              |
| [docs/permissions.md](docs/permissions.md)               | ロールと権限、RLS の考え方                        |
| [docs/workflows.md](docs/workflows.md)                   | ログイン・1日の流れ・動画の掲示板                 |
| [docs/goals.md](docs/goals.md)                           | 目標の使い方（2段階・タグ・積み上がり）           |
| [docs/daily-report.md](docs/daily-report.md)             | 日報の書き方と、コーチとのやり取り                |
| [docs/push.md](docs/push.md)                             | スマートフォンへの通知（設定と、部員への案内）    |
| [docs/youtube.md](docs/youtube.md)                       | 部のチャンネルとつなぐ、公開範囲を手で変える      |
| [docs/import.md](docs/import.md)                         | Import Center の設計                              |
| [docs/migration-guide.md](docs/migration-guide.md)       | 実際の移行手順                                    |
| [docs/video-architecture.md](docs/video-architecture.md) | 3種類の動画の扱い、仮想クリップ                   |
| [docs/storage.md](docs/storage.md)                       | R2、Presigned URL、ファイルの一生                 |
| [docs/capacity-planning.md](docs/capacity-planning.md)   | 容量の見積もりと上限                              |
| [docs/responsiveness.md](docs/responsiveness.md)         | 速さと、押した手ごたえ                            |
| [docs/security.md](docs/security.md)                     | 守ること、守り方                                  |
| [docs/deployment.md](docs/deployment.md)                 | 公開手順                                          |
| [docs/decisions/](docs/decisions/)                       | 設計判断の記録（ADR）                             |

---

## このリポジトリについて

このリポジトリには複数のプロジェクトが入っています。

- ルート: `hearth-life`（Discord ライフログ Bot / Python）
- `hearth-growth/`: 活動時間を共有する Web アプリ（Next.js + Supabase）
- `keio-hockey-hub/`: **このプロジェクト**

それぞれ独立していて、依存関係も設定も分かれています。
