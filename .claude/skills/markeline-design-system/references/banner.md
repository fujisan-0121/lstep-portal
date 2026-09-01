# バナー / OGP / LINE 画像 / SNS / サムネイル

土台は `templates/banner.html`。`<section class="canvas" data-preset="ogp">` の `data-preset` を変えるだけで寸法が切り替わる。
書き出しは `python3 scripts/render_preview.py banner.html --preset ogp --each .canvas`（PNG）。文字入り画像も HTML テキストで組み、画像生成 AI に文字を描かせない。

## 寸法プリセット（tokens.json > canvas_presets_px）

| プリセット | px | 用途 | 安全域 |
|---|---|---|---|
| `ogp` | 1200×630 | LP・記事の OGP | 外周 60px。中央 1200×600 が X で切れない範囲 |
| `line_rich_menu_large` | 2500×1686 | LINE リッチメニュー 大 | セル境界 4px |
| `line_rich_menu_compact` | 2500×843 | 同 小 | |
| `line_profile_icon` | 640×640 | プロフィール | 円形マスク前提。ロゴのシンボル部が中央 60% に収まるよう PNG を 1.35 倍で配置 |
| `line_card_message_square` / `_3_2` | 1040×1040 / 1040×693 | カードタイプメッセージ | 下 20% にテキストが重なる場合あり |
| `instagram_square` / `_portrait` / `_story` | 1080×1080 / 1080×1350 / 1080×1920 | SNS | story は上下 250px を空ける |
| `youtube_thumbnail` | 1280×720 | 動画サムネ | 右下 時間表示を避け 200×60 空ける |
| `x_header` | 1500×500 | X ヘッダー | 左下 400×400 にアイコンが重なる |

## 構図の型

- **A ダーク**: `teal-900` 全面、キャッチ paper 900、強調 1 語 `brand-yellow`、白版ロゴ。OGP・サムネの標準。
- **B ライト**: `paper` or `teal-50` 全面、キャッチ ink 900、カラーロゴ、CTA 帯 `brand-yellow`（下辺 15%）。カードメッセージ・SNS 告知。
- **C 分割**: 左 60% 写真（`radius 0`）、右 40% `teal-900` 面にテキスト。事例告知・登壇告知。

キャッチは短辺の 8〜12%、2 行まで。サブは短辺の 4%。`word-break: keep-all` で意味の切れ目で改行。

## リッチメニュー（6 分割）

- 3×2 グリッド、セル背景 `paper`、境界 `line` 4px（`bg` でも可）。
- 各セル: アイコン（`brand-teal` 単色、セル高さの 28%）+ ラベル（ink 900、セル高さの 11%）+ 補足（sub、6%）。
- 目立たせたい 1 セル（クーポン・予約など）だけ `brand-yellow` 面 + ink 文字。2 セル黄は不可。
- タップ領域の誤認を防ぐため、セル内に線・枠を増やさない。
- 書き出し後、LINE の圧縮で 1MB 以内になるよう PNG→JPEG 品質 85 を確認。

## 禁止

- 写真の上に直接文字。`teal-900` の不透明帯（`rgba(0,42,44,.85)` まで可）。
- 黄色文字を白地・写真の上に置く。黄色文字はダーク面のみ。
- 3 色以上のアクセント、ネオン、グラデーション、ドロップシャドウ文字、縁取り文字。
- ロゴを画像の 1/3 以上の面積にする（ロゴはサインであって主役ではない）。
- 「無料」「今だけ」「限定」「激安」の大書き。ブランドボイスに反する。

## PIL で直接描く場合

```python
import sys; sys.path.insert(0, '.claude/skills/markeline-design-system/tokens')
from tokens import RGB
from PIL import Image, ImageDraw, ImageFont
W,H = 1200,630
im = Image.new('RGB',(W,H),RGB['teal-900'])
d = ImageDraw.Draw(im)
font = ImageFont.truetype('ZenKakuGothicNew-Black.ttf', 64)  # フォントファイルは Google Fonts から取得して同梱
d.text((80,220),'LINE公式を、\n成果が出る仕組みに。',font=font,fill=RGB['paper'])
logo = Image.open('.claude/skills/markeline-design-system/assets/markeline_logo_white.png').convert('RGBA')
logo.thumbnail((225,160)); im.paste(logo,(W-225-60,H-160-40),logo)
im.save('ogp.png')
```
