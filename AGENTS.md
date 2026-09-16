# このリポジトリで AI が守ること

共通ルールは `fujisan-0121/obsidian-codex-cowork-vault` の `AGENTS.md` と `02_reference/CROSS_REVIEW.md`。ここには、このリポジトリ固有のことだけを書く。

## このリポジトリは public

- 2026-09-15 時点で public（GitHub Pages で研修ポータル `index.html` を配信）。private 化または `audio-app` の分離は藤原の判断待ち
- public である間、社内システムの構成（ドメイン、ID、管理者アドレス、Notion のページ ID、Cloudflare のアカウント ID）を新たに追加しない。既に入っているものの棚卸しと整理は分離時に行い、その一覧は Vault の `03_handoffs/Session_log.md` に記録する
- 禁止はファイルだけでなく、Issue 本文、PR の説明、コミットメッセージ、CI のログにも及ぶ。CI の検査はファイル名しか見ない
- トークン、`.dev.vars`（環境別の `.dev.vars.production` なども含む）、`.env`、鍵ファイルは絶対にコミットしない（CI が名前で検査する）。一度 push した秘密は削除しても履歴に残るので、その鍵はローテーションする
- D1 のダンプや SQL のシード、R2 のオブジェクト一覧、音声ファイル、受講者やメンバーの名簿・メールアドレスなど、データそのものをコミットしない（Vault の「個人情報・会員情報を増やさない」と同じ）
- `index.html` を配信している GitHub Pages の公開元（ブランチとディレクトリ）配下は、サブディレクトリも含めて全世界に配信される。公開元が root なら `audio-app/` 以下も配信対象。運用メモ、設計書、環境値をそこに置かない。private 化しても Pages の公開元が残っていれば配信は公開のままなので、分離時に Pages の設定も確認する
- ワークフローで `pull_request_target` と `workflow_run` を使わない。fork からの PR に secrets を触らせる経路になる。デプロイは `workflow_dispatch` のみ
- secrets を使うワークフローを追加するときは、その時点で Actions を commit SHA で固定する（現状の CI は secrets 不使用・contents: read のため見送っている）
- CI の検査は GitHub 側で required status check に設定して初めて強制力を持つ。ブランチ保護が入るまでは、マージ前に CI の結果を目視する

## audio-app

- 認証は Cloudflare Access のみ。独自認証を作らない。`wrangler.jsonc` の `preview_urls` と `workers_dev` は false を明示したまま（省略すると既定で有効になる。CI が false の明示を検査する）
- `wrangler.jsonc`、`src/auth.ts`、`migrations/`、`.github/workflows/`、`scripts/deploy.mjs` の変更はクロス査読の対象。PR を開き、実装したエンジンの逆側（Claude Code 実装なら Copilot または Codex）に査読させる
- 変更前に `npm run typecheck` と `npm test` を通す。CI（`.github/workflows/ci.yml`）も同じことを確認する
- main へ直接コミットしない。ブランチで作業して PR を開く

## 記録

作業ログや判断の記録をこのリポジトリに置かない。置くのはコード、設定、README、AI ルール（この AGENTS.md）だけ。作業の結果、判断、確認事項は Vault の `03_handoffs/Session_log.md` に残す。
