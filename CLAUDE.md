# CLAUDE.md

このリポジトリで作業する Claude Code 向けのガイド。

## プロジェクト概要

「仕組み化研修ポータルサイト｜経営者メンバー専用」。Animo社長研修（全3回）の受講者向けポータル。
ビルド不要の静的サイトで、本体は `index.html`（HTML/CSS/JS を1ファイルに同居）。配布PDFは `docs/`。フレームワーク・パッケージマネージャ・テストは存在しない。
リポジトリは **公開** で、GitHub Pages で配信されている。つまり index.html に書いたものは全世界に見える前提で扱う。

- 言語: 日本語UI（`<html lang="ja">`）
- 外部依存: Google Fonts（Noto Serif JP / Noto Sans JP / Cormorant Garamond）、html2pdf.js 0.10.1（cdnjs）
- 永続化: すべて `localStorage`。サーバー・DB なし
- ログイン: 4桁PIN（メンバー別）。ハッシュだけを `MEMBER_PINS` に置き、平文は `tools/pins.csv`（git 管理外）
- Chatwork 通知: `tools/chatwork-proxy.gs`（Google Apps Script）経由。トークンは GAS 側に置く
- リポジトリ: https://github.com/fujisan-0121/lstep-portal

## index.html の扱い方

- 約130KB・約2,300行。`grep -n` で位置を特定し、`sed -n 'START,ENDp'` で範囲読みする。全体 Read は不要だが可能
- 編集は `Edit`（部分置換）か `sed`。`Write` での全体書き直しは避ける
- 改行コードは **CRLF**（`.gitattributes` で固定）。Python 等で書き戻すときは `newline=""` かバイナリモードで扱い、LF に変換しない。変換すると差分が全行になる
- 配布PDFは base64 で埋め込まない。`docs/` に置き、`DOC_FILES` でパスと DL 時ファイル名を対応させる（過去は埋め込みで 4MB あった）

セクションの位置を素早く出す:

```bash
grep -nE '/\* ─── |// ─── |id="page-' index.html | cut -c1-80
```

## ファイル構造（上から順）

1. `<head>`: フォント読込、html2pdf.js、`@media print`（課題シートPDF出力用に `#page-jigyo` だけ印刷）
2. `<style>`: CSS 変数（`:root`）→ LOGIN SCREEN → MAIN PORTAL → DASHBOARD → DOCUMENTS → SCHEDULE → Q&A / BOARD → MEMBERS → HOMEWORK → RESPONSIVE
3. `<body>`:
   - `#login-screen`: 4桁PIN入力UI（`tryLogin` → `MEMBER_PINS` 照合）
   - `#portal`: サイドバー `.nav-item` + `.page-section` 群
4. `<script>`（1本のインラインスクリプト）: NAV → DATA → Chatwork 通知 → 課題・事業分解シート → お知らせ → 管理者機能 → セッションステータス → ログイン（PIN） → INIT → STARTUP（`bootPortal()`）

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
| `DOC_FILES` | `DOCS.id` → `docs/` のパスと DL 時ファイル名。資料追加時は PDF を `docs/` に置き、`DOCS` と両方更新 |
| `MEMBER_PINS` | PIN ハッシュ → `MEMBERS` の添字（-1 は事務局）。手で編集せず `python3 tools/gen-pins.py --apply` で再生成 |
| `HW` | 宿題。`due` は省略可（未設定なら期限行を出さない） |
| `QNA` | Q&A 初期データ（投稿は localStorage にマージ） |
| `MEMBERS` | 受講メンバー（実名・会社名） |
| `ISSUE_CATEGORIES` | 課題・事業分解シートの分類と項目。`id` は localStorage キーになるので変更しない |
| `DEFAULT_ANNOUNCES` | お知らせ初期値 |
| `SESSION_STATUS_OPTIONS` | 各回の開催ステータス選択肢 |
| `SESSION_LABELS` / `SESSION_COLORS` | 回ごとのラベル・色 |

### localStorage キー

`portal_auth`（ログイン中メンバーの添字）, `portal_admin`, `portal_announces`, `portal_session_status`, `portal_hw_done`, `jigyo_member_name`, `jigyo_member_company`, `jigyo_<itemId>`（課題シート各行の状態）, Q&A 投稿（`loadQnaFromStorage` / `saveQnaToStorage` 参照）。
キー名を変えると既存ユーザーのデータが消えるので、変更は互換処理込みで行う。

## デザイン規約

- 色は `:root` の CSS 変数を使う（`--navy` `--orange` `--cream` `--sand` `--border` `--muted` など）。新しい色を直書きしない
- 見出しは Noto Serif JP、本文は Noto Sans JP、英字装飾は Cormorant Garamond
- 既存のカード（`.card`）/ フィルタボタン（`.filter-btn`）/ バッジのパターンを再利用する
- 印刷（PDF出力）は `#page-jigyo` 専用。他ページに印刷機能を足すなら `@media print` を分岐させる

## 既知の注意点（変更前に必ず把握する）

1. **秘密情報を index.html に書かない。** 公開リポジトリ＋公開サイトなので、書いた瞬間に全世界へ公開される。Chatwork API トークンは過去に直書きされていた経緯があり（git 履歴に残っている）、現在は GAS 側の「スクリプト プロパティ」に移した。ブラウザからは `CHATWORK_PROXY_URL`（GAS ウェブアプリ URL）に POST するだけ。トークンやルームIDを再びフロントに戻す変更は拒否する
2. **`ADMIN_PASS` は「鍵」ではなく「UIの切替スイッチ」。** 管理者モードは localStorage のフラグで判定しており、ソースを読めば誰でも入れる。守っているのはお知らせ編集UIの誤操作だけ。本物のアクセス制御として扱わない
3. **PIN ログインは「鍵」としては弱い。** ハッシュは公開ソースにあり、4桁は総当たり1万通りなので、本気の攻撃者は止められない。止めているのは「URL を知っただけの部外者」。GitHub Pages では本物の認証は実装できないので、必要なら Cloudflare Access 等の前段か、別ホストへの移行を検討する。PIN の追加・変更は `tools/pins.csv` を編集して `gen-pins.py --apply`。`MEMBERS` の順番を変えると添字がずれるので、変えたら必ず再生成する
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

- 誤った PIN でエラー表示、正しい PIN でポータルに入り、サイドバーに氏名が出る。リロードしてもログイン状態が保持される
- 各 `.nav-item` をクリックしてページが切り替わる
- 資料ライブラリで DL 可能な3件がダウンロードできる
- 課題・事業分解シートで入力→リロードして保持されている
- ブラウザコンソールにエラーがない
- `grep -nE 'X-ChatWorkToken|api.chatwork.com' index.html` が空（トークン直書きの再発防止）

## Git 運用

- `main` が本番相当（GitHub Pages が配信）。作業は feature ブランチで行い、`git push -u origin <branch>` する
- PDF の追加・差し替えは `docs/` のバイナリ差分になる。コード変更とは別コミットにする
- `tools/pins.csv` は絶対にコミットしない（.gitignore 済み）
- コミットメッセージは変更内容が分かる日本語または英語。「Add files via upload」のような無内容なものは避ける

## Obsidian自動記録を標準動作にする（obsidian-auto-write）

`.claude/skills/obsidian-auto-write/` に、重要な更新・手順・繰り返しパターンをローカルのObsidian Vaultへ自動でMarkdownノートとして書き込むスキルがある（PR #1）。作業の区切りごとに「これはObsidianに残す価値があるか?」を自問し、該当すれば指示を待たずに書き込む。判断基準・Vaultパスの解決方法・ノートフォーマットは同スキルの `SKILL.md` と `reference.md` を参照。Vaultパスの設定（`OBSIDIAN_VAULT_PATH` か `~/.config/claude-obsidian/vault-path`）は natural-japanese と共通。

## 日本語を書くときの標準動作（natural-japanese）

日本語の文章を書く・直す・返答するタスクでは、着手前に `.claude/skills/natural-japanese/` のスキルを使う。藤原人格と文体ナレッジを全文読んでから書き、AIの癖を落として呼吸のある日本語に整える。出力にアスタリスクを入れない。

- ファイルの場所の解決は `.claude/skills/natural-japanese/scripts/resolve_files.sh`。Obsidian保管庫に触れないクラウドセッションでは、同スキル同梱の雛形（`assets/templates/`）に自動で落ち、その旨を成果物の最後に一行添える
- セッション開始時に `.claude/settings.json` の SessionStart hook が人格と文体の「核」をコンテキストへ流す
- ローカル環境で呼び出し不要にするには、一度だけ `bash .claude/skills/natural-japanese/scripts/install.sh` を実行する
- このリポジトリは公開なので、`assets/templates/` に置くのは公開して構わない雛形だけ。本人の内側の言葉や取引先の実名、金額は保管庫と claude.ai の非公開スキルにだけ置く
