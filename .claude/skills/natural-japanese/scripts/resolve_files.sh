#!/usr/bin/env bash
# 文体ナレッジと藤原人格のファイルパスを解決する。
#
# 解決順序:
#   1. 環境変数 NATURAL_JAPANESE_STYLE_FILE / NATURAL_JAPANESE_PERSONA_FILE
#   2. ~/.config/claude-obsidian/natural-japanese.env（上の2変数を書いたファイル）
#   3. Obsidian保管庫の中を名前で探す。保管庫は OBSIDIAN_VAULT_PATH か
#      ~/.config/claude-obsidian/vault-path から取る（obsidian-auto-write と同じ約束）
#
# 出力: STYLE=<path> と PERSONA=<path> を1行ずつ（--json ならJSON）
# 終了コード: 0=両方決まった / 1=どちらかが見つからない / 2=候補が複数で決められない
#
# 見つからない、または複数あるときは、標準エラーに候補と次にやることを出す。
# 呼び出し側は、ユーザーに一度だけ聞いて natural-japanese.env に保存する。

set -uo pipefail

CONF_DIR="${HOME}/.config/claude-obsidian"
ENV_FILE="${CONF_DIR}/natural-japanese.env"
VAULT_FILE="${CONF_DIR}/vault-path"
JSON=0
[ "${1:-}" = "--json" ] && JSON=1

expand() { local p="$1"; p="${p/#\~/$HOME}"; printf '%s' "$p"; }

STYLE="$(expand "${NATURAL_JAPANESE_STYLE_FILE:-}")"
PERSONA="$(expand "${NATURAL_JAPANESE_PERSONA_FILE:-}")"

if { [ -z "$STYLE" ] || [ ! -f "$STYLE" ]; } || { [ -z "$PERSONA" ] || [ ! -f "$PERSONA" ]; }; then
  if [ -f "$ENV_FILE" ]; then
    # shellcheck disable=SC1090
    set -a; . "$ENV_FILE"; set +a
    [ -z "$STYLE" ] || [ ! -f "$STYLE" ] && STYLE="$(expand "${NATURAL_JAPANESE_STYLE_FILE:-}")"
    [ -z "$PERSONA" ] || [ ! -f "$PERSONA" ] && PERSONA="$(expand "${NATURAL_JAPANESE_PERSONA_FILE:-}")"
  fi
fi

VAULT="$(expand "${OBSIDIAN_VAULT_PATH:-}")"
if [ -z "$VAULT" ] || [ ! -d "$VAULT" ]; then
  if [ -f "$VAULT_FILE" ]; then
    VAULT="$(expand "$(head -n 1 "$VAULT_FILE" | tr -d '[:space:]')")"
  fi
fi

find_candidates() {
  # $1: ファイル名（フォルダ名は見ない）に含まれる語を | で区切ったもの
  [ -d "$VAULT" ] || return 0
  find "$VAULT" -type f -name "*.md" \
    -not -path "*/.git/*" -not -path "*/node_modules/*" -not -path "*/.trash/*" -not -path "*/.obsidian/*" 2>/dev/null \
    | awk -F/ -v pat="$1" 'tolower($NF) ~ tolower(pat)' | sort
}

pick() {
  # $1: 候補リスト  $2: 名前そのものを優先する語
  # 候補が1件ならそれ。複数でも「優先語」をファイル名に含むものが1件だけならそれ。
  local cands="$1" exact="$2" n
  n="$(printf '%s\n' "$cands" | grep -c .)"
  if [ "$n" -eq 1 ]; then printf '%s' "$cands"; return; fi
  if [ "$n" -gt 1 ]; then
    local hit; hit="$(printf '%s\n' "$cands" | grep -F "/$exact" | grep -E "/${exact}[^/]*\.md$")"
    if [ "$(printf '%s\n' "$hit" | grep -c .)" -eq 1 ]; then printf '%s' "$hit"; return; fi
  fi
  printf ''
}

STYLE_CANDS=""
PERSONA_CANDS=""
if [ -z "$STYLE" ] || [ ! -f "$STYLE" ]; then
  STYLE_CANDS="$(find_candidates '文体|書き方|ライティング|style-?guide|writing-?style')"
  STYLE="$(pick "$STYLE_CANDS" '文体ナレッジ')"
fi
if [ -z "$PERSONA" ] || [ ! -f "$PERSONA" ]; then
  PERSONA_CANDS="$(find_candidates '藤原人格|人格|persona|ペルソナ|fujiwara')"
  PERSONA="$(pick "$PERSONA_CANDS" '藤原人格')"
fi

# 保管庫に触れない環境（クラウドの隔離セッションなど）では、スキルに同梱した雛形を代わりに使う。
# 雛形は保管庫の本物より古い可能性があるので、使ったことが分かるように FALLBACK=1 を出す。
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATES="$HERE/../assets/templates"
FALLBACK=0
if [ "${NATURAL_JAPANESE_NO_FALLBACK:-0}" != "1" ]; then
  if { [ -z "$STYLE" ] || [ ! -f "$STYLE" ]; } && [ -z "$STYLE_CANDS" ] && [ -f "$TEMPLATES/文体ナレッジ.md" ]; then
    STYLE="$TEMPLATES/文体ナレッジ.md"; FALLBACK=1
  fi
  if { [ -z "$PERSONA" ] || [ ! -f "$PERSONA" ]; } && [ -z "$PERSONA_CANDS" ] && [ -f "$TEMPLATES/藤原人格.md" ]; then
    PERSONA="$TEMPLATES/藤原人格.md"; FALLBACK=1
  fi
fi
[ $FALLBACK -eq 1 ] && echo "保管庫のファイルが見つからないので、スキル同梱の雛形（assets/templates）を使う。保管庫側で更新した内容は反映されていない可能性がある。" >&2

rc=0
report() {
  local label="$1" val="$2" cands="$3"
  if [ -n "$val" ] && [ -f "$val" ]; then return; fi
  local n; n="$(printf '%s\n' "$cands" | grep -c .)"
  if [ "$n" -gt 1 ]; then
    echo "${label}: 候補が${n}件あって決められない。どれか1つをユーザーに聞く:" >&2
    printf '%s\n' "$cands" | sed 's/^/  - /' >&2
    [ $rc -lt 2 ] && rc=2
  else
    echo "${label}: 見つからない。" >&2
    if [ ! -d "$VAULT" ]; then
      echo "  保管庫の場所も未設定。OBSIDIAN_VAULT_PATH か ${VAULT_FILE} に保管庫の絶対パスを入れる。" >&2
    else
      echo "  保管庫 ${VAULT} の中に該当する名前のmdが無い。ユーザーにパスを聞く。" >&2
    fi
    [ $rc -lt 1 ] && rc=1
  fi
}
report "文体ナレッジ" "$STYLE" "$STYLE_CANDS"
report "藤原人格" "$PERSONA" "$PERSONA_CANDS"

if [ $rc -ne 0 ]; then
  echo "決まったら次の2行を ${ENV_FILE} に書く（インストーラーなら bash scripts/install.sh が書く）:" >&2
  echo "  NATURAL_JAPANESE_STYLE_FILE=/絶対パス/文体ナレッジ.md" >&2
  echo "  NATURAL_JAPANESE_PERSONA_FILE=/絶対パス/藤原人格.md" >&2
fi

if [ $JSON -eq 1 ]; then
  printf '{"style": "%s", "persona": "%s", "vault": "%s", "fallback": %d, "status": %d}\n' "$STYLE" "$PERSONA" "$VAULT" "$FALLBACK" "$rc"
else
  echo "STYLE=${STYLE}"
  echo "PERSONA=${PERSONA}"
  echo "FALLBACK=${FALLBACK}"
fi
exit $rc
