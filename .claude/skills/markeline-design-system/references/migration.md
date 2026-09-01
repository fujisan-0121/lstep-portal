# 旧トークンからの移行

design_skill v0（2026-06）と、それで作られた社内 pptx・HTML は `#149A9B` 系の近似値を使っている。
既存物を触るときは、その成果物内の色を **全部** 置換する。半分だけ直すと 2 種類のティールが同居して最悪になる。

## 置換表

| 旧 | 新トークン | CSS 変数 |
|---|---|---|
| `#149A9B` | `brand-teal` `#00979C` | `--ml-brand-teal` |
| `#0B6B6F` | `teal-700` `#006A6D` | `--ml-teal-700` |
| `#0A3B40` | `teal-800` `#004C4E`（面）/ `teal-900` `#002A2C`（最濃面） | `--ml-teal-800` / `--ml-teal-900` |
| `#E4F2F2` | `teal-100` `#D6EEEF` | `--ml-teal-100` |
| `#F5B501` | `brand-yellow` `#F9BB00` | `--ml-brand-yellow` |
| `#D99E00` | `yellow-600` `#D9A300` | `--ml-yellow-600` |
| `#FEF4D6` | `yellow-50` `#FEF8E6` | `--ml-yellow-50` |
| `#15282B` | `ink` `#1C2122` | `--ml-ink` |
| `#5C7376` | `sub` `#657A7B` | `--ml-sub` |
| `#D6E5E5` | `line` `#DDE3E3` | `--ml-line` |
| `#F2F7F7` | `bg` `#F4F6F6` | `--ml-bg` |
| `#FBFEFE` | `paper` `#FFFFFF` | `--ml-paper` |
| `#9AA0A6`（pptx のグレー） | `sub` か `muted`（文字なら `sub`） | |
| `#3D3520`（黄タグの文字） | `ink` | `--ml-ink` |
| `#459c9c` / `#f7bd47` / `#565656` / `#202124` / `#e9e9e9` / `#9a9a9a`（セミナースライド） | `brand-teal` / `brand-yellow` / `sub` / `ink` / `line` / `muted` | |

## 手順

```bash
# 1. 何が混ざっているか見る
python3 scripts/lint_tokens.py old_deck.pptx
# 2. HTML/CSS は sed で一括（大文字小文字両方）
sed -i -E 's/#149A9B/#00979C/Ig; s/#F5B501/#F9BB00/Ig; s/#0B6B6F/#006A6D/Ig; s/#0A3B40/#004C4E/Ig; s/#E4F2F2/#D6EEEF/Ig; s/#D99E00/#D9A300/Ig; s/#FEF4D6/#FEF8E6/Ig; s/#15282B/#1C2122/Ig; s/#5C7376/#657A7B/Ig; s/#D6E5E5/#DDE3E3/Ig; s/#F2F7F7/#F4F6F6/Ig; s/#FBFEFE/#FFFFFF/Ig' file.html
# 3. pptx は zip 内 XML を同様に置換（python-pptx で開いて保存し直すか、unzip → sed → zip）
# 4. 再 lint
python3 scripts/lint_tokens.py --strict file.html
```

置換後は必ず `tokens/contrast.md` で文字色ペアを再確認する。旧 `#0B6B6F` を本文に使っていた箇所は `teal-700` でそのまま通るが、
旧 `#149A9B` を 16px の文字に使っていた箇所は新 `brand-teal` でも不合格なので `teal-600` に変える。
