#!/usr/bin/env bash
# Obsidian Vaultの実体パスを解決する。
#
# 解決順序:
#   1. 環境変数 OBSIDIAN_VAULT_PATH が実在するディレクトリを指していればそれを使う
#   2. ~/.config/claude-obsidian/vault-path の1行目が実在するディレクトリを指していればそれを使う
#
# 成功時: 解決したパスを標準出力に1行で出し、終了コード0
# 失敗時: 何もしない標準出力、ヒントを標準エラーに出し、終了コード1
#
# 呼び出し側(Claude / Codex)は、失敗時は reference.md の「Vaultパス解決」の
# 手順3に従う(対話でユーザーに一度だけ尋ねて設定ファイルに保存する、
# または対話できない環境ならリポジトリ内 obsidian-drafts/ にフォールバックする)。

set -euo pipefail

CONFIG_FILE="${HOME}/.config/claude-obsidian/vault-path"

if [ -n "${OBSIDIAN_VAULT_PATH:-}" ] && [ -d "${OBSIDIAN_VAULT_PATH}" ]; then
  echo "${OBSIDIAN_VAULT_PATH}"
  exit 0
fi

if [ -f "${CONFIG_FILE}" ]; then
  candidate="$(head -n 1 "${CONFIG_FILE}" | tr -d '[:space:]')"
  if [ -n "${candidate}" ] && [ -d "${candidate}" ]; then
    echo "${candidate}"
    exit 0
  fi
fi

{
  echo "Vaultパスを解決できませんでした。"
  echo "対話できる場合: ユーザーにVaultの絶対パスを尋ね、次のファイルに保存してください:"
  echo "  ${CONFIG_FILE}"
  echo "対話できない/Vaultに触れない環境の場合: リポジトリ内の obsidian-drafts/ にフォールバック保存し、"
  echo "その旨をユーザーに伝えてください(詳細は reference.md 参照)。"
} >&2

exit 1
