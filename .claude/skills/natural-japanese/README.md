# natural-japanese（ナチュラルジャパニーズ）

日本語を書くタスクの前に、Obsidian保管庫の藤原人格と文体ナレッジを全文読み、AIの癖を落として、人が書いたように呼吸のある日本語に整えるClaude Codeスキル。

## 入れ方（一度だけ）

```bash
bash scripts/install.sh
```

これで次が揃う。以後は呼び出さなくても動く。

1. スキル本体が `~/.claude/skills/natural-japanese/` に入る
2. Obsidian保管庫の場所が `~/.config/claude-obsidian/vault-path` に保存される（obsidian-auto-write と共通）
3. 保管庫の中から文体ナレッジと藤原人格が見つかり、`~/.config/claude-obsidian/natural-japanese.env` に保存される
4. `~/.claude/CLAUDE.md` に起動指示が1行入る
5. `~/.claude/settings.json` の SessionStart hook に `scripts/session-start.sh` が入り、セッション開始時に2ファイルがコンテキストへ流れる

ファイルが自動で見つからなければ、その場で聞かれる。まだ無いなら `--bootstrap` を付けると、`assets/templates/` の雛形（藤原人格.md、文体ナレッジ.md）を保管庫の `natural-japanese/` フォルダに作って、それを使う。保管庫が複数あるなら `--vault パス` で指定できる。あとから変えるときは `natural-japanese.env` を直接書き換える。

```bash
bash scripts/install.sh --vault ~/vaults/obsidian-codex-cowork-vault --bootstrap
```

`--dry-run` を付けると、何をするか表示するだけで何も書かない。

## 中身

- `SKILL.md` 手順と判断の優先順位
- `references/ai-patterns.md` 落とすもの（テンプレ、前置き、抽象、形容詞、語尾の連続、構造の癖、日本語固有の癖）
- `references/breathing.md` 入れるもの（文の長短、語尾の散らし、順序で語る、具体名詞、媒体別の呼吸）
- `references/fujiwara-voice.md` 藤原人格が読めない環境のための薄い足場。本物が読めたら使わない
- `scripts/check_ai_patterns.py` 機械で拾える癖を行番号つきで出す
- `scripts/resolve_files.sh` 文体ナレッジと藤原人格のパスを解決する
- `scripts/session-start.sh` SessionStart hook本体。「## 核」見出しがあればそこだけ流す
- `scripts/install.sh` 上記を全部設定するインストーラー
- `assets/templates/藤原人格.md`、`assets/templates/文体ナレッジ.md` 保管庫に置く雛形。本人のメモから起こした初版
- `assets/settings-snippet.json` hookを手で入れる場合の設定例
- `evals/evals.json` 動作確認用のテストプロンプト

## 判断の優先順位

1. そのタスクでユーザーが明示した指示
2. 藤原人格（誰として、何を言い、何を言わないか）
3. 文体ナレッジ（どう書くか）
4. このスキルのreferences

## ナレッジを軽く保つコツ

文体ナレッジや藤原人格が長くなったら、ファイル内に `## 核` という見出しを作り、絶対に守るものだけをその下に置く。hookはその部分だけを毎セッション流し、残りはスキルが必要なときに読む。

## 動作確認

```bash
bash scripts/resolve_files.sh
bash scripts/session-start.sh | head -30
python3 scripts/check_ai_patterns.py 下書き.md
```
