# CLAUDE.md

このリポジトリで作業する Claude Code 向けのガイド。

## プロジェクト概要

「仕組み化研修ポータルサイト｜経営者メンバー専用」。Animo社長研修（全3回）の受講者向けポータル。
ビルド不要の静的サイトで、本体は `index.html` 1ファイル。フレームワーク・パッケージマネージャ・テストは存在しない。
リポジトリは **公開** で、GitHub Pages で配信されている。つまり index.html に書いたものは全世界に見える前提で扱う。

- 言語: 日本語UI（`<html lang="ja">`）
- 外部依存: Google Fonts（Noto Serif JP / Noto Sans JP / Cormorant Garamond）、html2pdf.js 0.10.1（cdnjs）
- 永続化: すべて `localStorage`。サーバー・DB・認証基盤なし
- Chatwork 通知: `tools/chatwork-proxy.gs`（Google Apps Script）経由。トークンは GAS 側に置く
- リポジトリ: https://github.com/fujisan-0121/lstep-portal

## 最重要: index.html の扱い方

`index.html` は約4MB・約2,200行だが、容量の大半は PDF の base64 データURI 3本（`PDF_DATA_00` / `PDF_DATA` / `PDF_DATA_11`）が占める。1行が最大 2.2MB ある。

- ファイル全体を Read しない。`grep -n` で位置を特定し、`sed -n 'START,ENDp'` で範囲読みする
- 長い行を出力するときは `cut -c1-200` で切る。base64 行を表示・編集しない
- base64 行を書き換える必要があるのは PDF 差し替え時だけ。その場合はデータ本体を目視せず、`const 名 = "data:...";` の行ごと置換する
- 編集は `Edit`（部分置換）か `sed`。`Write` での全体書き直しは禁止（base64 が壊れる）

セクションの位置を素早く出す:

```bash
grep -nE '/\* ─── |// ─── |id="page-' index.html | cut -c1-80
```

## ファイル構造（上から順）

1. `<head>`: フォント読込、html2pdf.js、`@media print`（課題シートPDF出力用に `#page-jigyo` だけ印刷）
2. `<style>`: CSS 変数（`:root`）→ LOGIN SCREEN → MAIN PORTAL → DASHBOARD → DOCUMENTS → SCHEDULE → Q&A / BOARD → MEMBERS → HOMEWORK → RESPONSIVE
3. `<body>`:
   - `#login-screen`: 4桁PIN入力UI（後述の通り現在は機能していない）
   - `#portal`: サイドバー `.nav-item` + `.page-section` 群
4. `<script>`（1本のインラインスクリプト）: NAV → DATA → Chatwork 通知 → 課題・事業分解シート → お知らせ → 管理者機能 → セッションステータス → INIT → STARTUP

### ページ一覧（`.page-section` の id）

| id | 表示名 | サイドバー |
|---|---|---|
| page-dashboard | ダッシュボード | あり |
| page-documents | 資料ライブラリ | あり |
| page-schedule | スケジュール | あり |
| page-jigyo | 課題・事業分解 | あり |
| page-qna | Q&A ボード | あり |
| page-members | メンバー一覧 | あり |
| page-homework | 宿題・アクションプラン | あり |
| page-kennshu | Animo社長研修（講義内容の閲覧。`showKSection` で創業期/思考理論/ビジネスモデルを絞り込み） | あり |

ページ切替は `showPage(id, el)`。タイトルは同関数内の `titles` マップに追加する。

## コンテンツ更新はここを触る（JS の定数）

| 定数 | 内容 |
|---|---|
| `DOCS` | 資料ライブラリ。`size:'準備中'` のものはDL不可扱いになり、ダッシュボードの件数にも反映 |
| `dlDoc()` 内 `downloads` | `DOCS.id` と base64 定数・保存ファイル名の対応表。資料追加時は両方更新 |
| `HW` | 宿題。`due` は省略可（未設定なら期限行を出さない） |
| `QNA` | Q&A 初期データ（投稿は localStorage にマージ） |
| `MEMBERS` | 受講メンバー（実名・会社名） |
| `ISSUE_CATEGORIES` | 課題・事業分解シートの分類と項目。`id` は localStorage キーになるので変更しない |
| `DEFAULT_ANNOUNCES` | お知らせ初期値 |
| `SESSION_STATUS_OPTIONS` | 各回の開催ステータス選択肢 |
| `SESSION_LABELS` / `SESSION_COLORS` | 回ごとのラベル・色 |

### localStorage キー

`portal_admin`, `portal_announces`, `portal_session_status`, `portal_hw_done`, `jigyo_member_name`, `jigyo_member_company`, `jigyo_<itemId>`（課題シート各行の状態）, Q&A 投稿（`loadQnaFromStorage` / `saveQnaToStorage` 参照）。
キー名を変えると既存ユーザーのデータが消えるので、変更は互換処理込みで行う。

## デザイン規約

- 色は `:root` の CSS 変数を使う（`--navy` `--orange` `--cream` `--sand` `--border` `--muted` など）。新しい色を直書きしない
- 見出しは Noto Serif JP、本文は Noto Sans JP、英字装飾は Cormorant Garamond
- 既存のカード（`.card`）/ フィルタボタン（`.filter-btn`）/ バッジのパターンを再利用する
- 印刷（PDF出力）は `#page-jigyo` 専用。他ページに印刷機能を足すなら `@media print` を分岐させる

## 既知の注意点（変更前に必ず把握する）

1. **秘密情報を index.html に書かない。** 公開リポジトリ＋公開サイトなので、書いた瞬間に全世界へ公開される。Chatwork API トークンは過去に直書きされていた経緯があり（git 履歴に残っている）、現在は GAS 側の「スクリプト プロパティ」に移した。ブラウザからは `CHATWORK_PROXY_URL`（GAS ウェブアプリ URL）に POST するだけ。トークンやルームIDを再びフロントに戻す変更は拒否する
2. **`ADMIN_PASS` は「鍵」ではなく「UIの切替スイッチ」。** 管理者モードは localStorage のフラグで判定しており、ソースを読めば誰でも入れる。守っているのはお知らせ編集UIの誤操作だけ。本物のアクセス制御として扱わない
3. **ログインは実質バイパスされている。** STARTUP セクションで `#login-screen` を即 `display:none` にし、ポータルを表示している。PIN 入力にハンドラは存在しない。GitHub Pages では本物の認証は実装できないので、必要なら Cloudflare Access 等の前段か、別ホストへの移行を検討する
4. **Chatwork 送信は GAS プロキシ未設定だとフォールバックする。** Q&A は「投稿済み（通知は手動）」表示、課題シートはクリップボードコピーになる。デプロイ手順は `tools/chatwork-proxy.gs` の冒頭
5. `DOCS.id` は連番ではない（1,3,4,6,7）。`dlDoc` の対応表と一致させること

## 動作確認

ビルド・テストコマンドはない。ブラウザで直接開くか、ローカルサーバーで確認する:

```bash
python3 -m http.server 8000
# http://localhost:8000/index.html
```

`file://` で開いても動くが、クリップボード API は `localhost` か https でしか動かないため、課題シートのフォールバック確認はサーバー経由で行う。

変更後の最低限のチェック:

- 各 `.nav-item` をクリックしてページが切り替わる
- 資料ライブラリで DL 可能な3件がダウンロードできる
- 課題・事業分解シートで入力→リロードして保持されている
- ブラウザコンソールにエラーがない
- `grep -nE 'X-ChatWorkToken|api.chatwork.com' index.html` が空（トークン直書きの再発防止）

## Git 運用

- `main` が本番相当（GitHub Pages が配信）。作業は feature ブランチで行い、`git push -u origin <branch>` する
- base64 部分を含む差分は巨大になるので、PDF 差し替えは単独コミットにする
- コミットメッセージは変更内容が分かる日本語または英語。「Add files via upload」のような無内容なものは避ける
