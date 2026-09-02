# docx / xlsx / PDF 帳票 / 見積書 / 契約書体裁

文書類はブランドを「主張」しない。ロゴとティールの罫線 1 本で識別できれば十分。黄色は原則使わない（合計行の `yellow-50` 面のみ許可）。

## 共通

- 本文フォント `Noto Sans JP`（無い環境は `Yu Gothic`）。数値・金額・日付は `IBM Plex Mono`（無ければ `Consolas`）。Calibri / Arial / MS 明朝を残さない。
- 本文 `ink` 10.5〜11pt、行間 1.6。見出し `teal-800` 14〜16pt 900。補足 `sub` 9pt。
- 罫線 `line` 0.5pt。見出し下に `brand-teal` 1.5pt。
- ヘッダー: 左 ロゴ（幅 30mm）、右 文書名 `sub` 9pt。フッター: `株式会社MARKELINE` + ページ番号 mono。
- 余白: 上下 20mm、左右 18mm。

## docx（python-docx）

```python
import sys; sys.path.insert(0, '.claude/skills/markeline-design-system/tokens')
from tokens import RGB, FONT_SANS, FONT_SANS_OFFICE_FALLBACK, FONT_MONO
from docx.shared import Pt, RGBColor, Mm
from docx.oxml.ns import qn
def style_run(run, name='ink', size=10.5, bold=False, mono=False):
    run.font.name = FONT_MONO if mono else FONT_SANS
    run._element.rPr.rFonts.set(qn('w:eastAsia'), FONT_SANS_OFFICE_FALLBACK if not mono else FONT_MONO)
    run.font.size = Pt(size); run.font.bold = bold; run.font.color.rgb = RGBColor(*RGB[name])
```

見積書: 表ヘッダ `teal-50` 面 + `teal-800` 文字、金額列 mono 右揃え、合計行 `yellow-50` 面 + ink 900。注記に「補助金・助成金は活用できる可能性があり、要件確認が必要です」。

## xlsx（openpyxl）

```python
from openpyxl.styles import PatternFill, Font, Border, Side
from tokens import HEX, FONT_SANS_OFFICE_FALLBACK, FONT_MONO
h = lambda n: HEX[n].lstrip('#')
head = PatternFill('solid', fgColor=h('teal-50')); head_font = Font(name=FONT_SANS_OFFICE_FALLBACK, bold=True, color=h('teal-800'))
num_font = Font(name=FONT_MONO, color=h('ink')); thin = Side(style='thin', color=h('line'))
total = PatternFill('solid', fgColor=h('yellow-50'))
```

条件付き書式の「悪化」は `danger`、「達成」は `teal-600`。緑赤の既定色を使わない。グラフは系列色を `brand-teal / teal-400 / teal-200 / sub` に設定。

## PDF

HTML→PDF（`references/slides.md` の手順）を標準にする。reportlab を使う場合も `tokens.py` の RGB を `Color(r/255,g/255,b/255)` で渡す。CMYK 入稿は `tokens.py > CMYK` の値をそのまま（RGB からの変換をしない）。

## 仕上げ

`python3 scripts/lint_tokens.py --strict 見積書.docx` で色とフォントを検査。既定テーマ色（`156082` `E97132` など）が残っていたら失敗。
