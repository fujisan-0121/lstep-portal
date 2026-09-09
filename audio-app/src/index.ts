/**
 * 社内音声配信アプリ API (Cloudflare Workers + Hono)
 *
 * - 認証: Cloudflare Access（独自パスワードは持たない）
 * - DB:   D1 (members / categories / episodes / plays / comments)
 * - 音声: R2（Range リクエスト対応でストリーミング配信）
 */
import { Hono } from 'hono';
import type { Context, MiddlewareHandler } from 'hono';
import { extractAccessToken, verifyAccessJwt } from './auth';

export interface Env {
  DB: D1Database;
  AUDIO: R2Bucket;
  ASSETS: Fetcher;
  ENVIRONMENT: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ADMIN_EMAILS: string;
  MAX_UPLOAD_MB?: string;
  /** ローカル開発専用（.dev.vars）。本番では設定しない */
  DEV_USER_EMAIL?: string;
}

export interface Member {
  id: number;
  email: string;
  name: string;
  role: 'member' | 'admin';
  created_at: string;
  last_seen_at: string;
}

type Vars = { member: Member; isAdmin: boolean };
type App = Hono<{ Bindings: Env; Variables: Vars }>;
type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

const now = () => new Date().toISOString();
const COMPLETE_RATIO = 0.9;
const ALLOWED_AUDIO = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/aac',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/webm',
]);

const app: App = new Hono();

/* ───────────────────────── 認証 ───────────────────────── */

const authenticate: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  const env = c.env;
  let email: string | null = null;
  let displayName: string | undefined;

  if (env.ENVIRONMENT === 'development' && env.DEV_USER_EMAIL) {
    // ローカル開発: Access を通らないので .dev.vars の人物としてふるまう。
    // X-Dev-User ヘッダーで別人を装えるのは開発時のみ。
    email = (c.req.header('X-Dev-User') || env.DEV_USER_EMAIL).toLowerCase();
  } else {
    if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
      return c.json({ error: 'Cloudflare Access の設定 (ACCESS_TEAM_DOMAIN / ACCESS_AUD) がありません' }, 500);
    }
    const token = extractAccessToken(c.req.raw);
    if (!token) return c.json({ error: 'ログインが必要です' }, 401);
    const identity = await verifyAccessJwt(token, { teamDomain: env.ACCESS_TEAM_DOMAIN, audience: env.ACCESS_AUD });
    if (!identity) return c.json({ error: 'ログイン情報を確認できません。再度ログインしてください' }, 401);
    email = identity.email;
    displayName = identity.name;
  }

  const ts = now();
  const fallbackName = displayName?.trim() || email.split('@')[0];
  await env.DB.prepare(
    `INSERT INTO members (email, name, role, created_at, last_seen_at) VALUES (?, ?, 'member', ?, ?)
     ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at`,
  )
    .bind(email, fallbackName, ts, ts)
    .run();
  const member = await env.DB.prepare('SELECT * FROM members WHERE email = ?').bind(email).first<Member>();
  if (!member) return c.json({ error: 'メンバー情報を取得できません' }, 500);

  const adminList = (env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  c.set('member', member);
  c.set('isAdmin', member.role === 'admin' || adminList.includes(member.email));
  await next();
};

const requireAdmin: MiddlewareHandler<{ Bindings: Env; Variables: Vars }> = async (c, next) => {
  if (!c.get('isAdmin')) return c.json({ error: '管理者のみ操作できます' }, 403);
  await next();
};

app.use('/api/*', authenticate);
app.use('/api/admin/*', requireAdmin);

/* ───────────────────────── 自分 ───────────────────────── */

app.get('/api/me', (c) => {
  const m = c.get('member');
  return c.json({ member: publicMember(m), isAdmin: c.get('isAdmin') });
});

app.put('/api/me', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({}) as { name?: string });
  const name = (body.name ?? '').trim().slice(0, 40);
  if (!name) return c.json({ error: '表示名を入力してください' }, 400);
  await c.env.DB.prepare('UPDATE members SET name = ? WHERE id = ?').bind(name, c.get('member').id).run();
  return c.json({ ok: true, name });
});

/* ───────────────────────── カテゴリー ───────────────────────── */

app.get('/api/categories', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT cat.*, (SELECT COUNT(*) FROM episodes e WHERE e.category_id = cat.id AND e.status = 'published') AS episode_count
     FROM categories cat ORDER BY sort_order, id`,
  ).all();
  return c.json({ categories: results });
});

app.post('/api/admin/categories', async (c) => {
  const body = await c.req.json<{ name?: string; color?: string; sort_order?: number }>();
  const name = (body.name ?? '').trim().slice(0, 30);
  if (!name) return c.json({ error: 'カテゴリー名を入力してください' }, 400);
  const color = validColor(body.color) ?? '#E8630A';
  const sort = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;
  try {
    const r = await c.env.DB.prepare('INSERT INTO categories (name, color, sort_order, created_at) VALUES (?, ?, ?, ?)')
      .bind(name, color, sort, now())
      .run();
    return c.json({ ok: true, id: r.meta.last_row_id });
  } catch {
    return c.json({ error: '同じ名前のカテゴリーがあります' }, 409);
  }
});

app.put('/api/admin/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; color?: string; sort_order?: number }>();
  const name = (body.name ?? '').trim().slice(0, 30);
  if (!name) return c.json({ error: 'カテゴリー名を入力してください' }, 400);
  const color = validColor(body.color) ?? '#E8630A';
  const sort = Number.isFinite(body.sort_order) ? Number(body.sort_order) : 0;
  await c.env.DB.prepare('UPDATE categories SET name = ?, color = ?, sort_order = ? WHERE id = ?')
    .bind(name, color, sort, id)
    .run();
  return c.json({ ok: true });
});

app.delete('/api/admin/categories/:id', async (c) => {
  const id = Number(c.req.param('id'));
  // 紐づくエピソードは「未分類」に戻す
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE episodes SET category_id = NULL WHERE category_id = ?').bind(id),
    c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id),
  ]);
  return c.json({ ok: true });
});

/* ───────────────────────── エピソード ───────────────────────── */

const EPISODE_SELECT = `
  SELECT e.id, e.title, e.description, e.category_id, e.status, e.published_at, e.created_at, e.updated_at,
         e.duration_sec, e.audio_size, e.audio_content_type,
         (e.audio_key IS NOT NULL) AS has_audio,
         cat.name AS category_name, cat.color AS category_color,
         creator.name AS created_by_name,
         p.position_sec AS my_position_sec, p.max_position_sec AS my_max_position_sec,
         p.completed AS my_completed, p.last_played_at AS my_last_played_at,
         (SELECT COUNT(*) FROM plays px WHERE px.episode_id = e.id) AS listener_count,
         (SELECT COUNT(*) FROM plays px WHERE px.episode_id = e.id AND px.completed = 1) AS completed_count,
         (SELECT COUNT(*) FROM comments cm WHERE cm.episode_id = e.id AND cm.deleted_at IS NULL) AS comment_count
  FROM episodes e
  LEFT JOIN categories cat ON cat.id = e.category_id
  LEFT JOIN members creator ON creator.id = e.created_by
  LEFT JOIN plays p ON p.episode_id = e.id AND p.member_id = ?
`;

app.get('/api/episodes', async (c) => {
  const me = c.get('member');
  const isAdmin = c.get('isAdmin');
  const cat = c.req.query('category');
  const q = (c.req.query('q') ?? '').trim();
  const where: string[] = [];
  const binds: unknown[] = [me.id];

  if (!isAdmin || c.req.query('include_drafts') !== '1') where.push(`e.status = 'published'`);
  if (cat === 'none') where.push('e.category_id IS NULL');
  else if (cat) {
    where.push('e.category_id = ?');
    binds.push(Number(cat));
  }
  if (q) {
    where.push('(e.title LIKE ? OR e.description LIKE ?)');
    binds.push(`%${q}%`, `%${q}%`);
  }
  const sql = `${EPISODE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(e.published_at, e.created_at) DESC, e.id DESC LIMIT 500`;
  const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
  return c.json({ episodes: results });
});

app.get('/api/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('member');
  const ep = await c.env.DB.prepare(`${EPISODE_SELECT} WHERE e.id = ?`).bind(me.id, id).first<Record<string, unknown>>();
  if (!ep || (ep.status !== 'published' && !c.get('isAdmin'))) return c.json({ error: 'エピソードが見つかりません' }, 404);
  const { results: comments } = await c.env.DB.prepare(
    `SELECT cm.id, cm.body, cm.created_at, cm.member_id, m.name AS member_name
     FROM comments cm JOIN members m ON m.id = cm.member_id
     WHERE cm.episode_id = ? AND cm.deleted_at IS NULL ORDER BY cm.created_at ASC`,
  )
    .bind(id)
    .all();
  return c.json({ episode: ep, comments });
});

app.post('/api/admin/episodes', async (c) => {
  const body = await c.req.json<EpisodeInput>();
  const v = validateEpisode(body);
  if ('error' in v) return c.json({ error: v.error }, 400);
  const ts = now();
  const r = await c.env.DB.prepare(
    `INSERT INTO episodes (title, description, category_id, duration_sec, status, published_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'draft', NULL, ?, ?, ?)`,
  )
    .bind(v.title, v.description, v.category_id, v.duration_sec, c.get('member').id, ts, ts)
    .run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});

app.put('/api/admin/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<EpisodeInput & { status?: string }>();
  const v = validateEpisode(body);
  if ('error' in v) return c.json({ error: v.error }, 400);
  const cur = await c.env.DB.prepare('SELECT status, published_at, audio_key FROM episodes WHERE id = ?')
    .bind(id)
    .first<{ status: string; published_at: string | null; audio_key: string | null }>();
  if (!cur) return c.json({ error: 'エピソードが見つかりません' }, 404);

  let status = cur.status;
  let publishedAt = cur.published_at;
  if (body.status === 'published' || body.status === 'draft') {
    if (body.status === 'published' && !cur.audio_key) return c.json({ error: '音声ファイルをアップロードしてから公開してください' }, 400);
    status = body.status;
    if (status === 'published' && !publishedAt) publishedAt = now();
  }
  await c.env.DB.prepare(
    `UPDATE episodes SET title = ?, description = ?, category_id = ?, duration_sec = COALESCE(?, duration_sec),
       status = ?, published_at = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(v.title, v.description, v.category_id, v.duration_sec, status, publishedAt, now(), id)
    .run();
  return c.json({ ok: true, status });
});

app.delete('/api/admin/episodes/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await c.env.DB.prepare('SELECT audio_key FROM episodes WHERE id = ?').bind(id).first<{ audio_key: string | null }>();
  if (!cur) return c.json({ error: 'エピソードが見つかりません' }, 404);
  if (cur.audio_key) await c.env.AUDIO.delete(cur.audio_key);
  await c.env.DB.prepare('DELETE FROM episodes WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

/** 音声ファイルのアップロード（本文をそのまま R2 へストリーミング） */
app.put('/api/admin/episodes/:id/audio', async (c) => {
  const id = Number(c.req.param('id'));
  const ep = await c.env.DB.prepare('SELECT id, audio_key FROM episodes WHERE id = ?').bind(id).first<{ id: number; audio_key: string | null }>();
  if (!ep) return c.json({ error: 'エピソードが見つかりません' }, 404);

  const contentType = (c.req.header('Content-Type') ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_AUDIO.has(contentType)) return c.json({ error: `対応していない形式です (${contentType || '不明'})。mp3 / m4a / wav / ogg を使ってください` }, 415);
  const maxBytes = Number(c.env.MAX_UPLOAD_MB || 200) * 1024 * 1024;
  const declared = Number(c.req.header('Content-Length') ?? 0);
  if (declared > maxBytes) return c.json({ error: `ファイルが大きすぎます（上限 ${c.env.MAX_UPLOAD_MB || 200}MB）` }, 413);
  if (!c.req.raw.body) return c.json({ error: 'ファイルがありません' }, 400);

  const ext = extFor(contentType);
  const key = `episodes/${id}/${Date.now()}.${ext}`;
  const obj = await c.env.AUDIO.put(key, c.req.raw.body, { httpMetadata: { contentType } });
  if (!obj) return c.json({ error: '保存に失敗しました' }, 500);
  if (obj.size > maxBytes) {
    await c.env.AUDIO.delete(key);
    return c.json({ error: `ファイルが大きすぎます（上限 ${c.env.MAX_UPLOAD_MB || 200}MB）` }, 413);
  }
  const durationHeader = Number(c.req.header('X-Audio-Duration') ?? 0);
  await c.env.DB.prepare(
    `UPDATE episodes SET audio_key = ?, audio_content_type = ?, audio_size = ?, duration_sec = COALESCE(?, duration_sec), updated_at = ? WHERE id = ?`,
  )
    .bind(key, contentType, obj.size, durationHeader > 0 ? durationHeader : null, now(), id)
    .run();
  if (ep.audio_key && ep.audio_key !== key) await c.env.AUDIO.delete(ep.audio_key);
  return c.json({ ok: true, size: obj.size });
});

/** 音声の配信（Range 対応。ログイン済みメンバーのみ） */
app.get('/api/episodes/:id/audio', async (c) => {
  const id = Number(c.req.param('id'));
  const ep = await c.env.DB.prepare('SELECT audio_key, status FROM episodes WHERE id = ?')
    .bind(id)
    .first<{ audio_key: string | null; status: string }>();
  if (!ep || !ep.audio_key || (ep.status !== 'published' && !c.get('isAdmin'))) return c.text('Not found', 404);

  const rangeHeader = c.req.header('Range');
  const obj = await c.env.AUDIO.get(ep.audio_key, rangeHeader ? { range: c.req.raw.headers } : undefined);
  if (!obj) return c.text('Not found', 404);

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.set('ETag', obj.httpEtag);
  headers.set('Cache-Control', 'private, max-age=3600');

  if (obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    let start: number;
    let end: number;
    if (typeof r.suffix === 'number') {
      start = Math.max(0, obj.size - r.suffix);
      end = obj.size - 1;
    } else {
      start = r.offset ?? 0;
      end = typeof r.length === 'number' ? start + r.length - 1 : obj.size - 1;
    }
    headers.set('Content-Range', `bytes ${start}-${end}/${obj.size}`);
    headers.set('Content-Length', String(end - start + 1));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(obj.size));
  return new Response(obj.body, { status: 200, headers });
});

/* ───────────────────────── 再生履歴 ───────────────────────── */

app.post('/api/episodes/:id/progress', async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('member');
  const body = await c.req.json<{ position?: number; duration?: number; started?: boolean }>().catch(() => ({}) as Record<string, never>);
  const position = clampNum(body.position, 0, 1e7);
  const duration = clampNum(body.duration, 0, 1e7);
  const started = body.started ? 1 : 0;

  const ep = await c.env.DB.prepare('SELECT id, duration_sec, status FROM episodes WHERE id = ?')
    .bind(id)
    .first<{ id: number; duration_sec: number | null; status: string }>();
  if (!ep || (ep.status !== 'published' && !c.get('isAdmin'))) return c.json({ error: 'エピソードが見つかりません' }, 404);

  const effectiveDuration = duration || ep.duration_sec || 0;
  const completed = effectiveDuration > 0 && position >= effectiveDuration * COMPLETE_RATIO ? 1 : 0;
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO plays (episode_id, member_id, position_sec, max_position_sec, completed, play_count, first_played_at, last_played_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(episode_id, member_id) DO UPDATE SET
       position_sec = excluded.position_sec,
       max_position_sec = MAX(plays.max_position_sec, excluded.max_position_sec),
       completed = MAX(plays.completed, excluded.completed),
       play_count = plays.play_count + ?,
       last_played_at = excluded.last_played_at`,
  )
    .bind(id, me.id, position, position, completed, started, ts, ts, started)
    .run();
  if (duration > 0 && !ep.duration_sec) {
    await c.env.DB.prepare('UPDATE episodes SET duration_sec = ? WHERE id = ?').bind(duration, id).run();
  }
  return c.json({ ok: true, completed: completed === 1 });
});

/* ───────────────────────── コメント ───────────────────────── */

app.post('/api/episodes/:id/comments', async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('member');
  const body = await c.req.json<{ body?: string }>().catch(() => ({}) as { body?: string });
  const text = (body.body ?? '').trim().slice(0, 2000);
  if (!text) return c.json({ error: 'コメントを入力してください' }, 400);
  const ep = await c.env.DB.prepare('SELECT status FROM episodes WHERE id = ?').bind(id).first<{ status: string }>();
  if (!ep || (ep.status !== 'published' && !c.get('isAdmin'))) return c.json({ error: 'エピソードが見つかりません' }, 404);
  const ts = now();
  const r = await c.env.DB.prepare('INSERT INTO comments (episode_id, member_id, body, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, me.id, text, ts)
    .run();
  return c.json({ ok: true, comment: { id: r.meta.last_row_id, body: text, created_at: ts, member_id: me.id, member_name: me.name } });
});

app.delete('/api/comments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const me = c.get('member');
  const cm = await c.env.DB.prepare('SELECT member_id FROM comments WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ member_id: number }>();
  if (!cm) return c.json({ error: 'コメントが見つかりません' }, 404);
  if (cm.member_id !== me.id && !c.get('isAdmin')) return c.json({ error: '自分のコメントのみ削除できます' }, 403);
  await c.env.DB.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').bind(now(), id).run();
  return c.json({ ok: true });
});

/* ───────────────────────── 管理: 視聴状況 ───────────────────────── */

/** エピソードごとの視聴サマリー */
app.get('/api/admin/stats', async (c) => {
  const totalMembers = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM members').first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    `SELECT e.id, e.title, e.status, e.published_at, e.duration_sec, cat.name AS category_name, cat.color AS category_color,
            (SELECT COUNT(*) FROM plays p WHERE p.episode_id = e.id) AS listener_count,
            (SELECT COUNT(*) FROM plays p WHERE p.episode_id = e.id AND p.completed = 1) AS completed_count,
            (SELECT COUNT(*) FROM comments cm WHERE cm.episode_id = e.id AND cm.deleted_at IS NULL) AS comment_count
     FROM episodes e LEFT JOIN categories cat ON cat.id = e.category_id
     ORDER BY COALESCE(e.published_at, e.created_at) DESC, e.id DESC`,
  ).all();
  return c.json({ total_members: totalMembers?.n ?? 0, episodes: results });
});

/** 1エピソードについて、全メンバーの視聴状況（未再生の人も含む） */
app.get('/api/admin/episodes/:id/listeners', async (c) => {
  const id = Number(c.req.param('id'));
  const ep = await c.env.DB.prepare('SELECT id, title, duration_sec FROM episodes WHERE id = ?').bind(id).first();
  if (!ep) return c.json({ error: 'エピソードが見つかりません' }, 404);
  const { results } = await c.env.DB.prepare(
    `SELECT m.id AS member_id, m.name, m.email, m.role,
            p.position_sec, p.max_position_sec, p.completed, p.play_count, p.first_played_at, p.last_played_at
     FROM members m LEFT JOIN plays p ON p.member_id = m.id AND p.episode_id = ?
     ORDER BY (p.id IS NULL), p.completed DESC, p.last_played_at DESC, m.name`,
  )
    .bind(id)
    .all();
  return c.json({ episode: ep, listeners: results });
});

/** メンバーごとの視聴状況 */
app.get('/api/admin/members', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.name, m.email, m.role, m.created_at, m.last_seen_at,
            (SELECT COUNT(*) FROM plays p WHERE p.member_id = m.id) AS played_count,
            (SELECT COUNT(*) FROM plays p WHERE p.member_id = m.id AND p.completed = 1) AS completed_count,
            (SELECT COUNT(*) FROM comments cm WHERE cm.member_id = m.id AND cm.deleted_at IS NULL) AS comment_count,
            (SELECT MAX(p.last_played_at) FROM plays p WHERE p.member_id = m.id) AS last_played_at
     FROM members m ORDER BY m.name`,
  ).all();
  const published = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM episodes WHERE status = 'published'`).first<{ n: number }>();
  return c.json({ members: results, published_count: published?.n ?? 0 });
});

app.put('/api/admin/members/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const body = await c.req.json<{ name?: string; role?: string }>();
  const sets: string[] = [];
  const binds: unknown[] = [];
  if (typeof body.name === 'string' && body.name.trim()) {
    sets.push('name = ?');
    binds.push(body.name.trim().slice(0, 40));
  }
  if (body.role === 'admin' || body.role === 'member') {
    if (body.role === 'member' && id === c.get('member').id) return c.json({ error: '自分自身の管理者権限は外せません' }, 400);
    sets.push('role = ?');
    binds.push(body.role);
  }
  if (!sets.length) return c.json({ error: '変更内容がありません' }, 400);
  binds.push(id);
  await c.env.DB.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).bind(...binds).run();
  return c.json({ ok: true });
});

/** 視聴ログの CSV（全エピソード × 全メンバー） */
app.get('/api/admin/export.csv', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT e.id AS episode_id, e.title, cat.name AS category, m.name AS member, m.email,
            p.max_position_sec, e.duration_sec, p.completed, p.play_count, p.first_played_at, p.last_played_at
     FROM episodes e
     CROSS JOIN members m
     LEFT JOIN plays p ON p.episode_id = e.id AND p.member_id = m.id
     LEFT JOIN categories cat ON cat.id = e.category_id
     WHERE e.status = 'published'
     ORDER BY e.id, m.name`,
  ).all<Record<string, unknown>>();
  const header = ['episode_id', 'title', 'category', 'member', 'email', 'progress_percent', 'completed', 'play_count', 'first_played_at', 'last_played_at'];
  const rows = results.map((r) => {
    const dur = Number(r.duration_sec ?? 0);
    const pos = Number(r.max_position_sec ?? 0);
    // 聴了なら 100、それ以外は到達位置 / 長さ（長さ不明なら空欄）
    const pct = r.completed ? 100 : r.max_position_sec == null ? 0 : dur > 0 ? Math.min(99, Math.round((pos / dur) * 100)) : '';
    return [r.episode_id, r.title, r.category ?? '', r.member, r.email, pct, r.completed ? 1 : 0, r.play_count ?? 0, r.first_played_at ?? '', r.last_played_at ?? '']
      .map(csvCell)
      .join(',');
  });
  const csv = '﻿' + [header.join(','), ...rows].join('\r\n');
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audio-listening-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Not found' }, 404) : c.env.ASSETS.fetch(c.req.raw)));
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'サーバーでエラーが起きました。時間をおいて再度お試しください' }, 500);
});

export default app;

/* ───────────────────────── helpers ───────────────────────── */

interface EpisodeInput {
  title?: string;
  description?: string;
  category_id?: number | null;
  duration_sec?: number | null;
}

function validateEpisode(b: EpisodeInput): { title: string; description: string; category_id: number | null; duration_sec: number | null } | { error: string } {
  const title = (b.title ?? '').trim().slice(0, 120);
  if (!title) return { error: 'タイトルを入力してください' };
  const description = (b.description ?? '').trim().slice(0, 5000);
  const category_id = b.category_id == null || b.category_id === 0 ? null : Number(b.category_id);
  const duration_sec = typeof b.duration_sec === 'number' && b.duration_sec > 0 ? b.duration_sec : null;
  return { title, description, category_id: Number.isFinite(category_id as number) ? category_id : null, duration_sec };
}

function validColor(s?: string): string | null {
  return typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

function clampNum(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function extFor(ct: string): string {
  if (ct === 'audio/mpeg' || ct === 'audio/mp3') return 'mp3';
  if (ct === 'audio/mp4' || ct === 'audio/x-m4a' || ct === 'audio/m4a' || ct === 'audio/aac') return 'm4a';
  if (ct === 'audio/wav' || ct === 'audio/x-wav') return 'wav';
  if (ct === 'audio/ogg') return 'ogg';
  if (ct === 'audio/webm') return 'webm';
  return 'bin';
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function publicMember(m: Member) {
  return { id: m.id, email: m.email, name: m.name, role: m.role };
}

export type { Ctx };
