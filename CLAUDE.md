# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業する際に常に読み込む指示です。

## Obsidian自動記録を標準動作にする

`.claude/skills/obsidian-auto-write/` に、重要な更新・手順・繰り返しパターンをローカルのObsidian Vault
(Codex/Cowork/Obsidianで共有しているAI作業用Vault)の `03_handoffs/Session_log.md` へ自動で追記する
スキルがある。これは常に意識しておく標準動作として扱うこと — ユーザーから「メモして」と言われたときだけ
でなく、作業の区切りごとに「これはSession_log.mdに残す価値があるか?」を自問し、該当すれば指示を待たずに
書き込むこと。

このVaultにはすでに独自の運用ルール(Vault直下の `AGENTS.md` / `00_START_HERE.md`、さらに優先される
親プロジェクトの `AGENTS.md`)がある。新しいルールを発明せず、必ずそれらに従うこと。判断基準・Vaultパスの
解決方法・追記フォーマット・優先順位の詳細は
`.claude/skills/obsidian-auto-write/SKILL.md` と `.claude/skills/obsidian-auto-write/reference.md` を参照。

注意: これはClaudeの文脈判断に基づく運用であり、100%の強制ではない。見落としがあり得ることは
正直に前提としておく。
