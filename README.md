# 仕組み化研修ポータルサイト

Animo社長研修（全3回）の受講メンバー向けポータル。`index.html` 1ファイルの静的サイトで、GitHub Pages で公開している。

## 構成

| パス | 役割 |
|---|---|
| `index.html` | サイト本体（HTML / CSS / JS / 配布PDFをすべて内包） |
| `tools/chatwork-proxy.gs` | Q&A投稿・課題シート提出を Chatwork に通知するための Google Apps Script |
| `CLAUDE.md` | Claude Code 向けの編集ガイド。ファイル構造や注意点はこちら |

## Chatwork 通知の設定

API トークンはリポジトリに置かない。`tools/chatwork-proxy.gs` の冒頭にある手順で GAS をデプロイし、発行された URL を `index.html` の `CHATWORK_PROXY_URL` に設定する。未設定の間は、投稿はポータル内に保存され、通知はクリップボードコピーで手動送信する動作になる。

## ローカル確認

```bash
python3 -m http.server 8000
# http://localhost:8000/
```
