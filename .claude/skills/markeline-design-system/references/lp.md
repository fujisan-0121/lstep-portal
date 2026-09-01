# LP / HP / 1 ページサイト

土台は `templates/lp.html`。コピーして中身を差し替える。CSS を書き足すときも値は `var(--ml-*)` のみ。

## 構成（08_web_lp_assets.md の想定セクションを固定順で）

1. ヘッダー: ロゴ（カラー版、PNG 高さ 64px）+ 右に CTA（`btn-primary`）。`paper`、下罫 `line`。sticky。
2. ファーストビュー: `teal-900` のダーク面。見出し 48/900 `paper`、サブコピー 18/500 `teal-100`、CTA `brand-yellow`。ロゴは白版。写真を使うなら右半分に `radius lg`、上に `teal-900` 帯は敷かない（写真自体を暗くしない）。
3. 課題提起: `bg`。3 つの「こんなお悩み」カード。アイコンは `brand-teal`。
4. MARKELINE ができること: `paper`。3〜4 カード（`card` + `border-top: 4px brand-teal`）。
5. LINE/Lステップを活用した解決策: 図解。フロー矢印は `teal-400`、ゴールだけ `brand-teal` 面。
6. 支援内容: 表 `table`。ヘッダ `teal-50`。
7. 料金目安: 3 プラン。推奨プランだけ `border: 2px brand-teal` + 「おすすめ」チップ（`yellow-500` 面 / `ink` 文字）。**ここで黄色を使うならヒーロー CTA と役割が同じ「行動を促す 1 点」に数える。プランの黄チップを使う場合は各セクションの CTA を `btn-secondary`（`teal-600` 枠）にする。**
8. 事例: ロゴ or 社名 + 数値。数値は mono。掲載許可未確認の社名は「製造業 A 社」等に置換し、注記に「事例は許可を得た範囲で掲載」。
9. 導入の流れ: 番号は mono、丸は `teal-50` 面 + `teal-700` 文字。
10. FAQ: `details/summary`。
11. クロージング CTA: `teal-900` ダーク面 2 回目は不可なので、`teal-50` 面に `brand-yellow` ボタン。
12. フッター: `ink` 面、白版ロゴ、会社情報 `teal-100` 文字 14px。

## レイアウト値

- コンテナ最大幅 1120px、左右パディング `sp-6`（24px）、SP は `sp-4`。
- セクション上下パディング `sp-24`（96px）、SP は `sp-12`（48px）。
- カード内パディング `sp-6`、カード間 `sp-6`。グリッド 3 列 → 768px 以下で 1 列。
- 本文 max-width 640px。
- ボタン: 高さ 56px（SP 52px）、横パディング `sp-8`、`radius pill`、文字 16/700。`btn-primary` = `brand-yellow` 面 + `ink` 文字、hover `yellow-600`。`btn-secondary` = `paper` 面 + `teal-600` 2px 枠 + `teal-700` 文字、hover `teal-50` 面。ダーク面の secondary は `paper` 枠 + `paper` 文字。
- フォーカスリング: `outline: 3px solid var(--ml-brand-teal); outline-offset: 2px`。

## CTA 文言（08_web_lp_assets.md）

「まずは相談する」「LINE活用について相談する」「自社に合う活用方法を聞く」「導入・運用について相談する」。「無料」「今だけ」「限定」を CTA に入れない。

## 番号バッジ・アイコン

`.icon`（48px の丸、`teal-50` 面）の中身は mono 700 / 20px / `brand-teal` がテンプレートの定義。この組み合わせは「太字 19px 以上」なので `brand-teal` でも通る。
サイズやウェイトを落とすなら色を `teal-700` に変える。SVG アイコンは `currentColor` で `brand-teal`、線幅 2px 以上（3:1 の図形要件は満たす）。

## コンポーネント CSS クラス（templates/lp.html に定義済み）

`.container` `.section` `.section--bg` `.section--dark` `.eyebrow` `.h1` `.h2` `.lead` `.grid-3` `.card` `.card--accent` `.btn` `.btn-primary` `.btn-secondary` `.kpi` `.kpi__num` `.kpi__unit` `.table` `.chip` `.chip--action` `.steps` `.faq`

## 実装ルール

- `tokens.css` を `<link>` し、自前の `:root` を書かない。単一ファイル納品なら `<style>` に貼り込む（生成物側で貼っても値は変えない）。
- Google Fonts は `tokens.json > google_fonts_url` の 1 本だけ。`preconnect` を付ける。
- 画像は `loading="lazy"`（ヒーロー除く）、`width/height` 明示。
- OGP 画像は `references/banner.md` の `ogp` プリセットで作る。
- 納品前: `lint_tokens.py --strict`、`render_preview.py --preset lp_desktop --full` と `--preset lp_mobile --full` の両方を見る。
