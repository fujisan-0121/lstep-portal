# 出所（Provenance）

このファイルは「その値はどこから来たのか」を全部書く台帳。値を変えるときは必ずここも更新する。
作成日 2026-09-01。作成セッションの制約: コーポレートサイトへの HTTPS が egress ポリシーで遮断されていた（403）。

## 1. 一次ソース（優先順）

| 優先 | ソース | 場所 | 何が取れたか |
|---|---|---|---|
| 1 | `logo_color.ai`（Illustrator RGB ドキュメント, 2023-03-16） | Google Drive `画像・ロゴ・マスコット/MarkLine_logo_ロゴ/ai_data/` | 塗り値 `0 0.594 0.611 scn` = rgb(0,151,156) = `#00979C`、`0.978 0.732 0 scn` = rgb(249,187,0) = `#F9BB00` |
| 1 | `MarkLine_logo_data.pdf`（同デザイナー納品, CMYK ドキュメント） | 同フォルダ | 塗り値 `0.85 0.08 0.39 0.1 k`（ティール）、`0 0.32 1 0 k`（イエロー）、`0 0 0 1 k`（黒版）、`0 0 0 0 k`（白版） |
| 1 | `logo_color.png` 2250×1600 透明背景 | 同フォルダ、および `MARKELINE_Codex_Context/assets/` | 不透明ピクセルは 2 色のみ: `#F9BB00` 256,974px / `#00979C` 176,356px。アートワーク bbox (300,271)-(1950,1330) = 1650×1059 |
| 1 | `logo_white.png` | 同フォルダ | 不透明ピクセルは `#FFFFFF` のみ。bbox 同一 |
| 2 | `mt1.png`〜`mt6.png`（マスコット「マーケラトプス」, 2021-12） | `画像・ロゴ・マスコット/マーケラトプス/` | 最頻 6 色を `color.mascot` として実測登録 |
| 3 | `MARKELINE_Codex_Context/design_skill/SKILL.md`（design_skill v0, 2026-06） | Google Drive | フォント選定（Zen Kaku Gothic New / IBM Plex Mono / Poppins）、4pt スペーシング、コンポーネント規則、danger 色 `#D8472B` |
| 3 | `業務委託を戦力にする組織のつくりかた_MARKELINE_編集可能版.pptx`（48 枚, 2026-08） | Google Drive | design_skill v0 のトークンが実運用されている証拠（`149A9B`×249, `15282B`×191, `0A3B40`×136, `F5B501`×58 …） |
| 3 | `MARKELINE_Codex_Context/05_brand_voice.md`, `08_web_lp_assets.md`, `99_do_not_do.md` | Google Drive | トーン、ロゴ説明（MARKE=イエロー / LINE=ティール）、禁止事項 |
| 4 | `seminar_closing_slides_markeline_style/index.html`（2026-04〜） | Google Drive | 別系統の近似値 `#459c9c` / `#f7bd47`。**採用しない**（記録のみ） |
| 4 | Notion「MARKELINEデータベース」議事録 | Notion | 「マーケラインのロゴと色合い（オレンジ色と緑）」という口頭表現。色名の曖昧さの証拠として記録 |
| 未 | https://www.lstepoffcial.com/ | Web | **未取得**。`scripts/extract_site_tokens.py` で要検証 |

### 一次ソースの読み出し方法（再現可能）

```bash
# PNG の不透明ピクセルの色分布
python3 -c "from PIL import Image;from collections import Counter;im=Image.open('logo_color.png').convert('RGBA');print(Counter(p[:3] for p in im.get_flattened_data() if p[3]==255).most_common(3))"
# AI / PDF の塗り値（Flate 展開後の scn / k オペレータ）
python3 - <<'EOF'
import re,zlib
for f in ['logo_color.ai','MarkLine_logo_data.pdf']:
    d=open(f,'rb').read()
    for m in re.finditer(rb'stream[\r\n]+(.*?)[\r\n]+endstream',d,re.S):
        try: s=zlib.decompress(m.group(1))
        except Exception: continue
        print(f, set(re.findall(rb'((?:-?[\d.]+\s+){3,4})(?:scn|k)\b',s)))
EOF
```

## 2. ブランド原色の確定値

| トークン | HEX | RGB | CMYK | 一致確認 |
|---|---|---|---|---|
| brand-teal | `#00979C` | 0,151,156 | 85,8,39,10 | AI 塗り値 ⇔ PNG 実ピクセル 完全一致 |
| brand-yellow | `#F9BB00` | 249,187,0 | 0,32,100,0 | 同上 |
| brand-black | `#000000` | 0,0,0 | 0,0,0,100 | PDF 黒版 |
| brand-white | `#FFFFFF` | 255,255,255 | 0,0,0,0 | PNG 白版 |

CMYK は印刷入稿時にそのまま使う。RGB→CMYK を再計算しない（デザイナーが決めた掛け合わせが正）。

## 3. 派生色のレシピ

すべて `tokens.json` の `recipe` に記述し、`scripts/build_tokens.py` が検証する。

- ティール淡色 `teal-50..400`: `mix(brand-teal, #FFFFFF, t)` t = 0.92 / 0.84 / 0.64 / 0.44 / 0.22（sRGB 線形補間 = CSS `color-mix(in srgb, …)` と同値）
- ティール濃色 `teal-600..900`: `mix(brand-teal, #000000, t)` t = 0.15 / 0.30 / 0.50 / 0.72
- イエロー淡色 `yellow-50..200`: t = 0.90 / 0.80 / 0.60、濃色 `yellow-600/700`: t = 0.13 / 0.28
- ニュートラル: `hsl(183, 10%, L)` L = 12 (ink) / 44 (sub) / 62 (muted) / 88 (line) / 96 (bg)。183° はティールの色相（実測 181.9°）
- semantic: success = teal-600、warning = yellow-700、info = teal-700、danger = `#D8472B`（design_skill v0 由来の機能色。ブランド色ではないため据え置き）

濃色段階を t=0.15 から始めた理由: 白地で `brand-teal` は 3.56:1 しかなく本文に使えない。t=0.15 の `teal-600` で 4.74:1（AA）になり、これが白地に置ける最も明るいティール文字になる。

## 4. 旧トークンとの差分（採用しなかった値）

| 旧 | どこで使われていたか | 正 | 差 |
|---|---|---|---|
| `#149A9B` teal | design_skill v0、社内 pptx 48 枚 | `#00979C` | R +20 / G +3 / B −1。彩度が落ちて灰味 |
| `#0B6B6F` teal-deep | 同 | `teal-700 #006A6D` | ほぼ同等（レシピ化） |
| `#0A3B40` teal-ink | 同 | `teal-800 #004C4E` / `teal-900 #002A2C` | 旧は青寄り |
| `#E4F2F2` teal-mist | 同 | `teal-100 #D6EEEF` / `teal-50 #EBF7F7` | |
| `#F5B501` yellow | 同 | `#F9BB00` | R −4 / G −6。わずかに暗く赤寄り |
| `#D99E00` yellow-deep | 同 | `yellow-600 #D9A300` | |
| `#FEF4D6` yellow-mist | 同 | `yellow-50 #FEF8E6` | |
| `#15282B` ink / `#5C7376` sub / `#D6E5E5` line / `#F2F7F7` bg | 同 | `#1C2122` / `#657A7B` / `#DDE3E3` / `#F4F6F6` | 旧は青緑に寄りすぎ。新はティール相 10% で統一 |
| `#459c9c` / `#f7bd47` | セミナースライド | `#00979C` / `#F9BB00` | 大きくずれ（白を 25% 混ぜたような値） |
| `#FECE14` / `#000000` | typeui.sh professional 上流の既定 | 不使用 | ブランド不一致 |

移行手順は `migration.md`。

## 5. フォントの出所

`Zen Kaku Gothic New`（和文）、`IBM Plex Mono`（数値）、`Poppins`（任意欧文）は design_skill v0 の社内決定を継承。
根拠は「見出し 900 まで持つ和文ゴシックで Google Fonts から無償配布され、数値を等幅にする方針と噛み合う」こと。
コーポレートサイトの実フォントは未検証。`extract_site_tokens.py` の結果で異なる場合は、**サイト側かトークン側かのどちらを正とするかを人が決めてから**更新する。

## 6. 検証ログ

- 2026-09-01 `build_tokens.py`: 36 色すべてレシピ整合 OK。`lint_tokens.py tokens/tokens.css`: 0 件。
- 2026-09-01 サイト検証: 未実施（到達不可）。
