#!/usr/bin/env bash
# natural-japanese を「呼び出さなくても動く」状態にするインストーラー。何度実行しても同じ結果になる。
#
#   bash scripts/install.sh              # 実行
#   bash scripts/install.sh --dry-run    # 何をするか表示するだけ
#   bash scripts/install.sh --style /path/文体ナレッジ.md --persona /path/藤原人格.md --vault /path/vault
#
# やること:
#   1. スキル本体を ~/.claude/skills/natural-japanese/ に置く（既にそこなら何もしない）
#   2. Obsidian保管庫の場所を決めて ~/.config/claude-obsidian/vault-path に保存
#   3. 文体ナレッジと藤原人格のファイルを決めて ~/.config/claude-obsidian/natural-japanese.env に保存
#   4. ~/.claude/CLAUDE.md に起動指示を1行足す（重複しない）
#   5. ~/.claude/settings.json の hooks.SessionStart に session-start.sh を登録（重複しない）

set -uo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SRC="$(cd "$HERE/.." && pwd)"
SKILL_DST="${HOME}/.claude/skills/natural-japanese"
CONF_DIR="${HOME}/.config/claude-obsidian"
VAULT_FILE="${CONF_DIR}/vault-path"
ENV_FILE="${CONF_DIR}/natural-japanese.env"
CLAUDE_MD="${HOME}/.claude/CLAUDE.md"
SETTINGS="${HOME}/.claude/settings.json"
DRY=0; STYLE=""; PERSONA=""; VAULT=""; BOOTSTRAP=0
TEMPLATES="${SKILL_SRC}/assets/templates"

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY=1 ;;
    --style) STYLE="$2"; shift ;;
    --persona) PERSONA="$2"; shift ;;
    --vault) VAULT="$2"; shift ;;
    --bootstrap) BOOTSTRAP=1 ;;   # 見つからないファイルを雛形から保管庫に作る
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
  shift
done

say() { printf '%s\n' "$*"; }
run() { if [ $DRY -eq 1 ]; then say "  (dry-run) $*"; else eval "$@"; fi; }
ask() { # $1 prompt -> stdout answer（対話できなければ空）
  if [ -t 0 ]; then read -r -p "$1" ans; printf '%s' "$ans"; else printf ''; fi
}
expand() { local p="$1"; p="${p/#\~/$HOME}"; printf '%s' "$p"; }

say "== 1. スキル本体"
if [ "$SKILL_SRC" = "$SKILL_DST" ]; then
  say "  既に ${SKILL_DST} にある"
else
  say "  ${SKILL_SRC} -> ${SKILL_DST}"
  run "mkdir -p '${HOME}/.claude/skills' && rm -rf '${SKILL_DST}' && cp -R '${SKILL_SRC}' '${SKILL_DST}'"
fi
run "mkdir -p '${CONF_DIR}'"

choose() { # $1 prompt, $2 newline-separated candidates -> stdout chosen path（番号でも絶対パスでも可）
  local prompt="$1" cands="$2" ans n
  n="$(printf '%s\n' "$cands" | grep -c .)"
  ans="$(ask "$prompt")"
  ans="${ans## }"; ans="${ans%% }"
  if printf '%s' "$ans" | grep -qE '^[0-9]+$' && [ "$ans" -ge 1 ] && [ "$ans" -le "$n" ]; then
    printf '%s\n' "$cands" | sed -n "${ans}p"
  else
    expand "$ans"
  fi
}
list_in() { # $1 dir, $2 filename regex -> 一致するmd（ファイル名だけで判定、フォルダ名は見ない）
  find "$1" -type f -name "*.md" -not -path "*/.git/*" -not -path "*/.trash/*" -not -path "*/.obsidian/*" 2>/dev/null \
    | awk -F/ -v pat="$2" 'tolower($NF) ~ tolower(pat)' | sort
}
count_in() { list_in "$1" "$2" | grep -c .; }

say "== 2. Obsidian保管庫"
VAULT="$(expand "${VAULT:-${OBSIDIAN_VAULT_PATH:-}}")"
if [ -z "$VAULT" ] && [ -f "$VAULT_FILE" ]; then VAULT="$(expand "$(head -n1 "$VAULT_FILE" | tr -d '[:space:]')")"; fi
if [ -z "$VAULT" ] || [ ! -d "$VAULT" ]; then
  # よくある置き場所から .obsidian を持つディレクトリを探す
  found="$(find "$HOME/Documents" "$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents" "$HOME/Obsidian" "$HOME/vaults" "$HOME" \
            -maxdepth 4 -type d -name ".obsidian" -not -path "*/Library/Application Support/*" 2>/dev/null | sed 's#/.obsidian$##' | sort -u)"
  n="$(printf '%s\n' "$found" | grep -c .)"
  if [ "$n" -eq 1 ]; then VAULT="$found"
  elif [ "$n" -gt 1 ]; then
    say "  保管庫の候補が${n}件。括弧内は、文体ナレッジらしきmd / 藤原人格らしきmd の件数:"
    i=0
    while IFS= read -r v; do
      i=$((i+1))
      say "    ${i}) ${v}  (文体 $(count_in "$v" '文体|書き方|ライティング|style-?guide') / 人格 $(count_in "$v" '藤原人格|人格|persona|ペルソナ'))"
    done <<< "$found"
    VAULT="$(choose '  使う保管庫の番号（または絶対パス）: ' "$found")"
  else
    VAULT="$(expand "$(ask '  保管庫が見つからない。絶対パスを入力: ')")"
  fi
fi
if [ -n "$VAULT" ] && [ -d "$VAULT" ]; then
  say "  保管庫: ${VAULT}"
  run "printf '%s\n' '${VAULT}' > '${VAULT_FILE}'"
else
  say "  保管庫が決まらなかった。後で ${VAULT_FILE} に絶対パスを書く。"
fi

say "== 3. 文体ナレッジと藤原人格"
export OBSIDIAN_VAULT_PATH="${VAULT}"
[ -n "$STYLE" ] && export NATURAL_JAPANESE_STYLE_FILE="$(expand "$STYLE")"
[ -n "$PERSONA" ] && export NATURAL_JAPANESE_PERSONA_FILE="$(expand "$PERSONA")"
out="$(bash "$HERE/resolve_files.sh" 2>/tmp/nj_resolve_err.txt)"; rc=$?
eval "$out"
pick_file() { # $1 label, $2 name regex, $3 current -> stdout path
  local cur="$3" cands n
  if [ -n "$cur" ] && [ -f "$cur" ]; then printf '%s' "$cur"; return; fi
  cands=""
  [ -d "$VAULT" ] && cands="$(list_in "$VAULT" "$2")"
  n="$(printf '%s\n' "$cands" | grep -c .)"
  if [ "$n" -ge 1 ]; then
    say "  ${1}の候補（${n}件）:" >&2
    i=0; while IFS= read -r f; do i=$((i+1)); say "    ${i}) ${f}" >&2; done <<< "$cands"
    choose "  ${1}の番号（または絶対パス。空でスキップ）: " "$cands"
  else
    say "  ${1}: 保管庫に該当する名前のmdが無い。" >&2
    expand "$(ask "  ${1}の絶対パス（空でスキップ。あとで作るなら空のまま）: ")"
  fi
}
bootstrap_file() { # $1 label, $2 template basename, $3 current -> stdout path
  local cur="$3" dest_dir dest
  if [ -n "$cur" ] && [ -f "$cur" ]; then printf '%s' "$cur"; return; fi
  if [ ! -d "$VAULT" ]; then printf '%s' "$cur"; return; fi
  dest_dir="${VAULT}/natural-japanese"; dest="${dest_dir}/${2}"
  local yes="n"
  if [ $BOOTSTRAP -eq 1 ]; then yes="y"; else yes="$(ask "  ${1}が無い。雛形から ${dest} を作る? [Y/n]: ")"; yes="${yes:-y}"; fi
  case "$yes" in
    y|Y|yes|はい) ;;
    *) printf '%s' "$cur"; return ;;
  esac
  if [ -f "$dest" ]; then say "  ${dest} は既にある。そのまま使う" >&2; printf '%s' "$dest"; return; fi
  if [ ! -f "${TEMPLATES}/${2}" ]; then say "  雛形 ${TEMPLATES}/${2} が無い" >&2; printf '%s' "$cur"; return; fi
  if [ $DRY -eq 1 ]; then say "  (dry-run) ${TEMPLATES}/${2} -> ${dest}" >&2; printf '%s' "$dest"; return; fi
  mkdir -p "$dest_dir" && cp "${TEMPLATES}/${2}" "$dest" && say "  作成: ${dest}" >&2
  printf '%s' "$dest"
}
if [ $rc -ne 0 ]; then
  if [ $BOOTSTRAP -eq 0 ]; then
    STYLE="$(pick_file '文体ナレッジ' '文体|書き方|ライティング|style-?guide|writing-?style' "$STYLE")"
    PERSONA="$(pick_file '藤原人格' '藤原人格|人格|persona|ペルソナ|fujiwara' "$PERSONA")"
  fi
  STYLE="$(bootstrap_file '文体ナレッジ' '文体ナレッジ.md' "$STYLE")"
  PERSONA="$(bootstrap_file '藤原人格' '藤原人格.md' "$PERSONA")"
fi
[ -n "$STYLE" ] && [ ! -f "$STYLE" ] && { say "  注意: ${STYLE} は存在しない。パスだけ記録するので、後でそこにファイルを作る。"; }
[ -n "$PERSONA" ] && [ ! -f "$PERSONA" ] && { say "  注意: ${PERSONA} は存在しない。パスだけ記録するので、後でそこにファイルを作る。"; }
say "  文体ナレッジ: ${STYLE:-（未設定）}"
say "  藤原人格:     ${PERSONA:-（未設定）}"
run "printf 'NATURAL_JAPANESE_STYLE_FILE=%s\nNATURAL_JAPANESE_PERSONA_FILE=%s\n' '${STYLE}' '${PERSONA}' > '${ENV_FILE}'"

say "== 4. ~/.claude/CLAUDE.md"
LINE='日本語の文章を書く・直す・返答するタスクでは、着手前に natural-japanese スキルを使い、藤原人格と文体ナレッジを全文読んでから書く。出力にアスタリスクを入れない。'
if [ -f "$CLAUDE_MD" ] && grep -qF 'natural-japanese スキルを使い' "$CLAUDE_MD"; then
  say "  既に書いてある"
else
  say "  1行追記: ${LINE}"
  run "mkdir -p '${HOME}/.claude' && { [ -s '${CLAUDE_MD}' ] && printf '\n' >> '${CLAUDE_MD}'; printf '%s\n' '${LINE}' >> '${CLAUDE_MD}'; }"
fi

say "== 5. ~/.claude/settings.json の SessionStart hook"
HOOK_CMD="bash \"${SKILL_DST}/scripts/session-start.sh\""
if [ $DRY -eq 1 ]; then
  say "  (dry-run) hooks.SessionStart に追加: ${HOOK_CMD}"
else
  python3 - "$SETTINGS" "$HOOK_CMD" <<'PY'
import json, os, sys
path, cmd = sys.argv[1], sys.argv[2]
data = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as f:
        raw = f.read().strip()
    data = json.loads(raw) if raw else {}
hooks = data.setdefault("hooks", {})
lst = hooks.setdefault("SessionStart", [])
for entry in lst:
    for h in entry.get("hooks", []):
        if "natural-japanese/scripts/session-start.sh" in h.get("command", ""):
            print("  既に登録済み"); sys.exit(0)
lst.append({"hooks": [{"type": "command", "command": cmd}]})
os.makedirs(os.path.dirname(path), exist_ok=True)
with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2); f.write("\n")
print("  登録した:", cmd)
PY
fi

say ""
say "完了。次に新しいClaude Codeセッションを開くと、藤原人格と文体ナレッジが最初から読み込まれた状態で始まる。"
say "確認: bash '${SKILL_DST}/scripts/session-start.sh' | head -20"
