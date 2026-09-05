# outline.json の書き方

`scripts/build_deck.py` が読む JSON。`assets/examples/sample_outline.json` が完全な実例。

## トップレベル

```json
{
  "client": "サンプル工務店",        // 敬称なし
  "honorific": "様",
  "date": "2026-06-01",
  "company": "株式会社MARKELINE",
  "slides": [ ... ]              // 順番どおりに出力される
}
```

## 文中の簡易マークアップ（全てのテキスト欄で使える）

- `**強調**` → 黄系の強調文字（白地では `yellow-700`、ティール帯の中では `brand-yellow`）
- `==マーカー==` → 黄色の蛍光下地
- `\n` → 改行
- それ以外の HTML はエスケープされる（`<` を書いても壊れない）

## 結論帯（conclusion）

文字列でもオブジェクトでもよい。
```json
"conclusion": "症状はバラバラでも、根っこは1つ。"
"conclusion": {"text": "＝ 月額の伴走型。**「使ってください」ではなく「一緒に作りましょう」。**", "tone": "teal"}
```
`tone` は `yellow`（既定）か `teal`。

## アイコン名

`clock users yen check calendar bulb doc phone chart building car person folder hands book run target sprout`

## 挿絵（`image` フィールド）

資料ごとに作った挿絵を置ける枠。値は outline.json からの相対パス（PNG / JPG / SVG、正方形推奨）。
省略すればピクトグラムのまま。置ける場所と表示サイズは `references/illustrations.md`。

| 型 | フィールド |
|---|---|
| cover | `image`（右側中央、文字は左寄せになる） |
| statement | `image`（一言主張の右） |
| compare | `left.image` / `right.image`（パネル右上） |
| before_after | `before.image` / `after.image`（パネル右上） |
| case_flow | `before.image`（Before パネル右上） |
| case_kpi | `side.image`（右カード。アイコンの代わり） |

```json
{"type":"statement","tag":"課題の根っこは1つ","quote":"実行する人と、\n仕組みがない","note":"…","image":"illustrations/root_cause.png"}
```

## ビルドの出力

```bash
python3 scripts/build_deck.py outline.json --out deck --render --pptx
```

| ファイル | 中身 | 用途 |
|---|---|---|
| `deck.html` | HTML 一式（tokens.css・フォント・挿絵を同梱） | ブラウザで確認、ソース |
| `deck-NN.png` | 3840×2160 PNG | チャット・LINE・サムネ |
| `deck.pdf` | ベクター PDF（文字埋め込み） | 納品・印刷 |
| `deck.pptx` | 図形とテキストで組んだ pptx（画像貼り込みではない） | **Google スライドで編集**（ファイル → インポート → スライド）、PowerPoint |

pptx の文字は既定で `Noto Sans JP`（太字）。Google スライドは Noto Sans JP を内蔵しているので、インポート直後から同じ書体で表示・編集できる。
PowerPoint で Black ウェイトまで再現したいときは `scripts/build_pptx.py outline.json --weight black`（フォントをインストールした環境向け）。

## 型ごとのフィールド

### cover
```json
{"type":"cover","label":"業務効率化のご提案","title":"サンプル工務店様 ご提案","subtitle":"現場のやり方を変えずに、業務を前に進める"}
```
`title` を省くと `client + honorific + " ご提案"`。

### goals
```json
{"type":"goals","title":"今日決めたいことは、2つだけ","items":["「新しいシステムを覚える」のではなく\n**「今のやり方のまま」**、手間と探す時間を消す","賃貸部門で==“楽になった”==を作り、\n他事業部（リフォーム・分譲 等）へ広げる"]}
```

### issues（2〜4 カード）
```json
{"type":"issues","title":"課題は4つ。どれも「人に依存」している","sub":"ヒアリングで伺った課題を4つに整理しました",
 "items":[{"icon":"person","head":"担当者依存","bullets":["特定の人しか分からない業務が多く、不在だと止まる"]}]}
```

### kpi（3〜4 行）
```json
{"type":"kpi","title":"毎日、時間とお金が溶けている",
 "rows":[{"icon":"building","value":"2〜3","unit":"時間","label":"数百円の入金確認に【2〜3時間】","note":"メールを掘り起こして照合","focus":false}],
 "conclusion":"症状はバラバラでも、根っこは1つ。"}
```
`focus: true` は 1 行だけ（黄色の巨大数字）。

### statement
```json
{"type":"statement","tag":"課題の根っこは1つ","quote":"実行する人と、\n仕組みがない","note":"やりたいこと・あるべき姿は見えている。\nでも現場が忙しすぎて“前に進める手”が足りない。"}
```

### compare
```json
{"type":"compare","title":"現場のやり方は変えない。こちらが合わせる",
 "left":{"head":"従来のシステム/DX","claim":"「新しいツールに現場が合わせる」","body":"","sep":"×",
         "flow":[{"icon":"doc","text":"新しいシステム\n入力ルール"},{"icon":"person","text":"現場の仕事が増える"},{"icon":"chart","text":"定着せず進まない"}]},
 "right":{"head":"MARKELINE","claim":"**「現場のオペレーションは変えない。**\n御社のやり方に、こちらが合わせる」","body":"今お使いのメール・Excelはそのまま。","sep":"▶",
          "flow":[{"icon":"doc","text":"今お使いの\nメール・Excel"},{"icon":"target","text":"裏側で自動的に\n情報を吸い上げ"},{"icon":"book","text":"ナレッジに集約\n活用しやすく蓄積"}]},
 "conclusion":{"text":"＝「今やってることの延長線上で」「変化は重たい」に、**まっすぐ応える形**。","tone":"teal"}}
```

### table（4 行まで）
```json
{"type":"table","title":"手作業を、裏側で自動化する","head":["御社の手作業","MARKELINEの打ち手","効果"],
 "rows":[{"icon":"doc","task":"解約手続き","sub":"FAX/メール→保証会社確認→Excel入力","action":"受信を自動でタスク化・下書き作成","effect":"転記・確認の手間を削減"}]}
```

### before_after
```json
{"type":"before_after","title":"効果：手作業が、自動で速く正確に",
 "before":{"head":"Before","claim":"手作業・確認作業が多く、時間も心も消耗","items":["手作業で確認・入力","現場の仕事が増える","定着せず進まない"]},
 "after":{"head":"After","claim":"自動化で、速く・正確・シンプルに","items":["メール・Excelを自動で取り込み","裏側で自動的に情報を吸い上げ","ナレッジに集約し、活用・蓄積"]},
 "effects":[{"icon":"clock","head":"時間","text":"数時間かかっていた仕事が、数分に"},{"icon":"users","head":"離職","text":"手間とストレスが減り“バケツの穴”を塞ぐ"},{"icon":"chart","head":"キャパ","text":"8名のまま、業務拡大に耐えられる"}],
 "conclusion":"＝コスト削減“だけ”でなく「人を増やさず事業を伸ばせる状態」を作る。"}
```

### steps（4 段）
```json
{"type":"steps","title":"小さく始めて、効果を見ながら広げる","sub":"1人分の人件費でスモールスタート",
 "steps":[{"icon":"users","label":"STEP0","head":"現場に入る（1ヶ月）","text":"一緒に棚卸しし、一番痛い業務を決める"}, ...],
 "conclusion":{"text":"＝ 月額の伴走型。**「使ってください」ではなく「一緒に作りましょう」。**","tone":"teal"}}
```

### why_now（3 つ）
```json
{"type":"why_now","title":"始めるなら、“今”が一番安い",
 "items":[{"icon":"calendar","head":"7月に**賃貸名人**へ切り戻し","text":"切り替えと同時に録音すれば、マニュアルが自動で貯まる。後からだと二度手間。"}]}
```

### pricing
```json
{"type":"pricing","title":"月額30万円から。増員より圧倒的に安い",
 "entry":{"label":"入口：賃貸部門　月額","value":"30","unit":"万円","text":"現場に入り、伴走型で業務を圧縮"},
 "expand":{"label":"横展開ラダー：最大　月額","value":"120","unit":"万円","text":"成果が出たら他事業部へ（最大4部門）"},
 "compare":{"label":"増員1名＝採用・教育で","value":"約1,000","unit":"万円","text":"人を増やさず回る仕組み（月30万）に投資する方が圧倒的に安い。","note":"※ 金額は例。実際の見積はヒアリング後にご提示します。"}}
```

### case_kpi
```json
{"type":"case_kpi","title":"実績①：“現場を変えずに”成果が出ている","case":"広告代理店の事例",
 "rows":[{"icon":"clock","label":"1人3〜4時間かかっていた広告入稿を","before":"3〜4","before_unit":"時間","after":"15","after_unit":"分。"},
         {"icon":"users","label":"現場スタッフが「楽になった」と喜び、","prefix":"月約","after":"30","after_unit":"時間削減。"},
         {"icon":"target","label":"現場のやり方は変えず、裏側を自動化。"}],
 "side":{"icon":"target","text":"現場はそのまま、\n効率だけがアップ。"},
 "conclusion":{"text":"＝**「現場に合わせて圧縮する」**が、すでに動いて成果が出ているモデル。","tone":"teal"}}
```

### case_flow
```json
{"type":"case_flow","title":"実績②：バラバラの情報と転記を、“一つの流れ”に",
 "before":{"head":"Before：散らばっている状態","claim":"あるサービス運営業（介護施設）でも、課題の根っこは同じでした","items":["申込・予約・送迎・日次記録・請求が、メール／Excel／紙にバラバラ","転記作業と確認漏れが絶えず、担当者しか分からない業務に"]},
 "after":{"head":"After：一つの流れにまとめた状態","flow_title":"一気通貫フロー図","flow":[{"icon":"doc","text":"申込"},{"icon":"calendar","text":"予約"},{"icon":"person","text":"利用者台帳"},{"icon":"car","text":"送迎"},{"icon":"book","text":"日次記録"},{"icon":"yen","text":"請求"}],
          "checks":["現場と事務が、同じ画面・同じ情報を見ながら進められる","転記作業と確認漏れを削減","AIが送迎ルート案・シフトの下書きまで自動で作成"]},
 "conclusion":{"text":"御社の“情報の分断・手作業の山”も、同じように**一本化できます**。","tone":"teal"}}
```

### closing
```json
{"type":"closing","title":"まとめ／次の一歩","merits":["① 現場を変えない","② 小さく始めて効果を見ながら拡大","③ 賃貸の成功を全社へ横展開できる"],
 "next":{"head":"【次の一歩】","text":"まず“ペインの大きい1業務”からSTEP0（現場に入る1ヶ月）"},
 "message":"業務が前に進む安心感","message_suffix":"を、御社に。"}
```

## ビルド時の警告

`build_deck.py` は次を警告として出す（エラーでは止まらない）。出たら直す。
- タイトル帯 22 字超、箇条書き 26 字超、結論帯 40 字超、一言主張 14 字超
- 1 枚のブロック（カード・行・ステップ）が 5 個以上
- `focus` が 1 枚に 2 つ以上
- 未知のアイコン名
