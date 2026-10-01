# Claude Code 向け入口

このリポジトリのルールは AGENTS.md にある。Claude Code は AGENTS.md を自動では読まないため、ここで読み込む。

@AGENTS.md

## クロス査読（毎回守る部分）

共通ルールは社内 Vault の CROSS_REVIEW.md。

1. main に直接コミットしない。ブランチで作業し、PR を開く
2. `audio-app/` のコード、`wrangler.jsonc`、`migrations/`、`.github/`、`scripts/`、AGENTS.md / CLAUDE.md の変更は査読対象。実装と逆側（Claude Code 実装なら Copilot コードレビュー、Codex 連携が有効なら「@codex review」も）に査読させる
3. PR 本文の「クロス査読」欄を、査読が返ってから埋める。対象ファイルがあるのに「査読ツール」「P0 / P1」が空、または「未実施」「依頼中」だと CI（review-gate）が赤になる。CI が見るのは記入の有無だけ
4. P0 / P1 が残っている、CI が赤い、査読が未実行のどれかならマージしない
5. 査読記録は社内 Vault に残す（このリポジトリは public なので記録を置かない）
