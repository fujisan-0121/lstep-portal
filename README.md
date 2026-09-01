# 仕組み化研修ポータルサイト

Animo社長研修（全3回）の受講メンバー向けポータル。`index.html` 1ファイルの静的サイトで、GitHub Pages で公開している。

## 構成

| パス | 役割 |
|---|---|
| `index.html` | サイト本体（HTML / CSS / JS） |
| `docs/` | 資料ライブラリで配布する PDF |
| `tools/chatwork-proxy.gs` | Q&A投稿・課題シート提出を Chatwork に通知するための Google Apps Script |
| `tools/gen-pins.py` | メンバー PIN のハッシュ生成。平文は `tools/pins.csv`（git 管理外）に保持 |
| `CLAUDE.md` | Claude Code 向けの編集ガイド。ファイル構造や注意点はこちら |

## Chatwork 通知の設定

API トークンはリポジトリに置かない。`tools/chatwork-proxy.gs` の冒頭にある手順で GAS をデプロイし、発行された URL を `index.html` の `CHATWORK_PROXY_URL` に設定する。未設定の間は、投稿はポータル内に保存され、通知はクリップボードコピーで手動送信する動作になる。

## メンバー PIN

各メンバーに4桁 PIN を配布し、サイト側にはハッシュだけを置く。

```bash
python3 tools/gen-pins.py --generate   # tools/pins.csv を新規生成（平文。コミット禁止）
python3 tools/gen-pins.py --apply      # ハッシュを index.html に書き込む
```

PIN を変えたいメンバーは `tools/pins.csv` の該当行を書き換えて `--apply` する。

## ローカル確認

```bash
python3 -m http.server 8000
# http://localhost:8000/
```
