/**
 * Chatwork 通知プロキシ（Google Apps Script）
 *
 * ポータル（index.html）は静的サイトなので、Chatwork API トークンをフロントに置くと
 * 閲覧者全員に見えてしまう。トークンはこの GAS 側の「スクリプト プロパティ」に保持し、
 * ブラウザからは本スクリプトのウェブアプリ URL に POST するだけにする。
 *
 * ── セットアップ手順 ──────────────────────────────────────────
 * 1. https://script.google.com で新規プロジェクトを作成し、このファイルの内容を貼り付ける
 * 2. 左メニュー「プロジェクトの設定」→「スクリプト プロパティ」に以下を追加
 *      CHATWORK_TOKEN : Chatwork の API トークン（新しく発行し直したもの）
 *      CHATWORK_ROOM  : 通知先ルームID（URL の #!rid の後ろの数字）
 * 3. 右上「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」
 *      実行ユーザー : 自分
 *      アクセスできるユーザー : 全員
 * 4. 発行された「ウェブアプリ URL」を index.html の CHATWORK_PROXY_URL に設定する
 * 5. コードを変更したら「デプロイを管理」→ 編集 → 新バージョンで再デプロイ（URL は変わらない）
 *
 * 注意: ウェブアプリ URL を知っていれば誰でもこのルームに投稿できる。
 *       これは従来（トークン直書き）と同じ露出範囲であり、トークン自体が漏れるよりはるかに安全。
 *       さらに絞りたい場合は Referer チェックや簡易レート制限をここに追加する。
 */

function doPost(e) {
  var out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  try {
    var props = PropertiesService.getScriptProperties();
    var token = props.getProperty('CHATWORK_TOKEN');
    var room  = props.getProperty('CHATWORK_ROOM');
    if (!token || !room) {
      return out.setContent(JSON.stringify({ error: 'CHATWORK_TOKEN / CHATWORK_ROOM が未設定です' }));
    }

    var payload = {};
    try { payload = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) {}
    var body = String(payload.body || '').trim();
    if (!body) return out.setContent(JSON.stringify({ error: 'body が空です' }));
    if (body.length > 10000) body = body.slice(0, 10000) + '\n…（省略）';

    var res = UrlFetchApp.fetch('https://api.chatwork.com/v2/rooms/' + room + '/messages', {
      method: 'post',
      headers: { 'X-ChatWorkToken': token },
      payload: { body: body },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    var text = res.getContentText();
    if (code >= 200 && code < 300) return out.setContent(text); // {"message_id":"..."}
    return out.setContent(JSON.stringify({ error: 'Chatwork API ' + code, detail: text }));
  } catch (err) {
    return out.setContent(JSON.stringify({ error: String(err) }));
  }
}

// ブラウザで URL を直接開いたときの疎通確認用
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: 'chatwork-proxy' }))
    .setMimeType(ContentService.MimeType.JSON);
}
