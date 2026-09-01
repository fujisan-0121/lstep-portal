#!/usr/bin/env bash
# Obsidian Vaultの実体パスを解決する。
#
# 解決順序:
#   1. 環境変数 OBSIDIAN_VAULT_PATH が実在するディレクトリを指していればそれを使う
#   2. ~/.config/claude-obsidian/vault-path の1行目が実在するディレクトリを指していればそれを使う
#   3. 既知の候補パス(.obsidianフォルダの存在で本物のVaultかどうか確認した上で使う)
#
# 成功時: 解決したパスを標準出力に1行で出し、終了コード0
# 失敗時: 何もしない標準出力、ヒントを標準エラーに出し、終了コード1
#
# 呼び出し側(Claude / Codex)は、失敗時は reference.md の「Vaultパス解決」の
# 手順に従う(ローカルで対話できるならユーザーに一度だけ尋ねて設定ファイルに保存する、
# クラウドなどVaultに直接触れない環境ならGitHubリポジトリ経由のフォールバックを使う)。

set -euo pipefail

CONFIG_FILE="${HOME}/.config/claude-obsidian/vault-path"

# GitHubリポジトリ名から類推した、ありそうなローカルクローン先(未確認の推測)。
# .obsidian フォルダが実在することまで確認できて初めて「それらしい」と判断する。
CANDIDATE_PATH="${HOME}/Documents/New project/obsidian-codex-cowork-vault"

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

if [ -d "${CANDIDATE_PATH}" ] && [ -d "${CANDIDATE_PATH}/.obsidian" ]; then
  echo "${CANDIDATE_PATH}"
  exit 0
fi

{
  echo "Vaultパスを解決できませんでした。"
  echo "対話できる場合: ユーザーにVaultの絶対パスを尋ね、次のファイルに保存してください:"
  echo "  ${CONFIG_FILE}"
  echo "対話できない/Vaultに直接触れない環境(クラウドセッション等)の場合: reference.md の"
  echo "「クラウドセッションでの書き込み手順」に従い、GitHubリポジトリ"
  echo "fujisan-0121/obsidian-codex-cowork-vault へブランチを切ってpushしてください。"
  echo "M&A関連ファイル(.gitignoreで除外されているもの)には絶対に触れないこと。"
} >&2

exit 1
