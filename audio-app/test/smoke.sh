#!/usr/bin/env bash
# ローカル (wrangler dev) に対する API のスモークテスト
# 事前: npm run db:migrate:local && npm run dev（.dev.vars に DEV_USER_EMAIL / ADMIN_EMAILS を設定）
set -euo pipefail
BASE="${BASE:-http://127.0.0.1:8787}"
ADMIN_HDR="X-Dev-User: ${ADMIN_EMAIL:-fujiwara@example.co.jp}"
MEMBER_HDR="X-Dev-User: member@example.co.jp"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

pass() { echo "  ok   $1"; }
fail() { echo "  FAIL $1"; exit 1; }
json() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const o=JSON.parse(s);console.log(eval("o"+process.argv[1]))})' "$1"; }

echo "1. 認証と権限"
me=$(curl -sf -H "$ADMIN_HDR" "$BASE/api/me")
[ "$(echo "$me" | json .isAdmin)" = "true" ] && pass "管理者として認識" || fail "管理者判定 $me"
me2=$(curl -sf -H "$MEMBER_HDR" "$BASE/api/me")
[ "$(echo "$me2" | json .isAdmin)" = "false" ] && pass "一般メンバーとして認識" || fail "メンバー判定 $me2"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$MEMBER_HDR" "$BASE/api/admin/stats")
[ "$code" = "403" ] && pass "一般メンバーは管理APIに入れない (403)" || fail "管理API保護 $code"

echo "2. カテゴリー"
cats=$(curl -sf -H "$ADMIN_HDR" "$BASE/api/categories")
cat_id=$(echo "$cats" | json '.categories[0].id')
[ -n "$cat_id" ] && pass "初期カテゴリーあり (id=$cat_id)" || fail "カテゴリー $cats"

echo "3. エピソード作成 → 音声アップロード → 公開"
ep=$(curl -sf -H "$ADMIN_HDR" -H 'Content-Type: application/json' -d "{\"title\":\"スモークテスト配信\",\"description\":\"説明\",\"category_id\":$cat_id}" "$BASE/api/admin/episodes")
ep_id=$(echo "$ep" | json .id)
[ -n "$ep_id" ] && pass "作成 (id=$ep_id)" || fail "作成 $ep"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$ADMIN_HDR" -H 'Content-Type: application/json' -X PUT -d '{"title":"x","status":"published"}' "$BASE/api/admin/episodes/$ep_id")
[ "$code" = "400" ] && pass "音声なしでは公開できない (400)" || fail "音声なし公開 $code"
# 1秒のWAVを生成
node -e '
const rate=8000,n=rate*1,b=Buffer.alloc(44+n*2);
b.write("RIFF",0);b.writeUInt32LE(36+n*2,4);b.write("WAVE",8);b.write("fmt ",12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write("data",36);b.writeUInt32LE(n*2,40);
for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(i/rate*2*Math.PI*440)*8000),44+i*2);
require("fs").writeFileSync(process.argv[1],b)' "$TMP/a.wav"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$ADMIN_HDR" -H 'Content-Type: text/plain' -X PUT --data-binary "@$TMP/a.wav" "$BASE/api/admin/episodes/$ep_id/audio")
[ "$code" = "415" ] && pass "音声以外の形式は拒否 (415)" || fail "形式チェック $code"
up=$(curl -sf -H "$ADMIN_HDR" -H 'Content-Type: audio/wav' -H 'X-Audio-Duration: 1' -X PUT --data-binary "@$TMP/a.wav" "$BASE/api/admin/episodes/$ep_id/audio")
[ "$(echo "$up" | json .size)" = "16044" ] && pass "アップロード (16044 bytes)" || fail "アップロード $up"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$MEMBER_HDR" "$BASE/api/episodes/$ep_id")
[ "$code" = "404" ] && pass "下書きは一般メンバーに見えない (404)" || fail "下書き非表示 $code"
pub=$(curl -sf -H "$ADMIN_HDR" -H 'Content-Type: application/json' -X PUT -d "{\"title\":\"スモークテスト配信\",\"description\":\"説明\",\"category_id\":$cat_id,\"status\":\"published\"}" "$BASE/api/admin/episodes/$ep_id")
[ "$(echo "$pub" | json .status)" = "published" ] && pass "公開" || fail "公開 $pub"

echo "4. 配信（Range 対応）"
hdr=$(curl -s -D - -o "$TMP/full.wav" -H "$MEMBER_HDR" "$BASE/api/episodes/$ep_id/audio")
echo "$hdr" | grep -qi '^accept-ranges: bytes' && pass "Accept-Ranges" || fail "Accept-Ranges ヘッダーなし"
cmp -s "$TMP/full.wav" "$TMP/a.wav" && pass "全体ダウンロードが一致" || fail "内容不一致"
hdr=$(curl -s -D - -o "$TMP/part.bin" -H "$MEMBER_HDR" -H 'Range: bytes=100-199' "$BASE/api/episodes/$ep_id/audio")
echo "$hdr" | grep -q ' 206' && echo "$hdr" | grep -qi 'content-range: bytes 100-199/16044' && [ "$(stat -c %s "$TMP/part.bin")" = "100" ] && pass "Range 100-199 → 206 / 100 bytes" || fail "Range: $hdr"

echo "5. 再生履歴（誰がどこまで聴いたか）"
curl -sf -H "$MEMBER_HDR" -H 'Content-Type: application/json' -d '{"position":0.3,"duration":1,"started":true}' "$BASE/api/episodes/$ep_id/progress" >/dev/null
r=$(curl -sf -H "$MEMBER_HDR" -H 'Content-Type: application/json' -d '{"position":0.95,"duration":1,"started":false}' "$BASE/api/episodes/$ep_id/progress")
[ "$(echo "$r" | json .completed)" = "true" ] && pass "90% 以上で聴了" || fail "聴了判定 $r"
lst=$(curl -sf -H "$ADMIN_HDR" "$BASE/api/admin/episodes/$ep_id/listeners")
done_n=$(echo "$lst" | json '.listeners.filter(l=>l.completed===1).length')
none_n=$(echo "$lst" | json '.listeners.filter(l=>l.last_played_at===null).length')
[ "$done_n" = "1" ] && [ "$none_n" -ge 1 ] && pass "管理者から見える: 聴了 1 人、未再生 $none_n 人" || fail "視聴状況 $lst"
[ "$(echo "$lst" | json '.listeners.find(l=>l.completed===1).play_count')" = "1" ] && pass "再生回数 1" || fail "再生回数"

echo "6. コメント"
cm=$(curl -sf -H "$MEMBER_HDR" -H 'Content-Type: application/json' -d '{"body":"勉強になりました"}' "$BASE/api/episodes/$ep_id/comments")
cm_id=$(echo "$cm" | json .comment.id)
[ -n "$cm_id" ] && pass "投稿 (id=$cm_id)" || fail "投稿 $cm"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Dev-User: other@example.co.jp" -X DELETE "$BASE/api/comments/$cm_id")
[ "$code" = "403" ] && pass "他人のコメントは消せない (403)" || fail "コメント保護 $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$ADMIN_HDR" -X DELETE "$BASE/api/comments/$cm_id")
[ "$code" = "200" ] && pass "管理者は削除できる" || fail "管理者削除 $code"
d=$(curl -sf -H "$MEMBER_HDR" "$BASE/api/episodes/$ep_id")
[ "$(echo "$d" | json '.comments.length')" = "0" ] && pass "削除後は一覧に出ない" || fail "削除反映 $d"

echo "7. 集計と CSV"
st=$(curl -sf -H "$ADMIN_HDR" "$BASE/api/admin/stats")
[ "$(echo "$st" | json ".episodes.find(e=>e.id===$ep_id).completed_count")" = "1" ] && pass "stats の聴了数" || fail "stats $st"
csv=$(curl -sf -H "$ADMIN_HDR" "$BASE/api/admin/export.csv")
echo "$csv" | grep -q 'member@example.co.jp,100,1,1' && pass "CSV に進捗 100% / 聴了 1 の行" || fail "CSV: $csv"

echo "8. 後片付け"
curl -sf -H "$ADMIN_HDR" -X DELETE "$BASE/api/admin/episodes/$ep_id" >/dev/null && pass "削除"
code=$(curl -s -o /dev/null -w '%{http_code}' -H "$MEMBER_HDR" "$BASE/api/episodes/$ep_id/audio")
[ "$code" = "404" ] && pass "削除後は音声も 404" || fail "削除後 $code"
echo "すべて通過"
