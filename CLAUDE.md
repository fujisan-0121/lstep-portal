# CLAUDE.md

## 日本語を書くときの標準動作

日本語の文章を書く・直す・返答するタスクでは、着手前に `.claude/skills/natural-japanese/` のスキルを使う。藤原人格と文体ナレッジを全文読んでから書き、AIの癖を落として呼吸のある日本語に整える。出力にアスタリスクを入れない。

ファイルの場所の解決は `.claude/skills/natural-japanese/scripts/resolve_files.sh`。保管庫に触れないクラウドセッションでは、同スキルの references だけで整え、その旨を成果物の最後に一行添える。

ローカル環境で呼び出し不要にするには、一度だけ `bash .claude/skills/natural-japanese/scripts/install.sh` を実行する。
