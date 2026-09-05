---
name: markeline-proposal-deck
description: 株式会社MARKELINE（マーケライン）のクライアント向け提案書を、ヒアリングメモ・商談メモ・議事録から一気に組み立てるスキル。基準は基準デッキ（工務店向け提案、14枚）の型で、表紙→本日のゴール→現状4課題→数字→根っこ→考え方→業務マップ→Before/After→進め方→なぜ今→料金→実績①→実績②→まとめ、の流れを1枚1メッセージで作る。中身は JSON アウトラインに書き、scripts/build_deck.py がデザインシステム（markeline-design-system）のテンプレートで HTML・2倍PNG・ベクターPDF・Googleスライドで編集できる pptx を出力する。挿絵は資料ごとに差し替える。「提案書」「ご提案資料」「提案スライド」「ヒアリングメモから資料」「商談メモをスライドに」「伴走型の提案」「業務効率化の提案」「AI業務効率化」「〇〇様向けに提案」「工務店提案の型で」など、MARKELINE がクライアントに出す提案・営業・セミナー後フォロー資料の依頼では必ずこのスキルを使う。LINE公式の配信改善提案（11枚・見積付き）だけは lstep-flexible-proposal-generator の担当。
---

# MARKELINE 提案書デッキ

ヒアリングで聞いた「困りごと」を、MARKELINE の型に流し込んで提案書にする。
見た目は `markeline-design-system` が担当し、このスキルは **話の順番・各枚の主張・言い回し** を担当する。

## 出来上がりの姿

基準デッキ（工務店向け提案、2026-06、14枚。社名は匿名化）が基準。`assets/reference_sheet_1.jpg` と `assets/reference_sheet_2.jpg` を最初に一度見る。
同じ内容を JSON に起こしたものが `assets/examples/sample_outline.json`。**新しい案件は、このファイルをコピーして中身を差し替える**のが最短。

| # | 型 | その枚が言うこと | 基準デッキの主張 |
|---|---|---|---|
| 1 | cover | 誰に、何の提案か | サンプル工務店様 ご提案 ～現場のやり方を変えずに、業務を前に進める～ |
| 2 | goals | 今日決めたいこと 2つ | 「今のやり方のまま」手間を消す ／ 賃貸で“楽になった”を作り他部門へ |
| 3 | issues | 課題は4つ（担当者依存・情報の分断・手作業の山・ナレッジの欠如） | 御社の現状＝私たちの理解 |
| 4 | kpi | 溶けている時間とお金を数字で | 2〜3時間 / 15〜20分 / 8名 / 1,000万円 → 根っこは1つ |
| 5 | statement | 根っこを一言で | 「実行する人と、仕組みがない」 |
| 6 | compare | 従来のDX vs MARKELINE | 現場のやり方は変えない。こちらが合わせる |
| 7 | table | 手作業→打ち手→効果 の業務マップ | 4〜6 行 |
| 8 | before_after | 自動化前後と、時間・離職・キャパ | コスト削減“だけ”でなく人を増やさず伸ばせる状態 |
| 9 | steps | STEP0〜3 の階段 | 小さく始めて広げる。月額の伴走型 |
| 10 | why_now | なぜ今か 3つ | 切り戻し時期 / GPT有料30名 / 担当顧客1.5〜5倍 |
| 11 | pricing | 入口 30万 → 最大 120万 vs 増員 1,000万 | スモールスタート→積み上げ |
| 12 | case_kpi | 実績①（数字で） | 広告代理店：3〜4時間→15分、月30時間削減 |
| 13 | case_flow | 実績②（流れで） | 介護施設：バラバラ→一気通貫フロー |
| 14 | closing | メリット3つ + 次の一歩 + 一言 | 「業務が前に進む安心感」を、御社に |

枚数は固定ではない。課題が3つなら issues は3枚組にせず 3 カードにする。実績が1つなら case は1枚。
ただし **1枚1メッセージ** は崩さない。入らないなら枚を増やす（`references/storyline.md`）。

## 手順

1. **`markeline-design-system/SKILL.md` を読む**（色・書体・1枚1メッセージ・24px 下限の規則はそちらが正）。
2. ヒアリングメモを読んで `references/storyline.md` の「抽出シート」を埋める。埋まらない欄は **推測で埋めずに空欄のまま**、後で「要確認」として返す。
3. `assets/examples/sample_outline.json` をコピーし、`references/outline-schema.md` に従って中身を差し替える。言い回しは `references/copy-rules.md`。
4. 挿絵が要る枚（表紙・根っこ・実績①が優先）は `references/illustrations.md` の型で画像を用意し、`scripts/check_illustration.py` でブランド色に収まっているか確認してから outline.json の `image` に相対パスで書く。無ければピクトグラムのままでよい。
5. `python3 scripts/build_deck.py outline.json --out <出力先> --render --pptx`
   - HTML、`deck-NN.png`（3840×2160）、`deck.pdf`（ベクター）、`deck.pptx`（図形＋テキスト。Google スライドで編集可）を出す
   - 警告（タイトルが長い、箇条書きが 2 行になる、ブロックが 5 個以上）が出たら **削るか枚を割る**。縮めない
6. 全枚の PNG を実際に見る。はみ出し・折り返し・主張が2つある枚を直して再ビルド。
   pptx も確認する: `soffice --headless --convert-to pdf deck.pptx` が使える環境なら PDF にして全枚見る。使えなければ `python3 -c "from pptx import Presentation; Presentation('deck.pptx')"` で開けることだけ確かめ、納品メモに「pptx は Google スライドで要確認」と書く。
7. `python3 ../markeline-design-system/scripts/lint_tokens.py --strict <出力先>` が 0 件であることを確認（pptx も検査される）。
8. 納品物: PDF + pptx + HTML一式（zip） + 「要確認リスト」（未確認の数値、掲載許可が要る社名、仮置きの金額）。
   pptx の渡し方: Google ドライブにアップ → 右クリック「アプリで開く → Google スライド」で全文字が編集できる状態になる。

## pptx について

- `scripts/build_pptx.py` は HTML と同じ 1920×1080 の座標系（1px = 1/144 インチ）に、同じ実測フォントサイズ（`reference-type-scale.md`）で図形とテキストを置く。画像貼り込みのスライドは作らない。
- 既定の書体は `Noto Sans JP`＋太字。Google スライドは Noto Sans JP を内蔵しているので、インポート直後から同じ見え方で編集できる。Black ウェイトまで再現したい PowerPoint 用途だけ `--weight black`。
- HTML 版は `fit()` で長文を縮めるが、pptx 版はテキストボックスの折り返しに任せる。**タイトル 17 字・結論帯 28 字を超えたら pptx 側で 2 行になる**ので、警告が出た枚は文言を削る。
- 型の見た目を変えるときは `infographic.html`（HTML）と `build_pptx.py`（pptx）の両方を直す。片方だけ直すと成果物が食い違う。

## 絶対に守ること

- **数字を作らない。** ヒアリングに無い数字は「例」を付けるか、欄ごと落とす。実績の社名は掲載許可が要る（`references/copy-rules.md`）。
- 料金は「入口の月額」と「増員との比較」の 2 点で語る。値引き・限定・今だけ、は書かない。
- 補助金は「活用できる可能性」「要件確認が必要」。断定しない。
- 各枚のタイトル帯は主張文（`references/copy-rules.md` の型）。ラベルだけのタイトル（「料金」「実績」）は不合格。
- 出力 HTML の CSS を手で書き足さない。足りない型があれば `markeline-design-system/templates/infographic.html` に追加して、`build_deck.py` に型を足す。
