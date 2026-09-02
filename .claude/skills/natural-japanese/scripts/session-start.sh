#!/usr/bin/env bash
# SessionStart hook 用。藤原人格と文体ナレッジをコンテキストに流す。
#
# ファイルに「## 核」という見出しがあれば、その見出しから次の同レベル見出し（## ）の手前までだけを流す。
# 無ければ全文を流す。長いナレッジでも毎セッションのトークンを抑えるための仕掛け。
#
# 標準出力に出したものがそのままセッションのコンテキストに入る。

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

eval "$(bash "$HERE/resolve_files.sh" 2>/dev/null)" || true
STYLE="${STYLE:-}"
PERSONA="${PERSONA:-}"
FALLBACK="${FALLBACK:-0}"

emit() {
  local label="$1" f="$2"
  if [ -z "$f" ] || [ ! -f "$f" ]; then
    printf '【natural-japanese】%sが見つからない。references の既定ルールだけで整える。scripts/resolve_files.sh で場所を確認すること。\n\n' "$label"
    return
  fi
  if grep -qE '^## 核' "$f"; then
    printf '【%s（核の部分。全文は %s）】\n' "$label" "$f"
    awk '/^## 核/{p=1; print; next} /^## /{if(p){exit}} p' "$f"
  else
    printf '【%s（全文。%s）】\n' "$label" "$f"
    cat "$f"
  fi
  printf '\n\n'
}

printf '【natural-japanese】日本語を書く・直す・返答するタスクでは、着手前にこの2ファイルの内容を土台にし、natural-japanese スキルの手順で整える。\n\n'
if [ "$FALLBACK" = "1" ]; then
  printf '【natural-japanese】この環境からはObsidian保管庫に触れないため、スキル同梱の雛形を使っている。保管庫側の最新版とは差がある可能性がある。成果物の最後に一行、その旨を添える。\n\n'
fi
emit "藤原人格" "$PERSONA"
emit "文体ナレッジ" "$STYLE"
