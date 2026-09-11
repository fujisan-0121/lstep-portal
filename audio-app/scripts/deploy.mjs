#!/usr/bin/env node
/**
 * 本番デプロイを1コマンドで行う。
 *
 *   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/deploy.mjs
 *
 * やること（すべて冪等。2回目以降は既存のものを使う）
 *   1. D1 データベース audio_db を作成し、wrangler.jsonc に database_id を書き込む
 *   2. R2 バケット markeline-audio を作成
 *   3. Cloudflare Access の Self-hosted アプリケーションとポリシー（許可するメールドメイン）を作成し、
 *      AUD タグとチームドメインを wrangler.jsonc の vars に書き込む
 *   4. D1 マイグレーションを本番に適用
 *   5. wrangler deploy（カスタムドメインにルーティング）
 *
 * 環境変数
 *   CLOUDFLARE_API_TOKEN   必須。必要な権限は README の「API トークンの権限」を参照
 *   CLOUDFLARE_ACCOUNT_ID  必須。Cloudflare ダッシュボード右側の Account ID
 *   AUDIO_DOMAIN           省略時 audio.lstepoffcial.com（Cloudflare 管理下のゾーンのサブドメイン）
 *   ADMIN_EMAILS           省略時 fujiwara@markeline.net（カンマ区切り）
 *   ALLOWED_EMAIL_DOMAINS  省略時 markeline.net（Access で許可するメールドメイン。カンマ区切り）
 *   ALLOWED_EMAILS         省略可。ドメイン外で個別に許可するメールアドレス（カンマ区切り）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'wrangler.jsonc');

const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const DOMAIN = process.env.AUDIO_DOMAIN || 'audio.lstepoffcial.com';
const ADMIN_EMAILS = process.env.ADMIN_EMAILS || 'fujiwara@markeline.net';
const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS || 'markeline.net').split(',').map((s) => s.trim()).filter(Boolean);
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '').split(',').map((s) => s.trim()).filter(Boolean);
const D1_NAME = 'audio_db';
const R2_NAME = 'markeline-audio';
const APP_NAME = '社内音声ライブラリ';

if (!TOKEN || !ACCOUNT) {
  console.error('CLOUDFLARE_API_TOKEN と CLOUDFLARE_ACCOUNT_ID を環境変数で渡してください');
  process.exit(1);
}

const log = (s) => console.log(`\n▶ ${s}`);
const sh = (cmd) => execSync(cmd, { cwd: root, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });

async function cf(method, url, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${url}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    const msg = (data.errors || []).map((e) => `${e.code}: ${e.message}`).join('; ') || res.statusText;
    throw new Error(`${method} ${url} → ${res.status} ${msg}`);
  }
  return data.result;
}

/* wrangler.jsonc の編集（コメントを壊さないよう、対象の行だけ文字列置換する） */
let cfg = fs.readFileSync(cfgPath, 'utf8');
function setValue(key, value, { insideVars = false } = {}) {
  const re = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`);
  if (!re.test(cfg)) throw new Error(`wrangler.jsonc に "${key}" が見つかりません`);
  cfg = cfg.replace(re, `$1"${value}"`);
  void insideVars;
}
function saveCfg() { fs.writeFileSync(cfgPath, cfg); }

(async () => {
  /* 0. トークン確認 */
  log('トークンを確認');
  // 「ユーザーの詳細: 読み取り」が無いトークンでは verify が 403 になることがあるので、失敗しても続行する
  const tokenInfo = await cf('GET', '/user/tokens/verify').catch((e) => ({ status: `確認できず (${e.message.split('→')[1]?.trim() || e.message})` }));
  console.log(`  status: ${tokenInfo.status}`);

  /* 1. ゾーン確認 */
  const zoneName = DOMAIN.split('.').slice(-2).join('.');
  log(`ゾーン ${zoneName} を確認`);
  const zones = await cf('GET', `/zones?name=${zoneName}&account.id=${ACCOUNT}`);
  if (!zones.length) throw new Error(`ゾーン ${zoneName} がこのアカウントの Cloudflare にありません。AUDIO_DOMAIN を Cloudflare 管理下のドメインにしてください`);
  console.log(`  zone id: ${zones[0].id}`);

  /* 2. D1 */
  log(`D1 データベース ${D1_NAME}`);
  const dbs = await cf('GET', `/accounts/${ACCOUNT}/d1/database?name=${D1_NAME}`);
  let db = dbs.find((d) => d.name === D1_NAME);
  if (!db) db = await cf('POST', `/accounts/${ACCOUNT}/d1/database`, { name: D1_NAME });
  console.log(`  database_id: ${db.uuid}`);
  setValue('database_id', db.uuid);

  /* 3. R2 */
  log(`R2 バケット ${R2_NAME}`);
  const buckets = await cf('GET', `/accounts/${ACCOUNT}/r2/buckets`);
  if (!(buckets.buckets || []).some((b) => b.name === R2_NAME)) await cf('POST', `/accounts/${ACCOUNT}/r2/buckets`, { name: R2_NAME });
  console.log('  ok');

  /* 4. Access */
  log('Cloudflare Access');
  // チームドメイン（xxxx.cloudflareaccess.com）。API で読めない権限構成のときは ACCESS_TEAM_DOMAIN で直接渡せる
  let teamDomain = process.env.ACCESS_TEAM_DOMAIN || '';
  if (!teamDomain) {
    const org = await cf('GET', `/accounts/${ACCOUNT}/access/organizations`).catch((e) => {
      throw new Error(`Access のチームドメインを取得できませんでした（${e.message}）。Zero Trust → Settings → Custom Pages の Team domain を ACCESS_TEAM_DOMAIN として渡してください`);
    });
    teamDomain = org.auth_domain;
  }
  console.log(`  team domain: ${teamDomain}`);
  const apps = await cf('GET', `/accounts/${ACCOUNT}/access/apps`);
  let app = apps.find((a) => a.domain === DOMAIN);
  const include = [
    ...ALLOWED_DOMAINS.map((d) => ({ email_domain: { domain: d } })),
    ...ALLOWED_EMAILS.map((e) => ({ email: { email: e } })),
  ];
  if (!app) {
    app = await cf('POST', `/accounts/${ACCOUNT}/access/apps`, {
      name: APP_NAME,
      type: 'self_hosted',
      domain: DOMAIN,
      session_duration: '720h',
      auto_redirect_to_identity: false,
      app_launcher_visible: true,
      policies: [{ name: '社内メンバー', decision: 'allow', include, precedence: 1 }],
    });
    console.log(`  作成: ${app.name}`);
  } else {
    const policies = await cf('GET', `/accounts/${ACCOUNT}/access/apps/${app.id}/policies`).catch(() => []);
    if (!policies.length) {
      await cf('POST', `/accounts/${ACCOUNT}/access/apps/${app.id}/policies`, { name: '社内メンバー', decision: 'allow', include, precedence: 1 });
      console.log('  ポリシーを追加');
    } else {
      console.log(`  既存: ${app.name}（ポリシー ${policies.length} 件はそのまま）`);
    }
  }
  console.log(`  AUD: ${app.aud}`);
  setValue('ACCESS_TEAM_DOMAIN', teamDomain);
  setValue('ACCESS_AUD', app.aud);
  setValue('ADMIN_EMAILS', ADMIN_EMAILS);
  setValue('APP_URL', `https://${DOMAIN}`);
  if (process.env.NOTION_DATABASE_ID) setValue('NOTION_DATABASE_ID', process.env.NOTION_DATABASE_ID);

  /* 5. ルート */
  if (/\/\/\s*"routes"/.test(cfg)) {
    cfg = cfg.replace(/\/\/\s*"routes":\s*\[\{[^\n]*\n/, `"routes": [{ "pattern": "${DOMAIN}", "custom_domain": true }],\n`);
  } else {
    cfg = cfg.replace(/("routes":\s*\[\{\s*"pattern":\s*)"[^"]*"/, `$1"${DOMAIN}"`);
  }
  saveCfg();
  console.log(`\n  wrangler.jsonc を更新しました（route: ${DOMAIN}）`);

  /* 6. マイグレーションとデプロイ */
  log('D1 マイグレーション（本番）');
  sh(`npx wrangler d1 migrations apply ${D1_NAME} --remote`);
  log('デプロイ');
  sh('npx wrangler deploy');

  /* 7. Notion 連携トークン（secret）。未設定なら文字起こしと要約だけ動く */
  if (process.env.NOTION_TOKEN) {
    log('Notion トークンを secret に保存');
    execSync('npx wrangler secret put NOTION_TOKEN', { cwd: root, stdio: ['pipe', 'inherit', 'inherit'], input: process.env.NOTION_TOKEN, env: { ...process.env, CLOUDFLARE_API_TOKEN: TOKEN, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
  } else {
    console.log('\n  NOTION_TOKEN が無いので Notion 連携は未設定のまま（文字起こしと要約はアプリ内に保存されます）');
  }

  console.log(`\n✅ 完了: https://${DOMAIN}`);
  console.log(`   管理者: ${ADMIN_EMAILS}`);
  console.log(`   ログイン可能: @${ALLOWED_DOMAINS.join(', @')}${ALLOWED_EMAILS.length ? ' + ' + ALLOWED_EMAILS.join(', ') : ''}`);
  console.log('   初回アクセス時に Access のログイン画面が出ます。会社のメールアドレスでログインしてください');
})().catch((e) => {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
});
