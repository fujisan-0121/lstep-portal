# lstep-portal

- `index.html`: 仕組み化研修ポータル（経営者メンバー専用）。独自のネイビー/オレンジ配色で、MARKELINE ブランドとは別物。
- `.claude/skills/markeline-design-system/`: 株式会社MARKELINE のブランドデザインシステム。
  MARKELINE 名義の LP・スライド・バナー・帳票など、あらゆるビジュアル成果物を作る前に `SKILL.md` を読み、
  色・フォント・余白・ロゴは `tokens/tokens.json` 由来の値だけを使う。目分量での近似は禁止。
  仕上げに `python3 .claude/skills/markeline-design-system/scripts/lint_tokens.py --strict <出力>` を通す。
- `.claude/skills/markeline-proposal-deck/`: クライアント向け提案書の生成スキル。ヒアリングメモ → `outline.json` → `scripts/build_deck.py --render --pptx` で
  基準デッキ（工務店向け提案、14枚）の型どおりの HTML / 2倍PNG / ベクターPDF / Google スライドで編集できる pptx を出す。
  挿絵は案件ごとに `image` フィールドで差し替える（`references/illustrations.md`）。見た目はデザインシステムに依存する。
