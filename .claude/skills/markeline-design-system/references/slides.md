# スライド / 提案書 / セミナー資料 / インフォグラフィック

土台は `templates/slide.html`（1920×1080、HTML→PDF 前提）。pptx を直接作る場合は `tokens/tokens.py` を python-pptx に渡す（末尾）。

## 1 枚の骨格

```
header  104px  : 左 ワードマーク（MARKE=yellow-600 / LINE=teal-700 のテキスト、または ロゴ PNG 高さ 56px）、右 資料名（sub 15px）+ 日付（mono 13px）。下罫 3px ink
content        : 左右パディング 88px、上下は中央寄せ、要素間 gap 32px
footer   64px  : 左 ロゴ PNG（高さ 44px。PNG は余白込みなので実アートは約 29px）+ 「株式会社MARKELINE ／ 社外秘」、右 ページ番号 mono「01 / 12」
```

ヘッダーのワードマークをテキストで組むのは**スライド内の識別用途に限る**（ロゴの代替ではない）。表紙と最終ページは必ずロゴ PNG。

## 型（1 枚 1 メッセージ）

| 型 | 用途 | 構成 |
|---|---|---|
| A 表紙 | 冒頭 | `teal-900` ダーク面。白版ロゴ左上、タイトル 64/900 paper、サブ 24/500 teal-100、日付 mono |
| B 主張 | 結論・問い | `paper`。eyebrow（mono 18 / caps / teal-600）→ 見出し 48〜56/900 → サブ 24/500 sub。本文は 2 行まで |
| C KPI | 実績・数値 | 3〜4 タイル。数値 mono 64/700 teal-700、単位 sans 24 sub、ラベル 20/700 ink。最重要 1 タイルだけ `yellow-50` 面 |
| D カード | 事例・3 本柱 | `card--accent`（上辺 4px brand-teal）×3。見出し 28/900、本文 20/500 sub |
| E 表 | 費用・比較 | th `teal-50` / teal-800 文字、td 罫 `line`、合計行 `yellow-50` |
| F 図解 | 仕組み・流れ | ボックス `teal-50` + `teal-700` 文字、矢印 `teal-400`、ゴール `brand-teal` 面 + paper 文字 |
| G 反転バナー | 締めの一言 | `teal-900` 帯（高さ 120px 程度）、文字 paper 28/700、強調語 `brand-yellow`。**1 資料に 1〜2 回** |
| H 最終 | CTA・連絡先 | `teal-900` 全面。白版ロゴ中央、CTA 文言、連絡先 mono |

A と H 以外でダーク全面を使わない。「派手にしたい」ときは余白を増やして文字を大きくする。

## サイズ（1920×1080 基準）

見出し 48〜64 / 本文 24〜30 / 注記 18〜20 / eyebrow 18 / KPI 64 / 表 20。1080p を A4 横で印刷するときは同じ CSS で `@page { size: 1920px 1080px }`。
文字は 18px 未満にしない（投影時に読めない）。

## 禁止

- 1 枚に 3 色以上のアクセント。ティール段階 + 黄 1 点 + ink が上限。
- 箇条書き 6 個以上。5 個を超えたら 2 枚に割る。
- 図の中の文字を画像化する。テキストは必ず HTML テキスト（検索・修正・翻訳できるように）。
- 小さな英語だけの飾りラベル（LAYER / API / DEBUG のような内部語）。eyebrow は日本語かセクション番号のみ。
- 写真の上に直接テキスト。`teal-900` 帯を敷く。

## HTML → PDF

```bash
python3 scripts/render_preview.py deck.html --preset slide_16_9 --each .slide   # 1 枚ずつ PNG
# PDF: Chromium の print（@media print が 1 枚 1 ページに割る）
python3 - <<'EOF'
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(); pg.goto('file:///ABS/PATH/deck.html'); pg.wait_for_load_state('networkidle')
    pg.pdf(path='deck.pdf', width='1920px', height='1080px', print_background=True, prefer_css_page_size=True); b.close()
EOF
```

## python-pptx で作る場合

```python
import sys; sys.path.insert(0, '.claude/skills/markeline-design-system/tokens')
from tokens import RGB, HEX, FONT_SANS, FONT_MONO, FONT_SANS_OFFICE_FALLBACK
from pptx.util import Pt, Inches
from pptx.dml.color import RGBColor

def fill(shape, name):            # 面
    shape.fill.solid(); shape.fill.fore_color.rgb = RGBColor(*RGB[name])
def text(run, name, size, bold=False, mono=False):
    run.font.name = FONT_MONO if mono else FONT_SANS
    run.font.size = Pt(size); run.font.bold = bold
    run.font.color.rgb = RGBColor(*RGB[name])
    # 和文フォールバックを eastAsia にも入れる
    rPr = run._r.get_or_add_rPr()
    from pptx.oxml.ns import qn
    ea = rPr.find(qn('a:ea')) or rPr.makeelement(qn('a:ea'), {}); ea.set('typeface', FONT_SANS_OFFICE_FALLBACK); rPr.append(ea)
```

スライドサイズは 13.333×7.5 in（16:9）。テーマ色（theme1.xml の accent1〜6）も `brand-teal / teal-400 / teal-200 / sub / brand-yellow / danger` に差し替え、グラフが既定の青オレンジにならないようにする。
仕上げに `python3 scripts/lint_tokens.py --strict deck.pptx`。
