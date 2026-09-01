# CLAUDE.md

このリポジトリで作業する Claude Code 向けのガイド。

## プロジェクト概要

「仕組み化研修ポータルサイト｜経営者メンバー専用」。Animo社長研修（全3回）の受講者向けポータル。
ビルド不要の静的サイトで、成果物は `index.html` 1ファイルのみ。フレームワーク・パッケージマネージャ・テストは存在しない。

- 言語: 日本語UI（`<html lang="ja">`）
- 外部依存: Google Fonts（Noto Serif JP / Noto Sans JP / Cormorant Garamond）、html2pdf.js 0.10.1（cdnjs）
- 永続化: すべて `localStorage`。サーバー・DB・認証基盤なし
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
4. `<script>`（1本のインラインスクリプト）: NAV → DATA → 課題・事業分解シート → お知らせ → 管理者機能 → セッションステータス → INIT → STARTUP

### ページ一覧（`.page-section` の id）

| id | 表示名 | サイドバー |
|---|---|---|
| page-dashboard | ダッシュボード | あり |
| page-documents | 資料ライブラリ | あり |
| page-schedule | スケジュール | あり |
| page-jigyo | 課題・事業分解 | あり |
| page-qna | Q&A ボード | あり |
| page-members | メンバー一覧 | あり |
| page-homework | 宿題 | なし（CSSのみ残存） |
| page-kennshu | 研修資料閲覧 | なし（`showKSection` で内部フィルタ。導線が未接続） |

ページ切替は `showPage(id, el)`。タイトルは同関数内の `titles` マップに追加する。

## コンテンツ更新はここを触る（JS の定数）

| 定数 | 内容 |
|---|---|
| `DOCS` | 資料ライブラリ。`size:'準備中'` のものはDL不可扱いになり、ダッシュボードの件数にも反映 |
| `dlDoc()` 内 `downloads` | `DOCS.id` と base64 定数・保存ファイル名の対応表。資料追加時は両方更新 |
| `HW` | 宿題 |
| `QNA` | Q&A 初期データ（投稿は localStorage にマージ） |
| `MEMBERS` | 受講メンバー（実名・会社名） |
| `ISSUE_CATEGORIES` | 課題・事業分解シートの分類と項目。`id` は localStorage キーになるので変更しない |
| `DEFAULT_ANNOUNCES` | お知らせ初期値 |
| `SESSION_STATUS_OPTIONS` | 各回の開催ステータス選択肢 |
| `SESSION_LABELS` / `SESSION_COLORS` | 回ごとのラベル・色 |

### localStorage キー

`portal_admin`, `portal_announces`, `portal_session_status`, `jigyo_member_name`, `jigyo_member_company`, `jigyo_<itemId>`（課題シート各行の状態）, Q&A 投稿（`loadQnaFromStorage` / `saveQnaToStorage` 参照）。
キー名を変えると既存ユーザーのデータが消えるので、変更は互換処理込みで行う。

## デザイン規約

- 色は `:root` の CSS 変数を使う（`--navy` `--orange` `--cream` `--sand` `--border` `--muted` など）。新しい色を直書きしない
- 見出しは Noto Serif JP、本文は Noto Sans JP、英字装飾は Cormorant Garamond
- 既存のカード（`.card`）/ フィルタボタン（`.filter-btn`）/ バッジのパターンを再利用する
- 印刷（PDF出力）は `#page-jigyo` 専用。他ページに印刷機能を足すなら `@media print` を分岐させる

## 既知の注意点（変更前に必ず把握する）

1. **ログインは実質バイパスされている。** STARTUP セクションで `#login-screen` を即 `display:none` にし、ポータルを表示している。PIN 入力にハンドラは存在しない。認証を「戻す」場合は STARTUP と `#pin-input` の両方を実装する必要がある
2. **秘密情報がハードコードされている。** 管理者パスワード（`ADMIN_PASS`）と Chatwork API トークン（`X-ChatWorkToken` ヘッダ、`postQna` と `sendToChatwork` の2箇所）が平文で埋め込まれている。静的サイトなので閲覧者全員に見える。値を CLAUDE.md や会話ログに転記しない。ローテーションと外部化（サーバーレス関数経由など）が本来の対処
3. **Chatwork 送信は `corsproxy.io` 経由。** 第三者プロキシに依存しており、停止・仕様変更で通知が落ちる。失敗時はクリップボードコピーにフォールバックする実装になっている
4. `page-kennshu` と `page-homework` はナビから到達できない。削除か導線追加かは要確認
5. `DOCS.id` は連番ではない（1,3,4,6,7）。`dlDoc` の対応表と一致させること

## 動作確認

ビルド・テストコマンドはない。ブラウザで直接開くか、ローカルサーバーで確認する:

```bash
python3 -m http.server 8000
# http://localhost:8000/index.html
```

`file://` で開くと Google Fonts / cdnjs は読めるが、Chatwork 送信は CORS で失敗する。

変更後の最低限のチェック:

- 各 `.nav-item` をクリックしてページが切り替わる
- 資料ライブラリで DL 可能な3件がダウンロードできる
- 課題・事業分解シートで入力→リロードして保持されている
- ブラウザコンソールにエラーがない

## Git 運用

- `main` が本番相当。作業は feature ブランチで行い、`git push -u origin <branch>` する
- base64 部分を含む差分は巨大になるので、PDF 差し替えは単独コミットにする
- コミットメッセージは変更内容が分かる日本語または英語。「Add files via upload」のような無内容なものは避ける
