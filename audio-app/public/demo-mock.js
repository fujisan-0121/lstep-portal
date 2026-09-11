/* デモ用モック API。
 * Cloudflare なしで画面を確認するためのもの。データはブラウザの localStorage に保存され、
 * 音声は Web Audio で合成した短い音（約 30 秒）で代用する。本番では読み込まない。 */
(() => {
  'use strict';
  const KEY = 'audio_demo_v2';
  const now = () => new Date().toISOString();
  const ago = (days, hours = 0) => new Date(Date.now() - days * 86400000 - hours * 3600000).toISOString();
  const DEMO_DURATION = 32;

  function seed() {
    const members = [
      { id: 1, email: 'fujiwara@example.co.jp', name: '藤原', role: 'admin', created_at: ago(60), last_seen_at: ago(0, 1) },
      { id: 2, email: 'yonai@example.co.jp', name: '米内', role: 'member', created_at: ago(58), last_seen_at: ago(0, 3) },
      { id: 3, email: 'tanji@example.co.jp', name: '丹司', role: 'member', created_at: ago(58), last_seen_at: ago(1) },
      { id: 4, email: 'kurosaki@example.co.jp', name: '黒崎', role: 'member', created_at: ago(40), last_seen_at: ago(2) },
      { id: 5, email: 'sato@example.co.jp', name: '佐藤', role: 'member', created_at: ago(20), last_seen_at: ago(5) },
      { id: 6, email: 'ikezawa@example.co.jp', name: '池沢', role: 'member', created_at: ago(10), last_seen_at: ago(9) },
    ];
    const categories = [
      { id: 1, name: '全体朝礼', color: '#F8B800', sort_order: 1, created_at: ago(60) },
      { id: 2, name: '社長メッセージ', color: '#009098', sort_order: 2, created_at: ago(60) },
      { id: 3, name: '営業', color: '#E07A1F', sort_order: 3, created_at: ago(60) },
      { id: 4, name: '研修', color: '#5B4B8A', sort_order: 4, created_at: ago(60) },
      { id: 5, name: 'その他', color: '#7C8A8B', sort_order: 9, created_at: ago(60) },
    ];
    const ep = (id, title, category_id, description, days, status = 'published') => ({
      id, title, description, category_id, audio_key: `demo/${id}`, audio_content_type: 'audio/wav', audio_size: 1400000,
      duration_sec: DEMO_DURATION, status, published_at: status === 'published' ? ago(days) : null, created_by: 1, created_at: ago(days), updated_at: ago(days),
    });
    const episodes = [
      ep(1, '9月 全体朝礼：下期の重点テーマ「仕組み化で属人化をなくす」', 1, '下期に向けて、各部署で「人が変わっても回る仕組み」を1つずつ作る取り組みを始めます。朝礼で話した内容の録音です。\n\n・なぜ今、仕組み化なのか\n・各部署に期待すること\n・10月の中間共有会について', 1),
      ep(2, '社長メッセージ：お客様の「困った」に最初に気づく人であれ', 2, '先週のお客様訪問で感じたことを話しています。現場の一言が売上より大事、という話。', 4),
      ep(3, '営業共有：LINE公式アカウント提案の型（ヒアリングから見積までの流れ）', 3, 'ヒアリングメモから提案書・見積を作るまでの標準的な流れを説明しています。新しく入ったメンバーは最初に聴いてください。\n\n関連資料: 提案書テンプレート（社内共有フォルダ）', 8),
      ep(4, '研修：議事録DBの使い方（Notta → Notion 同期の基本）', 4, '議事録が自動で Notion に入る仕組みの概要と、手元で気をつけることを解説。', 12),
      ep(5, '8月 全体朝礼：上期ふりかえりと感謝', 1, '上期の数字と、特に頑張ってくれたプロジェクトについて。', 31),
      ep(6, '営業共有：失注案件からの学び（3件）', 3, '最近の失注3件を振り返り、次に活かすポイントを整理しました。責めるためではなく、型をアップデートするためのふりかえりです。', 18),
      ep(7, '雑談回：AIを使いはじめて変わった1日の過ごし方', 5, '肩の力を抜いて聴いてください。朝のルーティンにAIを組み込んだら、何が変わったか。', 25),
      ep(8, '10月 全体朝礼（収録済み・公開前）', 1, '10月の朝礼を事前収録しました。10/1 に公開予定。', 0, 'draft'),
    ];
    const play = (episode_id, member_id, ratio, count, days) => ({
      id: episode_id * 100 + member_id, episode_id, member_id,
      position_sec: Math.round(DEMO_DURATION * ratio), max_position_sec: Math.round(DEMO_DURATION * ratio),
      completed: ratio >= 0.9 ? 1 : 0, play_count: count, first_played_at: ago(days, 2), last_played_at: ago(days),
    });
    const plays = [
      play(1, 1, 1, 1, 0), play(1, 2, 1, 2, 0), play(1, 3, 0.45, 1, 0), play(1, 4, 1, 1, 1),
      play(2, 1, 1, 1, 3), play(2, 2, 1, 1, 3), play(2, 3, 1, 1, 2), play(2, 4, 0.3, 1, 3), play(2, 5, 1, 1, 2),
      play(3, 1, 1, 1, 7), play(3, 2, 1, 3, 6), play(3, 5, 0.62, 2, 5), play(3, 6, 0.15, 1, 4),
      play(4, 2, 1, 1, 11), play(4, 3, 1, 1, 10), play(4, 4, 1, 1, 10), play(4, 5, 1, 1, 9), play(4, 6, 1, 2, 8),
      play(5, 1, 1, 1, 30), play(5, 2, 1, 1, 30), play(5, 3, 1, 1, 29), play(5, 4, 1, 1, 29), play(5, 5, 1, 1, 28),
      play(6, 2, 1, 1, 17), play(6, 3, 0.8, 1, 16), play(6, 4, 1, 1, 15),
      play(7, 2, 1, 1, 24), play(7, 6, 0.5, 1, 20),
    ];
    const comments = [
      { id: 1, episode_id: 1, member_id: 2, body: '「人が変わっても回る仕組み」、まず自分の引き継ぎ資料から見直します。10月の共有会までに1つ作ります。', created_at: ago(0, 20), deleted_at: null },
      { id: 2, episode_id: 1, member_id: 4, body: '質問です。仕組み化の対象は業務フローだけですか？ お客様対応のトーク集なども含めてよいでしょうか。', created_at: ago(0, 18), deleted_at: null },
      { id: 3, episode_id: 1, member_id: 1, body: 'トーク集も大歓迎です。むしろ属人化しやすいところから優先で。', created_at: ago(0, 16), deleted_at: null },
      { id: 4, episode_id: 2, member_id: 5, body: '訪問先で「実は困っていて」と言われた話、自分も先週ありました。次回の営業共有で話します。', created_at: ago(2), deleted_at: null },
      { id: 5, episode_id: 3, member_id: 6, body: '入社したばかりなので助かります。見積の項目についてもう少し詳しい回があると嬉しいです。', created_at: ago(4), deleted_at: null },
      { id: 6, episode_id: 6, member_id: 3, body: '2件目の失注、価格ではなく「意思決定者に会えていなかった」が本質だと思いました。', created_at: ago(15), deleted_at: null },
    ];
    return { members, categories, episodes, plays, comments, seq: 1000, currentMemberId: 1 };
  }

  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; }
  if (!db || !db.episodes) db = seed();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* noop */ } };
  const nextId = () => ++db.seq;
  const me = () => db.members.find((m) => m.id === db.currentMemberId) || db.members[0];
  const isAdmin = () => me().role === 'admin';

  const respond = (data, status = 200) => Promise.resolve({ ok: status < 400, status, json: async () => data });
  const err = (msg, status) => respond({ error: msg }, status);
  const parse = (init) => { try { return init && init.body ? JSON.parse(init.body) : {}; } catch (e) { return {}; } };

  function decorate(e, memberId) {
    const cat = db.categories.find((c) => c.id === e.category_id);
    const p = db.plays.find((x) => x.episode_id === e.id && x.member_id === memberId);
    const creator = db.members.find((m) => m.id === e.created_by);
    return {
      id: e.id, title: e.title, description: e.description, category_id: e.category_id, status: e.status, published_at: e.published_at,
      created_at: e.created_at, updated_at: e.updated_at, duration_sec: e.duration_sec, audio_size: e.audio_size, audio_content_type: e.audio_content_type,
      has_audio: e.audio_key ? 1 : 0, category_name: cat ? cat.name : null, category_color: cat ? cat.color : null, created_by_name: creator ? creator.name : null,
      my_position_sec: p ? p.position_sec : null, my_max_position_sec: p ? p.max_position_sec : null, my_completed: p ? p.completed : null, my_last_played_at: p ? p.last_played_at : null,
      listener_count: db.plays.filter((x) => x.episode_id === e.id).length,
      completed_count: db.plays.filter((x) => x.episode_id === e.id && x.completed).length,
      comment_count: db.comments.filter((x) => x.episode_id === e.id && !x.deleted_at).length,
    };
  }
  const sortEps = (list) => list.slice().sort((a, b) => (b.published_at || b.created_at).localeCompare(a.published_at || a.created_at) || b.id - a.id);

  window.demoFetch = function demoFetch(path, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    const [p, qs] = path.split('?');
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    const seg = p.replace(/^\/api\//, '').split('/');
    const body = parse(init);
    const user = me();
    const admin = isAdmin();
    const m = (pattern) => { const r = pattern.exec(p); return r ? r.slice(1).map(Number) : null; };
    let a;

    if (p === '/api/me' && method === 'GET') return respond({ member: { id: user.id, email: user.email, name: user.name, role: user.role }, isAdmin: admin });
    if (p === '/api/me' && method === 'PUT') { const name = (body.name || '').trim().slice(0, 40); if (!name) return err('表示名を入力してください', 400); user.name = name; save(); return respond({ ok: true, name }); }

    if (p === '/api/categories') return respond({ categories: db.categories.slice().sort((x, y) => x.sort_order - y.sort_order || x.id - y.id).map((c) => ({ ...c, episode_count: db.episodes.filter((e) => e.category_id === c.id && e.status === 'published').length })) });

    if (seg[0] === 'admin' && !admin) return err('管理者のみ操作できます', 403);

    if (p === '/api/admin/categories' && method === 'POST') {
      const name = (body.name || '').trim(); if (!name) return err('カテゴリー名を入力してください', 400);
      if (db.categories.some((c) => c.name === name)) return err('同じ名前のカテゴリーがあります', 409);
      const id = nextId(); db.categories.push({ id, name, color: body.color || '#F8B800', sort_order: Number(body.sort_order) || 0, created_at: now() }); save(); return respond({ ok: true, id });
    }
    if ((a = m(/^\/api\/admin\/categories\/(\d+)$/))) {
      const c = db.categories.find((x) => x.id === a[0]); if (!c) return err('見つかりません', 404);
      if (method === 'PUT') { c.name = (body.name || c.name).trim(); c.color = body.color || c.color; c.sort_order = Number(body.sort_order) || 0; save(); return respond({ ok: true }); }
      if (method === 'DELETE') { db.episodes.forEach((e) => { if (e.category_id === c.id) e.category_id = null; }); db.categories = db.categories.filter((x) => x.id !== c.id); save(); return respond({ ok: true }); }
    }

    if (p === '/api/episodes' && method === 'GET') {
      let list = db.episodes.filter((e) => e.status === 'published' || (admin && q.include_drafts === '1'));
      if (q.category === 'none') list = list.filter((e) => !e.category_id); else if (q.category) list = list.filter((e) => e.category_id === Number(q.category));
      if (q.q) list = list.filter((e) => (e.title + e.description).includes(q.q));
      return respond({ episodes: sortEps(list).map((e) => decorate(e, user.id)) });
    }
    if ((a = m(/^\/api\/episodes\/(\d+)$/)) && method === 'GET') {
      const e = db.episodes.find((x) => x.id === a[0]); if (!e || (e.status !== 'published' && !admin)) return err('エピソードが見つかりません', 404);
      const comments = db.comments.filter((c) => c.episode_id === e.id && !c.deleted_at).map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, member_id: c.member_id, member_name: (db.members.find((x) => x.id === c.member_id) || {}).name || '不明' }));
      return respond({ episode: decorate(e, user.id), comments });
    }
    if ((a = m(/^\/api\/episodes\/(\d+)\/progress$/)) && method === 'POST') {
      const e = db.episodes.find((x) => x.id === a[0]); if (!e) return err('見つかりません', 404);
      const position = Number(body.position) || 0, duration = Number(body.duration) || e.duration_sec || 0;
      const completed = duration > 0 && position >= duration * 0.9 ? 1 : 0;
      let pl = db.plays.find((x) => x.episode_id === e.id && x.member_id === user.id);
      if (!pl) { pl = { id: nextId(), episode_id: e.id, member_id: user.id, position_sec: 0, max_position_sec: 0, completed: 0, play_count: 0, first_played_at: now(), last_played_at: now() }; db.plays.push(pl); }
      pl.position_sec = position; pl.max_position_sec = Math.max(pl.max_position_sec, position); pl.completed = Math.max(pl.completed, completed); pl.play_count += body.started ? 1 : 0; pl.last_played_at = now();
      save(); return respond({ ok: true, completed: completed === 1 });
    }
    if ((a = m(/^\/api\/episodes\/(\d+)\/comments$/)) && method === 'POST') {
      const text = (body.body || '').trim().slice(0, 2000); if (!text) return err('コメントを入力してください', 400);
      const c = { id: nextId(), episode_id: a[0], member_id: user.id, body: text, created_at: now(), deleted_at: null }; db.comments.push(c); save();
      return respond({ ok: true, comment: { id: c.id, body: c.body, created_at: c.created_at, member_id: user.id, member_name: user.name } });
    }
    if ((a = m(/^\/api\/comments\/(\d+)$/)) && method === 'DELETE') {
      const c = db.comments.find((x) => x.id === a[0] && !x.deleted_at); if (!c) return err('コメントが見つかりません', 404);
      if (c.member_id !== user.id && !admin) return err('自分のコメントのみ削除できます', 403);
      c.deleted_at = now(); save(); return respond({ ok: true });
    }

    if (p === '/api/admin/episodes' && method === 'POST') {
      const title = (body.title || '').trim(); if (!title) return err('タイトルを入力してください', 400);
      const id = nextId(); db.episodes.push({ id, title, description: (body.description || '').trim(), category_id: body.category_id || null, audio_key: null, audio_content_type: null, audio_size: null, duration_sec: body.duration_sec || null, status: 'draft', published_at: null, created_by: user.id, created_at: now(), updated_at: now() });
      save(); return respond({ ok: true, id });
    }
    if ((a = m(/^\/api\/admin\/episodes\/(\d+)$/))) {
      const e = db.episodes.find((x) => x.id === a[0]); if (!e) return err('エピソードが見つかりません', 404);
      if (method === 'PUT') {
        if (body.status === 'published' && !e.audio_key) return err('音声ファイルをアップロードしてから公開してください', 400);
        e.title = (body.title || e.title).trim(); e.description = (body.description ?? e.description).trim(); e.category_id = body.category_id || null; if (body.duration_sec) e.duration_sec = body.duration_sec;
        if (body.status === 'published' || body.status === 'draft') { e.status = body.status; if (e.status === 'published' && !e.published_at) e.published_at = now(); }
        e.updated_at = now(); save(); return respond({ ok: true, status: e.status });
      }
      if (method === 'DELETE') { db.episodes = db.episodes.filter((x) => x.id !== e.id); db.plays = db.plays.filter((x) => x.episode_id !== e.id); db.comments = db.comments.filter((x) => x.episode_id !== e.id); save(); return respond({ ok: true }); }
    }
    if (p === '/api/admin/stats') {
      return respond({ total_members: db.members.length, episodes: sortEps(db.episodes).map((e) => { const d = decorate(e, user.id); return { id: e.id, title: e.title, status: e.status, published_at: e.published_at, duration_sec: e.duration_sec, category_name: d.category_name, category_color: d.category_color, listener_count: d.listener_count, completed_count: d.completed_count, comment_count: d.comment_count }; }) });
    }
    if ((a = m(/^\/api\/admin\/episodes\/(\d+)\/listeners$/))) {
      const e = db.episodes.find((x) => x.id === a[0]); if (!e) return err('見つかりません', 404);
      const listeners = db.members.map((mb) => { const pl = db.plays.find((x) => x.episode_id === e.id && x.member_id === mb.id); return { member_id: mb.id, name: mb.name, email: mb.email, role: mb.role, position_sec: pl ? pl.position_sec : null, max_position_sec: pl ? pl.max_position_sec : null, completed: pl ? pl.completed : null, play_count: pl ? pl.play_count : null, first_played_at: pl ? pl.first_played_at : null, last_played_at: pl ? pl.last_played_at : null }; })
        .sort((x, y) => (x.last_played_at ? 0 : 1) - (y.last_played_at ? 0 : 1) || (y.completed || 0) - (x.completed || 0) || String(y.last_played_at).localeCompare(String(x.last_played_at)));
      return respond({ episode: { id: e.id, title: e.title, duration_sec: e.duration_sec }, listeners });
    }
    if (p === '/api/admin/members' && method === 'GET') {
      return respond({ published_count: db.episodes.filter((e) => e.status === 'published').length, members: db.members.map((mb) => { const pls = db.plays.filter((x) => x.member_id === mb.id); return { ...mb, played_count: pls.length, completed_count: pls.filter((x) => x.completed).length, comment_count: db.comments.filter((x) => x.member_id === mb.id && !x.deleted_at).length, last_played_at: pls.map((x) => x.last_played_at).sort().pop() || null }; }) });
    }
    if ((a = m(/^\/api\/admin\/members\/(\d+)$/)) && method === 'PUT') {
      const mb = db.members.find((x) => x.id === a[0]); if (!mb) return err('見つかりません', 404);
      if (body.role === 'member' && mb.id === user.id) return err('自分自身の管理者権限は外せません', 400);
      if (body.role) mb.role = body.role; if (body.name) mb.name = body.name.trim(); save(); return respond({ ok: true });
    }
    return err('Not found', 404);
  };

  /* アップロードのふり（実ファイルは保存せず、合成音声で代用） */
  window.demoUpload = function demoUpload(id, file, duration, onProgress) {
    return new Promise((resolve) => {
      let p = 0;
      const t = setInterval(() => { p = Math.min(1, p + 0.12); onProgress(p); if (p >= 1) { clearInterval(t); const e = db.episodes.find((x) => x.id === id); if (e) { e.audio_key = `demo/${id}`; e.audio_content_type = file.type || 'audio/wav'; e.audio_size = file.size; e.duration_sec = duration || DEMO_DURATION; } urlCache.set(id, URL.createObjectURL(file)); save(); resolve({ ok: true }); } }, 120);
    });
  };

  /* 合成音声（エピソードごとに音程を変えた、静かなチャイム風の音）。デモ内で録音・アップロードしたものは実際の音声を使う */
  const urlCache = new Map();
  window.demoUrlCache = urlCache;
  window.demoAudioUrl = function demoAudioUrl(ep) {
    if (urlCache.has(ep.id)) return urlCache.get(ep.id);
    const rate = 22050, sec = DEMO_DURATION, n = rate * sec;
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
    const base = 196 * Math.pow(2, ((ep.id * 5) % 12) / 12);
    const scale = [0, 2, 4, 7, 9, 12, 14];
    let seedv = ep.id * 7919;
    const rnd = () => { seedv = (seedv * 1103515245 + 12345) & 0x7fffffff; return seedv / 0x7fffffff; };
    const notes = Array.from({ length: sec * 2 }, () => base * Math.pow(2, scale[Math.floor(rnd() * scale.length)] / 12));
    for (let i = 0; i < n; i++) {
      const t = i / rate, idx = Math.floor(t * 2), local = (t * 2) % 1;
      const env = Math.exp(-local * 3) * (1 - Math.exp(-local * 60));
      const f = notes[idx];
      const s = (Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(2 * Math.PI * f * 2 * t) * 0.25 + Math.sin(2 * Math.PI * f * 3 * t) * 0.1) * env * 0.35;
      const fade = Math.min(1, t / 0.5, (sec - t) / 1.5);
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * fade)) * 32767, true);
    }
    const url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    urlCache.set(ep.id, url);
    return url;
  };

  /* デモ用: ユーザー切り替えとリセット */
  window.demoSwitchUser = function (id) { db.currentMemberId = Number(id); save(); location.hash = '#/'; window.audioApp.reload(); };
  window.demoReset = function () { localStorage.removeItem(KEY); db = seed(); location.hash = '#/'; window.audioApp.reload(); };
  window.demoMembers = () => db.members.map((m) => ({ id: m.id, name: m.name, role: m.role }));
  window.__DEMO__ = true;
})();
