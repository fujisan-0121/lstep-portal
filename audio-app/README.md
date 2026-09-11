# 社内音声ライブラリ（社内向け音声配信アプリ）

社内メンバー向けに音声（朝礼・社長メッセージ・営業共有・研修など）を配信し、
過去のアーカイブをカテゴリー別に探せて、管理者は「誰がどこまで聴いたか」を確認でき、
メンバーはコメントを書けるアプリです。

## できること

| 役割 | 機能 |
| --- | --- |
| メンバー | 新着・続きから再生、アーカイブの検索とカテゴリー絞り込み、途中再開、再生速度、コメント投稿・自分のコメント削除、表示名の変更 |
| 管理者 | 配信の登録（ファイルをアップロード、または**ブラウザでその場で録音**）、下書き・公開の切り替え、編集・削除、カテゴリー管理、エピソードごとの視聴状況（未再生 / 途中 % / 聴了）、メンバーごとの視聴状況、CSV ダウンロード、管理者の追加 |

「聴了」は 90% 以上再生した状態です。進捗は再生中 15 秒ごと、一時停止・終了・タブを閉じる時に保存されます。

### その場で録音

「＋ 新しい配信」→「その場で録音」で、PC やスマホのマイクからそのまま収録できます。
録音しながらブラウザ内で MP3（モノラル 64kbps、1 時間で約 28MB）に変換するので、どの端末で録っても iPhone / Android / PC のすべてで再生できます。
一時停止・再開、録り直し、登録前の聴き直しができます。マイクの許可を求められたら「許可」を選んでください。

MP3 変換には LAME の JavaScript 移植 [lamejs](https://github.com/zhuker/lamejs)（LGPL）を `public/vendor/lame.min.js` として同梱しています。LAME: https://lame.sourceforge.net

### ナレッジ連携（Notion 議事録DB）

配信を公開すると、5 分以内に自動で次が動きます（Cron、1 件ずつ）。

1. 文字起こし: Cloudflare Workers AI の Whisper（`@cf/openai/whisper-large-v3-turbo`、日本語）。MP3 はフレーム境界で約 8 分ごとに分割して処理
2. 要約: Workers AI の LLM で「概要 / 決定事項 / 次アクション」を生成
3. Notion: 「AI秘書室 / 個人議事録DB」に 1 行作成。会議名 = 配信タイトル、開催日 = 公開日、録音元 = 社内音声、要約、トランスクリプトURL = 配信ページ。本文に概要・決定事項・次アクション・文字起こし全文
   種別とタグは空欄のまま入れるので、既存の後処理 AI（「[AI秘書] 未処理」ビュー）がそのまま埋めます

アプリ側では、エピソード画面に要約と文字起こし全文、Notion へのリンクが出ます。アーカイブの検索は文字起こしも対象です。
管理画面の「ナレッジ」列で状態（待機中 / 処理中 / Notion 済 / エラー）を確認でき、「再処理」でやり直せます。

Notion 連携の設定（初回のみ）:

1. https://www.notion.so/profile/integrations → 新しいインテグレーション → 名前「社内音声ライブラリ」、種類は内部 → 作成。「内部インテグレーションシークレット」をコピー
2. Notion で「AI秘書室」ページを開く → 右上「…」→「接続」→ 作成したインテグレーションを追加（配下の 個人議事録DB にも適用される）
3. GitHub のリポジトリ Secrets に `NOTION_TOKEN` として登録し、デプロイのワークフローを再実行

`NOTION_TOKEN` が無い間も文字起こしと要約はアプリ内に保存されます（Notion 登録だけ「未設定」）。
Workers AI を使うため、デプロイ用の API トークンに「Workers AI: 編集」の権限が必要です。

## 構成

- Cloudflare Workers（Hono）: API と画面の配信。`src/index.ts`
- Cloudflare D1: メンバー・カテゴリー・エピソード・再生履歴・コメント。`migrations/`
- Cloudflare R2: 音声ファイル本体。Range リクエストに対応したストリーミング配信
- Cloudflare Access: ログイン。独自のパスワード認証は持たず、Access が発行する JWT を Worker 側で検証する。`src/auth.ts`
- 画面: ビルド不要の素の HTML / CSS / JavaScript。`public/`

「誰が聴いたか」の身元は Cloudflare Access のログイン（Google Workspace などの会社アカウント）に紐づくため、
メンバー登録作業は不要です。初めてアクセスした時点で自動的にメンバーとして追加されます。

## 画面だけ先に見たい場合（デモ）

Cloudflare の設定なしで画面と操作感を確認できます。データはブラウザ内にだけ保存され、音声は合成音で代用しています。

```bash
cd audio-app
npx serve .            # または任意の静的サーバー
# http://localhost:3000/demo/ を開く
```

サイドバー下の「デモ: ユーザーを切り替え」で、管理者と一般メンバーの見え方を切り替えられます。

## ローカル開発

```bash
cd audio-app
npm install
cp .dev.vars.example .dev.vars     # DEV_USER_EMAIL / ADMIN_EMAILS を自分のアドレスに
npm run db:migrate:local
npm run dev                        # http://127.0.0.1:8787
```

ローカルでは Cloudflare Access を通らないため、`.dev.vars` の `DEV_USER_EMAIL` の人物としてふるまいます。
`X-Dev-User: someone@example.co.jp` ヘッダーを付けると別の人物を装えます（`ENVIRONMENT=development` のときだけ有効）。

確認コマンド:

```bash
npm run typecheck      # 型チェック
bash test/smoke.sh     # npm run dev を起動した状態で API の一連の流れを検証
```

## 本番デプロイ手順

前提: Cloudflare アカウント、Cloudflare に紐づいたドメイン（現状は lstepoffcial.com のみ。markeline.net は Cloudflare 管理外）、Zero Trust（Access）が有効。

### GitHub Actions から行う（Claude Code のリモート環境から Cloudflare に届かない場合）

Claude Code の Web 版リモート環境は、組織のネットワーク設定次第で api.cloudflare.com へ接続できない。
その場合は GitHub Actions がデプロイを実行する。

1. Cloudflare の API トークンと Account ID を用意する（権限は下記「API トークンの権限」）
2. GitHub のリポジトリ → Settings → Secrets and variables → Actions → New repository secret で
   `CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` を登録する
3. Actions タブ → 「Deploy audio-app to Cloudflare」 → Run workflow（ドメインや管理者は既定値のままでよい）
   Claude Code からも GitHub 連携経由で起動・ログ確認ができる

### 一番速い方法（1コマンド）

API トークンを用意して、次を実行すると D1 / R2 / Access アプリ / マイグレーション / デプロイまで一気に終わります。

```bash
cd audio-app && npm install
CLOUDFLARE_API_TOKEN=xxxx CLOUDFLARE_ACCOUNT_ID=yyyy npm run deploy:full
# 完了すると https://audio.lstepoffcial.com が開ける
```

省略可能な環境変数: `AUDIO_DOMAIN`（既定 audio.lstepoffcial.com）、`ADMIN_EMAILS`（既定 fujiwara@markeline.net）、
`ALLOWED_EMAIL_DOMAINS`（既定 markeline.net）、`ALLOWED_EMAILS`（ドメイン外で個別に許可する人）。

#### API トークンの権限

Cloudflare ダッシュボード → My Profile → API Tokens → Create Token → Custom token で次を付ける。

| 対象 | 権限 |
| --- | --- |
| Account / Workers Scripts | Edit |
| Account / D1 | Edit |
| Account / Workers R2 Storage | Edit |
| Account / Access: Apps and Policies | Edit |
| Account / Access: Organizations, Identity Providers, and Groups | Read |
| Zone / Workers Routes | Edit（Zone Resources は lstepoffcial.com） |
| Zone / DNS | Edit（カスタムドメインの作成に必要） |
| User / User Details | Read（トークン検証に使う） |

Account ID は Cloudflare ダッシュボードの Workers & Pages 画面の右側に表示される。
トークンはチャットや Vault に貼らず、環境変数（Claude Code の環境設定、または自分の端末のシェル）に入れる。

### 手動で行う場合

1. リソースを作る
   ```bash
   npx wrangler login
   npx wrangler d1 create audio_db          # 出力の database_id を wrangler.jsonc に貼る
   npx wrangler r2 bucket create markeline-audio
   ```
2. `wrangler.jsonc` を編集する
   - `d1_databases[0].database_id` を上の値に
   - `routes` のコメントを外し、使うドメイン（例 `audio.example.co.jp`）を設定
   - `vars.ADMIN_EMAILS` に管理者のメールアドレス（カンマ区切り）
3. Cloudflare Access のアプリケーションを作る
   - Zero Trust → Access → Applications → Add an application → Self-hosted
   - Application domain に手順 2 のドメイン
   - Policy: 会社のメールドメイン（例 `@example.co.jp`）を Allow。ログイン方法は Google Workspace など会社で使っているものを選ぶ
   - 作成後、Overview の **Application Audience (AUD) Tag** を `vars.ACCESS_AUD` に、
     Zero Trust のチームドメイン（`xxxx.cloudflareaccess.com`）を `vars.ACCESS_TEAM_DOMAIN` に設定
4. マイグレーションとデプロイ
   ```bash
   npm run db:migrate
   npm run deploy
   ```
5. 確認
   - ドメインにアクセスして Access のログイン画面が出る → 会社アカウントでログイン → 画面が出る
   - `ADMIN_EMAILS` の人でログインすると、サイドバーに「配信管理・視聴状況」が出る

### 守ること

- `workers_dev: false` と `preview_urls: false` は変更しない。Access を通らない入口ができてしまう
- `ADMIN_EMAILS` 以外の管理者は、管理画面の「メンバー」タブから追加する
- 音声ファイルは R2 に保存され、ログイン済みメンバーにだけ配信される。ファイルの直リンクは存在しない

## 主な API

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/api/me` | 自分の情報と管理者かどうか |
| GET | `/api/categories` | カテゴリー一覧（公開エピソード数つき） |
| GET | `/api/episodes?category=&q=` | 公開エピソード一覧（自分の進捗つき） |
| GET | `/api/episodes/:id` | 詳細とコメント |
| GET | `/api/episodes/:id/audio` | 音声（Range 対応） |
| POST | `/api/episodes/:id/progress` | 再生位置の保存 `{position, duration, started}` |
| POST | `/api/episodes/:id/comments` | コメント投稿 |
| DELETE | `/api/comments/:id` | コメント削除（本人か管理者） |
| POST / PUT / DELETE | `/api/admin/episodes[/:id]` | 配信の登録・編集・公開・削除 |
| PUT | `/api/admin/episodes/:id/audio` | 音声アップロード（本文にファイルをそのまま送る） |
| GET | `/api/admin/stats` | 配信ごとの再生・聴了数 |
| GET | `/api/admin/episodes/:id/listeners` | 全メンバーの視聴状況 |
| GET | `/api/admin/members` | メンバー一覧と視聴状況 |
| GET | `/api/admin/export.csv` | 視聴ログ CSV |

## 今後の拡張候補

- 新着配信を LINE / Chatwork に自動通知する（Worker からの Webhook 送信）
- 文字起こしの自動生成と検索（Workers AI）
- 「必聴」フラグと未再生者へのリマインド
