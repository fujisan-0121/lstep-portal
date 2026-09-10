#!/usr/bin/env node
/**
 * ブラウザを開けない環境（リモートの Claude Code など）で Cloudflare にログインするための補助。
 * wrangler login は数分で待ち受けを止めてしまうので、OAuth(PKCE) の手順を自前で行い、
 * 取得したトークンを wrangler の設定ファイルに書き込む。
 *
 *   node scripts/cf-oauth.mjs start
 *     → 認可 URL を表示する。人がブラウザで開いて Allow する。
 *       ブラウザは http://localhost:8976/oauth/callback?code=... に飛んで失敗するので、その URL をコピーする
 *   node scripts/cf-oauth.mjs finish "<コピーした URL>"
 *     → コードをトークンに交換し、wrangler が使う設定ファイルに保存する
 *
 * 状態（code_verifier）は ~/.config/.wrangler/cf-oauth-state.json に保存するので、
 * start と finish の間に時間が空いても、プロセスが変わっても構わない。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CLIENT_ID = '54d11594-84e4-41aa-b438-e81b8fa78ee7'; // wrangler の公開クライアント ID
const REDIRECT_URI = 'http://localhost:8976/oauth/callback';
const AUTH_URL = 'https://dash.cloudflare.com/oauth2/auth';
const TOKEN_URL = 'https://dash.cloudflare.com/oauth2/token';
const SCOPES = [
  'account:read', 'user:read', 'workers:write', 'workers_kv:write', 'workers_routes:write', 'workers_scripts:write',
  'workers_tail:read', 'd1:write', 'pages:write', 'zone:read', 'ssl_certs:write', 'ai:write', 'queues:write',
  'pipelines:write', 'secrets_store:write', 'containers:write', 'cloudchamber:write', 'connectivity:admin', 'offline_access',
];

const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), '.wrangler');
const statePath = path.join(configDir, 'cf-oauth-state.json');
const tokenPath = path.join(configDir, 'config', 'default.toml');
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const cmd = process.argv[2];

if (cmd === 'start') {
  const verifier = b64url(crypto.randomBytes(48));
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
  const state = b64url(crypto.randomBytes(24));
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify({ verifier, state, createdAt: new Date().toISOString() }), { mode: 0o600 });
  const url = `${AUTH_URL}?${new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, scope: SCOPES.join(' '),
    state, code_challenge: challenge, code_challenge_method: 'S256',
  })}`;
  console.log(url);
} else if (cmd === 'finish') {
  const input = process.argv[3];
  if (!input) { console.error('finish には コールバック URL（または code）を渡してください'); process.exit(1); }
  if (!fs.existsSync(statePath)) { console.error('先に start を実行してください'); process.exit(1); }
  const saved = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  let code = input.trim();
  let state = null;
  if (/^https?:\/\//.test(code)) {
    const u = new URL(code);
    code = u.searchParams.get('code') || '';
    state = u.searchParams.get('state');
  }
  if (!code) { console.error('URL に code がありません'); process.exit(1); }
  if (state && state !== saved.state) { console.error('state が一致しません。start をやり直して新しい URL を使ってください'); process.exit(1); }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: CLIENT_ID, code, redirect_uri: REDIRECT_URI, code_verifier: saved.verifier }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    console.error(`トークン交換に失敗しました (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
    console.error('コードは使い捨てで数分で失効します。start からやり直して、Allow の直後に finish してください');
    process.exit(1);
  }
  const expiration = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
  const scopes = (data.scope || SCOPES.join(' ')).split(/[ +]/).filter(Boolean);
  const toml = [
    `oauth_token = "${data.access_token}"`,
    `expiration_time = "${expiration}"`,
    `refresh_token = "${data.refresh_token || ''}"`,
    `scopes = [ ${scopes.map((s) => `"${s}"`).join(', ')} ]`,
    '',
  ].join('\n');
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, toml, { mode: 0o600 });
  fs.unlinkSync(statePath);
  console.log(`ログイン完了。トークンを ${tokenPath} に保存しました（有効期限 ${expiration}、更新トークン${data.refresh_token ? 'あり' : 'なし'}）`);
} else {
  console.log('usage: node scripts/cf-oauth.mjs start | finish "<callback url>"');
  process.exit(1);
}
