# このリポジトリで AI が守ること

共通ルールは `fujisan-0121/obsidian-codex-cowork-vault` の `AGENTS.md` と `02_reference/CROSS_REVIEW.md`。ここには、このリポジトリ固有のことだけを書く。

## このリポジトリは public

- 2026-09-15 時点で public（GitHub Pages で研修ポータル `index.html` を配信）。private 化または `audio-app` の分離は藤原の判断待ち
- public である間、社内システムの構成（ドメイン、ID、管理者アドレス、Notion のページ ID）を新たに追加しない。既に入っているものは分離時に整理する
- トークン、`.dev.vars`、`.env`、鍵ファイルは絶対にコミットしない（CI が名前で検査する）

## audio-app

- 認証は Cloudflare Access のみ。独自認証を作らない。`wrangler.jsonc` の `preview_urls` と `workers_dev` は false のまま
- `src/auth.ts`、`migrations/`、`.github/workflows/`、`scripts/deploy.mjs` の変更はクロス査読の対象。PR を開き、実装したエンジンの逆側（Claude Code 実装なら Codex）に査読させる
- 変更前に `npm run typecheck` と `npm test` を通す。CI（`.github/workflows/ci.yml`）も同じことを確認する
- main へ直接コミットしない。ブランチで作業して PR を開く

## 記録

作業の結果、判断、確認事項は Vault の `03_handoffs/Session_log.md` に残す。このリポジトリには README と変更差分だけを残す。
