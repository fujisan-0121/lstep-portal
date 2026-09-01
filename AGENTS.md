# AGENTS.md

このファイルはCodex CLI(および同様にリポジトリ規約を読むエージェント)がこのリポジトリで作業する際に
常に読み込む指示です。

## Obsidian自動記録を標準動作にする

このリポジトリでは、重要な更新・手順・繰り返しパターンに気づいたら、指示されなくてもローカルのObsidian
Vaultへ自動でMarkdownノートを書き込む運用にしている。判断基準・Vaultパスの解決方法・ノートフォーマットの
詳細は `.claude/skills/obsidian-auto-write/reference.md` に書かれている。Codex CLIはClaude CodeのSKILL.md
形式を読まないため、この `reference.md` が判断基準の正本になる。

作業の区切り(タスク完了時、大きな決定をした直後)ごとに「これはObsidianに残す価値があるか?」を自問し、
該当すれば `reference.md` の手順(Vaultパス解決 → ノート作成)に従って書き込むこと。

Vaultパスの解決には `.claude/skills/obsidian-auto-write/scripts/resolve-vault-path.sh` を使う。
このスクリプトはツールに依存せず、シェルから直接実行できる。

注意: これはエージェントの文脈判断に基づく運用であり、100%の強制ではない。見落としがあり得ることは
正直に前提としておく。
