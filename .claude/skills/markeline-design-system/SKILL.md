---
name: markeline-design-system
description: 株式会社MARKELINE（マーケライン）のブランドデザインシステム。LP・HP・スライド・提案書・バナー・OGP・LINEリッチメニュー・サムネイル・PDF・docx・pptx・xlsx・インフォグラフィック・図版など、MARKELINE名義で出るあらゆるビジュアル成果物を作る前に必ず読む。色・フォント・余白・ロゴ扱いをここの tokens/ だけから参照し、目分量やHPの見た目からの近似を禁止する。「マーケライン」「MARKELINE」「Lステップ」「自社の資料」「うちのブランドで」「弊社LP」「提案書」「セミナースライド」「バナー作って」「リッチメニュー」「サムネ」「ティールと黄色」など、MARKELINEの成果物だと少しでも読める依頼では、明示的に別ブランドが指定されない限りこのスキルを使う。クライアント案件でも、MARKELINEのロゴ・社名・提案テンプレが載る成果物なら対象。
---

# MARKELINE デザインシステム

このスキルの仕事は一つだけ。MARKELINE のビジュアル成果物の色・フォント・余白・ロゴを、
**`tokens/tokens.json` に書かれた値だけ**で組み、それ以外の値を一切混ぜないこと。

## なぜトークンしか使ってはいけないか

ロゴのマスターデータ（Illustrator）を実測すると、ブランド色は正確に 2 色しかない。

| 役割 | 名前 | HEX | RGB | CMYK | 出所 |
|---|---|---|---|---|---|
| 主役 | `brand-teal` | `#00979C` | 0,151,156 | 85·8·39·10 | logo_color.ai の塗り値をそのまま読み出し |
| アクション | `brand-yellow` | `#F9BB00` | 249,187,0 | 0·32·100·0 | 同上 |

過去の社内スライドはこれを `#149A9B`／`#F5B501`、別のスライドは `#459c9c`／`#f7bd47` と「だいたい」で写していた。
どれも実色から数段階ずれていて、並べると別ブランドに見える。これを二度と起こさないために、
派生色（淡面・濃面・ニュートラル）もすべて `tokens.json` に**計算レシピ付き**で定義し、
`scripts/build_tokens.py` がレシピと HEX の整合を検証する。人が値を「感覚で」足す余地を残さない。

出所の全記録は `references/provenance.md`。値を疑ったらそこを見る。

## 使い方（毎回この順で）

1. **出力形式を決めて、対応するリファレンスを読む**（下表）。SKILL.md だけで作り始めない。
2. **トークンを読み込む**。HTML/CSS なら `tokens/tokens.css` を `<link>` か inline、Tailwind なら `tokens/tailwind.preset.cjs`、
   python-pptx / python-docx / openpyxl / PIL なら `tokens/tokens.py` を import。値を手打ちしない。
3. **色の組み合わせは `tokens/contrast.md` の「Approved text pairs」からしか選ばない。**
   白地の本文にティールを使うなら `teal-600` 以上、`brand-teal` そのものは 24px 以上の見出しか面にしか使えない（3.56:1）。
   黄色は白地の文字に絶対に使えない（1.73:1）。黄色は「面」か「ダーク面の上の文字」。
4. **作ったら lint を通す**。`python3 scripts/lint_tokens.py --strict <出力ファイルかフォルダ>` がゼロ件になるまで直す。
   pptx / docx / xlsx も検査できる。
5. HTML 成果物は `python3 scripts/render_preview.py <html> --preset slide_16_9` 等でスクリーンショットを撮り、目で確認する。

| 作るもの | 読むファイル | 使うテンプレート |
|---|---|---|
| LP / HP / 1ページサイト / HTML メール | `references/lp.md` | `templates/lp.html` |
| スライド / 提案書 / セミナー資料 / インフォグラフィック（HTML→PDF, pptx） | `references/slides.md` | `templates/slide.html` |
| バナー / OGP / LINE リッチメニュー / カードメッセージ / SNS 画像 / サムネ | `references/banner.md` | `templates/banner.html` |
| docx / xlsx / PDF 帳票 / 見積書 / 契約書体裁 | `references/documents.md` | tokens.py |
| ロゴを置く場面すべて | `references/logo.md` | assets/ |
| マスコット（マーケラトプス）を使う | `references/mascot.md` | assets/ |
| 旧トークン（#149A9B 系）で作られた既存物の更新 | `references/migration.md` | scripts/lint_tokens.py |
| 色の考え方・チャート配色 | `references/color.md`, `tokens/contrast.md` | |
| 文字の組み方 | `references/typography.md` | |

## 鉄則（短縮版。各リファレンスで詳述）

**色**
- ティール = 主役・面・信頼。イエロー = 1 成果物につき「最重要の一点」だけ（CTA ボタン、結論の下線、KPI の一つ）。
  イエローの面積が画面の 5% を超えたら安売り感が出る。減らす。
- 白地の文字は `ink`（標準）、`sub`（補助）、`teal-600`/`teal-700`（ブランド文字）の 4 つだけ。`muted` は文字に使わない。
- `brand-teal` を文字やアイコン内の数字に使えるのは 24px 以上、または 19px 以上の太字（700）だけ。カードの番号バッジやアイコンの丸の中の小さな数字は、つい `brand-teal` にしたくなるが 16px では 3.56:1 で不合格。バッジの文字は `teal-700` にするか、テンプレートどおり mono 700 / 20px にする。
- ダーク面は `teal-900`/`teal-800`/`ink`。その上の文字は `paper`、強調は `brand-yellow`（9.41:1）。
- グレーは全部ティール相（`ink` `sub` `muted` `line` `bg`）。純グレー `#888` `#ccc` `#f5f5f5` を持ち込まない。
- 赤は `danger` 1 色。緑は作らない（成功もティール）。青・紫・ピンクはブランドに存在しない。

**フォント**
- 和文と本文は `Zen Kaku Gothic New`。見出し 900、本文 400/500、強調 700。
- 数値・KPI・日付・ページ番号・ラベルキャップスは `IBM Plex Mono`。**mono の中に漢字かなを入れない**（システムの等幅にフォールバックして崩れる）。
- サイズは `12/14/16/18/20/24/30/36/48/64` から。行間は本文 1.6 以上、見出し 1.2〜1.4。
- Google Fonts を使う場合は `tokens.json > typography.google_fonts_url` の URL を使う。600/800 ウェイトは存在しないので指定しない。

**余白・形**
- 4pt リズム：`4/8/12/16/20/24/32/40/48/64/80/96/128`。不揃いな 15px や 25px を作らない。
- 角丸は `4`（小要素）と `8`（カード）が標準。`16` はヒーローの写真枠だけ。ボタンは `pill`（999）か `4`。混在させない。
- 罫線は `line` 1px。強調枠は `brand-teal` 4px の上辺（`border-top`）。影は `shadow.sm/md/lg` の 3 種のみ。

**ロゴ**
- `assets/markeline_logo_color.png`（白系背景用）と `assets/markeline_logo_white.png`（ダーク面用）の 2 つしか使わない。
  文字を打ってロゴを「再現」しない。色を変えない。比率を変えない。
- カラーロゴを `brand-yellow` や `brand-teal` の面に置かない（片側の文字が消える）。
- PNG には四周に約 27% の透明余白が入っている。これがクリアスペース。ロゴの外周に他要素を寄せない。
- 最小幅：デジタル 120px、印刷 25mm。余白込みの PNG なので、ヘッダーなら高さ 64px、スライドフッターなら 44px を取る。
- Google Fonts に到達できない環境（サンドボックス等）ではフォールバック書体で描画される。最終確認は必ずフォントが読める環境で行う。

**コピー・数値**（`references/provenance.md` の brand voice 準拠）
- 未確認の実績数値・成果 % を作らない。クライアント名は掲載許可を確認する前提で書く。
- 補助金・助成金は「活用できる可能性がある」「要確認」と表現する。煽り・安売り・上から目線を避ける。

## 品質ゲート（出力前チェック）

- [ ] `lint_tokens.py --strict` が 0 件
- [ ] すべての文字色/背景色ペアが `tokens/contrast.md` の Approved 内
- [ ] イエローの使用箇所が 1 成果物あたり 1 種類の役割（CTA か強調のどちらか）に収まっている
- [ ] mono の中に和文が入っていない
- [ ] 余白が 4pt スケール、角丸が `4/8` 中心
- [ ] ロゴは公式 PNG、クリアスペース確保、禁止背景に置いていない
- [ ] 未確認の数値・断定表現がない
- [ ] （HTML）`render_preview.py` のスクリーンショットを実際に見て崩れがない

## このスキルが「知らない」こと（正直に）

- **コーポレートサイト（https://www.lstepoffcial.com/）の CSS は未検証。** 作成時のセッションはネットワークポリシーでサイトに到達できなかった。
  ロゴのマスターデータのほうがサイトより上位の一次ソースなので値は変わらないはずだが、サイト側が旧近似値を使っている可能性はある。
  到達できる環境で `python3 scripts/extract_site_tokens.py https://www.lstepoffcial.com/` を実行し、結果を `references/provenance.md` に追記すること。
  差分があればサイトを直すのが筋で、トークンを寄せてはいけない。
- ロゴのワードマーク書体名（丸ゴシック系欧文）は特定していない。だからこそロゴは画像でしか置かない。
