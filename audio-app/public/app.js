/* 社内音声配信 — フロントエンド（ビルド不要の素の JavaScript） */
(() => {
  'use strict';

  /* ───────── ユーティリティ ───────── */
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const fmtTime = (sec) => {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  };
  const fmtDur = (sec) => {
    sec = Number(sec) || 0;
    if (!sec) return '';
    const m = Math.round(sec / 60);
    return m < 1 ? `${Math.round(sec)}秒` : m < 60 ? `${m}分` : `${Math.floor(m / 60)}時間${m % 60}分`;
  };
  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${fmtDate(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const relDate = (iso) => {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'たった今';
    if (diff < 3600) return `${Math.floor(diff / 60)}分前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}時間前`;
    if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}日前`;
    return fmtDate(iso);
  };
  const pct = (ep) => {
    const dur = Number(ep.duration_sec) || 0, pos = Number(ep.my_max_position_sec) || 0;
    if (ep.my_completed) return 100;
    return dur > 0 ? Math.min(99, Math.round((pos / dur) * 100)) : 0;
  };
  const statusPill = (ep) => {
    if (ep.my_completed) return '<span class="pill done">聴了</span>';
    if (ep.my_last_played_at) return `<span class="pill partial">${pct(ep)}% まで</span>`;
    return '<span class="pill none">未再生</span>';
  };
  const initial = (name) => esc((name || '?').trim().charAt(0));
  const catPill = (ep) => ep.category_name ? `<span class="pill"><span class="dot" style="background:${esc(ep.category_color || '#F8B800')}"></span>${esc(ep.category_name)}</span>` : '<span class="pill none">未分類</span>';

  let toastTimer;
  const toast = (msg, err = false) => {
    const el = $('#toast');
    el.textContent = msg;
    el.className = 'toast on' + (err ? ' err' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.className = 'toast'), 2600);
  };

  /* ───────── API ───────── */
  async function api(path, opts = {}) {
    const init = { ...opts };
    if (init.json !== undefined) {
      init.body = JSON.stringify(init.json);
      init.headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
      delete init.json;
    }
    const res = await (window.__DEMO__ ? window.demoFetch(path, init) : fetch(path, init));
    if (res.status === 401) {
      $('#login').hidden = false;
      throw new Error('ログインが必要です');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `エラーが起きました (${res.status})`);
    return data;
  }

  /* ───────── 状態 ───────── */
  const state = { me: null, isAdmin: false, categories: [], episodes: [], route: { name: 'home' } };

  /* ───────── プレイヤー ───────── */
  const audio = new Audio();
  audio.preload = 'metadata';
  const player = {
    ep: null,
    speeds: [1, 1.25, 1.5, 2],
    speedIdx: (() => { try { const i = Number(localStorage.getItem('audio_speed_idx')); return i >= 0 && i < 4 ? i : 0; } catch (e) { return 0; } })(),
    lastSent: 0,
    seeking: false,
    async load(ep, autoplay = true) {
      if (this.ep && this.ep.id === ep.id) {
        if (autoplay) this.toggle();
        return;
      }
      if (this.ep) await this.report(false);
      this.ep = ep;
      $('#player').classList.add('on');
      $('#p-cat').textContent = ep.category_name || '未分類';
      $('#p-title').textContent = ep.title;
      $('#p-seek').value = 0;
      $('#p-cur').textContent = '0:00';
      $('#p-dur').textContent = fmtTime(ep.duration_sec);
      audio.src = window.__DEMO__ ? window.demoAudioUrl(ep) : `/api/episodes/${ep.id}/audio`;
      const resume = Number(ep.my_position_sec) || 0;
      const dur = Number(ep.duration_sec) || 0;
      const shouldResume = resume > 5 && (!dur || resume < dur * 0.9);
      audio.playbackRate = this.speeds[this.speedIdx];
      const onMeta = () => {
        if (shouldResume) audio.currentTime = resume;
        audio.removeEventListener('loadedmetadata', onMeta);
      };
      audio.addEventListener('loadedmetadata', onMeta);
      if (autoplay) {
        try { await audio.play(); } catch (e) { /* 自動再生がブロックされた場合はユーザー操作を待つ */ }
      }
      if (shouldResume) toast(`${fmtTime(resume)} から再開します`);
      this.started = true;
      this.renderState();
      renderRoute(false);
    },
    toggle() {
      if (!this.ep) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    },
    skip(sec) {
      if (!this.ep) return;
      audio.currentTime = Math.max(0, Math.min((audio.duration || 0) || Infinity, audio.currentTime + sec));
    },
    setSpeed(idx) {
      this.speedIdx = idx;
      audio.playbackRate = this.speeds[idx];
      try { localStorage.setItem('audio_speed_idx', String(idx)); } catch (e) { /* noop */ }
      this.renderSpeed();
      toast(`再生速度 ${this.speeds[idx]}×`);
    },
    renderSpeed() {
      $('#p-speed').textContent = `${this.speeds[this.speedIdx]}×`;
      document.querySelectorAll('#speed-menu button').forEach((b) => b.classList.toggle('active', Number(b.dataset.speed) === this.speedIdx));
    },
    toggleSpeedMenu(force) {
      const menu = $('#speed-menu');
      const open = force !== undefined ? force : menu.hidden;
      menu.hidden = !open;
      $('#p-speed').classList.toggle('open', open);
    },
    async close() {
      if (!this.ep) return;
      await this.report(false);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      this.ep = null;
      $('#player').classList.remove('on');
      renderRoute(false);
    },
    renderState() {
      const playing = this.ep && !audio.paused;
      $('#p-play').innerHTML = playing ? ICON.pause : ICON.play;
      document.querySelectorAll('[data-play]').forEach((b) => {
        const isCur = this.ep && Number(b.dataset.play) === this.ep.id;
        b.innerHTML = isCur && playing ? ICON.pause : ICON.play;
        const row = b.closest('.ep-row, .ep-card, .ep-head');
        if (row) row.classList.toggle('playing', !!isCur);
      });
    },
    async report(started, keepalive = false) {
      if (!this.ep) return;
      const position = audio.currentTime || 0;
      const duration = isFinite(audio.duration) ? audio.duration : (Number(this.ep.duration_sec) || 0);
      const ep = this.ep;
      try {
        const r = await api(`/api/episodes/${ep.id}/progress`, { method: 'POST', json: { position, duration, started }, keepalive });
        // ローカル状態にも反映（一覧の進捗表示用）
        const patch = (e) => {
          if (!e || e.id !== ep.id) return;
          e.my_position_sec = position;
          e.my_max_position_sec = Math.max(Number(e.my_max_position_sec) || 0, position);
          e.my_last_played_at = new Date().toISOString();
          if (!e.duration_sec && duration) e.duration_sec = duration;
          if (r.completed && !e.my_completed) { e.my_completed = 1; e.listener_count = e.listener_count; }
        };
        patch(ep);
        state.episodes.forEach(patch);
        if (state.detail && state.detail.episode) patch(state.detail.episode);
        this.lastSent = Date.now();
      } catch (e) { /* 通信失敗時は次回に再送 */ }
    },
  };
  audio.addEventListener('play', () => {
    player.renderState();
    if (player.started) { player.report(true); player.started = false; }
  });
  audio.addEventListener('pause', () => { player.renderState(); player.report(false); });
  audio.addEventListener('ended', async () => {
    player.renderState();
    await player.report(false);
    toast('最後まで聴きました');
    renderRoute(false);
  });
  audio.addEventListener('timeupdate', () => {
    if (!player.ep || player.seeking) return;
    const dur = audio.duration || Number(player.ep.duration_sec) || 0;
    if (dur) $('#p-seek').value = (audio.currentTime / dur) * 1000;
    $('#p-cur').textContent = fmtTime(audio.currentTime);
    if (isFinite(audio.duration)) $('#p-dur').textContent = fmtTime(audio.duration);
    if (!audio.paused && Date.now() - player.lastSent > 15000) player.report(false);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && player.ep && !audio.paused) player.report(false, true); });
  window.addEventListener('pagehide', () => { if (player.ep) player.report(false, true); });

  const ICON = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>',
    mic: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
    stop: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  };

  /* ───────── ルーティング ───────── */
  function parseRoute() {
    const hash = location.hash.replace(/^#\/?/, '');
    const [path, qs] = hash.split('?');
    const seg = path.split('/').filter(Boolean);
    const q = Object.fromEntries(new URLSearchParams(qs || ''));
    if (seg[0] === 'archive') return { name: 'archive', cat: seg[1] || '', q: q.q || '' };
    if (seg[0] === 'episode' && seg[1]) return { name: 'episode', id: Number(seg[1]) };
    if (seg[0] === 'admin') return { name: 'admin', tab: seg[1] || 'episodes', id: seg[2] ? Number(seg[2]) : null };
    return { name: 'home' };
  }
  const go = (hash) => { location.hash = hash; };

  async function renderRoute(reload = true) {
    state.route = parseRoute();
    const r = state.route;
    document.querySelectorAll('.nav-item').forEach((n) => {
      const key = n.dataset.nav;
      n.classList.toggle('active', key === r.name || (r.name === 'archive' && key === `cat:${r.cat}`) || (r.name === 'archive' && key === 'archive' && !r.cat));
    });
    if (r.name === 'admin' && !state.isAdmin) { go('/'); return; }
    try {
      if (r.name === 'home') await renderHome(reload);
      else if (r.name === 'archive') await renderArchive(reload);
      else if (r.name === 'episode') await renderEpisode(reload);
      else if (r.name === 'admin') await renderAdmin(reload);
    } catch (e) {
      $('#main').innerHTML = `<div class="page"><div class="card empty"><b>読み込めませんでした</b>${esc(e.message)}</div></div>`;
    }
    player.renderState();
    window.scrollTo({ top: reload ? 0 : window.scrollY });
  }

  async function loadEpisodes(params = {}) {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.q) qs.set('q', params.q);
    if (params.include_drafts) qs.set('include_drafts', '1');
    const data = await api(`/api/episodes${qs.toString() ? '?' + qs : ''}`);
    state.episodes = data.episodes;
    return data.episodes;
  }
  async function loadCategories() {
    state.categories = (await api('/api/categories')).categories;
    renderNav();
  }

  /* ───────── ナビ ───────── */
  function renderNav() {
    const cats = state.categories.map((c) => `
      <a class="nav-item" href="#/archive/${c.id}" data-nav="cat:${c.id}">
        <span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}<span class="cnt num">${c.episode_count || 0}</span>
      </a>`).join('');
    $('#nav').innerHTML = `
      <a class="nav-item" href="#/" data-nav="home">${NAV_ICON.home}ホーム</a>
      <a class="nav-item" href="#/archive" data-nav="archive">${NAV_ICON.archive}アーカイブ<span class="cnt num">${state.categories.reduce((a, c) => a + (c.episode_count || 0), 0)}</span></a>
      <div class="nav-label">カテゴリー</div>
      ${cats}
      ${state.isAdmin ? `<div class="nav-label">管理者</div><button class="quick-rec" type="button" data-quick-record="">${ICON.mic}<span>録音して配信</span></button><a class="nav-item" href="#/admin" data-nav="admin">${NAV_ICON.admin}配信管理・視聴状況</a>` : ''}
    `;
    $('#me').innerHTML = state.me ? `<b>${esc(state.me.name)}</b>${state.isAdmin ? '<span class="pill admin" style="margin:4px 0">管理者</span><br>' : ''}<span>${esc(state.me.email)}</span><br><button id="rename">表示名を変更</button>` : '';
    if (window.__DEMO__ && state.me) {
      const opts = window.demoMembers().map((m) => `<option value="${m.id}" ${m.id === state.me.id ? 'selected' : ''}>${esc(m.name)}${m.role === 'admin' ? '（管理者）' : ''}</option>`).join('');
      $('#me').insertAdjacentHTML('beforeend', `<div style="margin-top:10px;padding-top:10px;border-top:1px dashed rgba(255,255,255,.15)"><div style="font-size:10px;letter-spacing:.14em;color:var(--orange-l);margin-bottom:4px">デモ: ユーザーを切り替え</div><select class="select" id="demo-user" style="padding:5px 8px;font-size:12px;background:var(--navy-mid);color:#fff;border-color:rgba(255,255,255,.2)">${opts}</select><button id="demo-reset" style="margin-top:6px;color:rgba(255,255,255,.5)">デモデータを初期化</button></div>`);
      $('#demo-user').addEventListener('change', (e) => window.demoSwitchUser(e.target.value));
      $('#demo-reset').addEventListener('click', () => { if (confirm('デモデータを初期状態に戻しますか？')) window.demoReset(); });
    }
  }
  const NAV_ICON = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    archive: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7h18v13H3zM3 4h18v3H3zM10 11h4"/></svg>',
    admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  };

  /* ───────── 画面: ホーム ───────── */
  async function renderHome(reload) {
    if (reload || !state.episodes.length) await loadEpisodes();
    const eps = state.episodes;
    const inProgress = eps.filter((e) => e.my_last_played_at && !e.my_completed).slice(0, 4);
    const unheard = eps.filter((e) => !e.my_last_played_at);
    const latest = eps.slice(0, 6);
    const done = eps.filter((e) => e.my_completed).length;
    $('#main').innerHTML = `
      <div class="page">
        <div class="hero">
          <div>
            <span class="en">Internal Voice Library</span>
            <h2>${esc(state.me.name)} さん、おかえりなさい</h2>
            <p>${unheard.length ? `まだ聴いていない配信が ${unheard.length} 件あります。` : 'すべての配信を再生済みです。'}移動中や作業の合間にどうぞ。</p>
            ${state.isAdmin ? `<div class="hero-actions"><button class="btn primary" type="button" data-quick-record=""><span class="ico">${ICON.mic}</span>録音して配信</button>${state.categories.slice(0, 4).map((c) => `<button class="btn hero-cat" type="button" data-quick-record="${c.id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</button>`).join('')}</div>` : ''}
          </div>
          <div class="stats">
            <div class="stat"><b class="num">${eps.length}</b><span>配信数</span></div>
            <div class="stat"><b class="num">${done}</b><span>聴了</span></div>
            <div class="stat"><b class="num">${unheard.length}</b><span>未再生</span></div>
          </div>
        </div>
        ${inProgress.length ? `<h3 class="section">続きから聴く</h3><div class="ep-list">${inProgress.map(rowHtml).join('')}</div>` : ''}
        <h3 class="section">新着の配信 <a class="more" href="#/archive">すべて見る</a></h3>
        ${latest.length ? `<div class="ep-list">${latest.map(rowHtml).join('')}</div>` : `<div class="card empty"><b>まだ配信がありません</b>${state.isAdmin ? '<div style="margin-top:12px"><button class="btn primary" type="button" data-quick-record=""><span class="ico">' + ICON.mic + '</span>最初の配信を録音する</button></div>' : '配信されるとここに表示されます。'}</div>`}
        <h3 class="section">カテゴリーから探す</h3>
        <div class="chips">${state.categories.map((c) => `<a class="chip" href="#/archive/${c.id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}<span class="n">${c.episode_count || 0}</span></a>`).join('')}</div>
      </div>`;
  }

  function rowHtml(ep) {
    const p = pct(ep);
    return `
      <div class="ep-row" data-open="${ep.id}">
        <button class="play-btn" data-play="${ep.id}" aria-label="再生">${ICON.play}</button>
        <div class="body">
          <div class="meta">${catPill(ep)}<span>${fmtDate(ep.published_at || ep.created_at)}</span>${ep.duration_sec ? `<span>${fmtDur(ep.duration_sec)}</span>` : ''}${ep.status === 'draft' ? '<span class="pill draft">下書き</span>' : ''}</div>
          <div class="title">${esc(ep.title)}</div>
          ${ep.description ? `<div class="desc">${esc(ep.description)}</div>` : ''}
          ${ep.my_last_played_at ? `<div class="progress ${ep.my_completed ? 'done' : ''}"><i style="width:${p}%"></i></div>` : ''}
        </div>
        <div class="side">${statusPill(ep)}<span>💬 ${ep.comment_count || 0}</span></div>
      </div>`;
  }

  /* ───────── 画面: アーカイブ ───────── */
  async function renderArchive(reload) {
    const r = state.route;
    const eps = await loadEpisodes({ category: r.cat, q: r.q });
    const cat = state.categories.find((c) => String(c.id) === String(r.cat));
    $('#main').innerHTML = `
      <div class="page">
        <div class="page-head">
          <div><span class="en">Archive</span><h2>${cat ? esc(cat.name) : 'すべての配信'}</h2><p>${cat ? `${cat.name} の配信 ${eps.length} 件` : `過去の配信 ${eps.length} 件。カテゴリーやキーワードで絞り込めます`}</p></div>
          ${state.isAdmin ? `<button class="btn primary" type="button" data-quick-record="${cat ? cat.id : ''}"><span class="ico">${ICON.mic}</span>${cat ? esc(cat.name) + 'に' : ''}録音して配信</button>` : ''}
        </div>
        <div class="toolbar">
          <div class="chips">
            <a class="chip ${!r.cat ? 'active' : ''}" href="#/archive">すべて</a>
            ${state.categories.map((c) => `<a class="chip ${String(c.id) === String(r.cat) ? 'active' : ''}" href="#/archive/${c.id}"><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}<span class="n">${c.episode_count || 0}</span></a>`).join('')}
          </div>
        </div>
        <div class="toolbar">
          <input class="input" id="search" type="search" placeholder="タイトル・説明・文字起こしから検索" value="${esc(r.q)}">
          <select class="select" id="filter" style="max-width:160px">
            <option value="">すべての状態</option><option value="unheard">未再生</option><option value="partial">途中</option><option value="done">聴了</option>
          </select>
        </div>
        <div class="ep-list" id="list">${eps.length ? eps.map(rowHtml).join('') : '<div class="card empty"><b>該当する配信がありません</b>条件を変えて探してみてください。</div>'}</div>
      </div>`;
    $('#search').addEventListener('change', (e) => go(`/archive/${r.cat}?q=${encodeURIComponent(e.target.value.trim())}`));
    $('#filter').addEventListener('change', (e) => {
      const f = e.target.value;
      const filtered = eps.filter((ep) => !f || (f === 'unheard' && !ep.my_last_played_at) || (f === 'partial' && ep.my_last_played_at && !ep.my_completed) || (f === 'done' && ep.my_completed));
      $('#list').innerHTML = filtered.length ? filtered.map(rowHtml).join('') : '<div class="card empty"><b>該当する配信がありません</b></div>';
      player.renderState();
    });
  }

  /* ───────── 画面: エピソード詳細 ───────── */
  async function renderEpisode(reload) {
    const id = state.route.id;
    if (reload || !state.detail || state.detail.episode.id !== id) state.detail = await api(`/api/episodes/${id}`);
    const { episode: ep, comments } = state.detail;
    const isPlaying = player.ep && player.ep.id === ep.id && !audio.paused;
    $('#main').innerHTML = `
      <div class="page">
        <div class="ep-head">
          <button class="play-btn lg" data-play="${ep.id}" aria-label="再生">${isPlaying ? ICON.pause : ICON.play}</button>
          <div>
            <div class="meta">${catPill(ep)}<span>${fmtDate(ep.published_at || ep.created_at)}</span>${ep.duration_sec ? `<span>${fmtDur(ep.duration_sec)}</span>` : ''}${statusPill(ep)}${ep.status === 'draft' ? '<span class="pill draft">下書き（メンバーには非表示）</span>' : ''}</div>
            <h2>${esc(ep.title)}</h2>
            <div class="sub">${ep.created_by_name ? `配信: ${esc(ep.created_by_name)} ・ ` : ''}${ep.listener_count || 0} 人が再生${ep.my_last_played_at && !ep.my_completed ? ` ・ ${fmtTime(ep.my_position_sec)} まで再生済み` : ''}</div>
          </div>
        </div>
        <div class="card ep-desc" style="margin-top:14px">${esc(ep.description)}</div>
        ${knowledgeHtml(ep)}
        <h3 class="section">コメント <span class="muted small" style="font-family:var(--sans);font-weight:400">${comments.length} 件</span></h3>
        <div class="comments" id="comments">${comments.length ? comments.map(commentHtml).join('') : '<div class="card empty">最初のコメントを書いてみましょう。感想や質問、気づきなど何でも。</div>'}</div>
        <form class="comment-form" id="comment-form" style="margin-top:14px">
          <div class="avatar o">${initial(state.me.name)}</div>
          <div>
            <textarea class="textarea" id="comment-body" placeholder="感想・質問・気づきを書く（2000文字まで）" maxlength="2000" required></textarea>
            <div class="actions"><span class="muted small">${esc(state.me.name)} として投稿</span><button class="btn primary" type="submit">投稿する</button></div>
          </div>
        </form>
      </div>`;
    $('#comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = $('#comment-body').value.trim();
      if (!body) return;
      const btn = e.target.querySelector('button');
      btn.disabled = true;
      try {
        const r = await api(`/api/episodes/${ep.id}/comments`, { method: 'POST', json: { body } });
        state.detail.comments.push(r.comment);
        ep.comment_count = (ep.comment_count || 0) + 1;
        toast('コメントを投稿しました');
        renderEpisode(false);
      } catch (err) { toast(err.message, true); btn.disabled = false; }
    });
  }
  /* 要約・文字起こし・Notion リンク（ナレッジ連携の結果） */
  function knowledgeHtml(ep) {
    const st = ep.knowledge_status || 'none';
    let html = '';
    if (ep.summary) {
      html += `<h3 class="section">要約 ${ep.notion_page_url ? `<a class="more" href="${esc(ep.notion_page_url)}" target="_blank" rel="noopener">Notion の議事録DBで開く</a>` : ''}</h3>
        <div class="card ep-desc">${esc(ep.summary)}</div>`;
    }
    if (ep.transcript) {
      html += `<details class="card transcript"><summary>文字起こし全文を表示</summary><div class="ep-desc">${esc(ep.transcript)}</div></details>`;
    }
    if (state.isAdmin) {
      if (st === 'pending' || st === 'processing') html += `<p class="muted small" style="margin-top:12px">${st === 'processing' ? '文字起こしを処理中です' : '文字起こしを待機中です（5分以内に始まります）'}。終わると要約と Notion のリンクがここに出ます。</p>`;
      if (st === 'error') html += `<div class="card" style="margin-top:12px;padding:14px 18px;border-color:var(--red)"><b style="color:var(--red)">ナレッジ連携でエラー</b><div class="small muted" style="margin:4px 0 10px">${esc(ep.knowledge_error || '')}</div><button class="btn ghost sm" data-retry="${ep.id}">もう一度処理する</button></div>`;
      if (st === 'done' && !ep.notion_page_url && ep.knowledge_error) html += `<p class="muted small" style="margin-top:12px">${esc(ep.knowledge_error)}</p>`;
    }
    return html;
  }
  function knowledgePill(ep) {
    const st = ep.knowledge_status || 'none';
    if (ep.status !== 'published') return '<span class="muted small">—</span>';
    if (st === 'pending') return '<span class="pill">待機中</span>';
    if (st === 'processing') return '<span class="pill partial">処理中</span>';
    if (st === 'done') return ep.notion_page_url ? `<a class="pill done" href="${esc(ep.notion_page_url)}" target="_blank" rel="noopener">Notion 済</a>` : '<span class="pill done" title="Notion 未設定のため要約のみ">要約済</span>';
    if (st === 'error') return `<span class="pill" style="background:var(--red-pale);color:var(--red)" title="${esc(ep.knowledge_error || '')}">エラー</span>`;
    return '<span class="pill none">未処理</span>';
  }

  function commentHtml(cm) {
    const mine = state.me && cm.member_id === state.me.id;
    return `
      <div class="comment">
        <div class="avatar ${mine ? 'o' : ''}">${initial(cm.member_name)}</div>
        <div>
          <div class="who"><b>${esc(cm.member_name)}</b><span title="${esc(fmtDateTime(cm.created_at))}">${relDate(cm.created_at)}</span>${mine || state.isAdmin ? `<button class="del" data-del-comment="${cm.id}">削除</button>` : ''}</div>
          <div class="text">${esc(cm.body)}</div>
        </div>
      </div>`;
  }

  /* ───────── 画面: 管理 ───────── */
  async function renderAdmin(reload) {
    const tab = state.route.tab;
    const tabs = [['episodes', '配信管理'], ['stats', '視聴状況'], ['categories', 'カテゴリー'], ['members', 'メンバー']];
    $('#main').innerHTML = `
      <div class="page">
        <div class="page-head"><div><span class="en">Admin</span><h2>配信管理・視聴状況</h2><p>配信の登録・公開、誰がどこまで聴いたかの確認ができます</p></div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">${tab === 'episodes' ? '<button class="btn ghost" id="knowledge-run" title="待機中の配信の文字起こし・Notion 登録を今すぐ始める">ナレッジ処理を今すぐ実行</button><button class="btn primary" id="new-ep">＋ 新しい配信</button>' : ''}${tab === 'stats' ? '<a class="btn ghost" id="csv" href="/api/admin/export.csv" download>CSV ダウンロード</a>' : ''}</div>
        </div>
        <div class="tabs">${tabs.map(([k, l]) => `<a class="tab ${tab === k ? 'active' : ''}" href="#/admin/${k}">${l}</a>`).join('')}</div>
        <div id="admin-body"></div>
      </div>`;
    if (tab === 'episodes') {
      await adminEpisodes();
      $('#knowledge-run').addEventListener('click', async () => {
        try { await api('/api/admin/knowledge/run', { method: 'POST' }); toast('処理を開始しました。数分後に一覧を開き直してください'); } catch (err) { toast(err.message, true); }
      });
    }
    else if (tab === 'stats') await adminStats();
    else if (tab === 'categories') await adminCategories();
    else if (tab === 'members') await adminMembers();
  }

  async function adminEpisodes() {
    const eps = await loadEpisodes({ include_drafts: 1 });
    $('#admin-body').innerHTML = eps.length ? `
      <div class="table-wrap"><table>
        <thead><tr><th>配信</th><th>カテゴリー</th><th>状態</th><th>ナレッジ</th><th>再生 / 聴了</th><th>コメント</th><th>公開日</th><th></th></tr></thead>
        <tbody>${eps.map((ep) => `
          <tr>
            <td><a href="#/episode/${ep.id}" style="font-weight:600">${esc(ep.title)}</a><div class="muted small">${fmtDur(ep.duration_sec) || '長さ不明'}${ep.has_audio ? '' : ' ・ <span style="color:var(--red)">音声未アップロード</span>'}</div></td>
            <td>${catPill(ep)}</td>
            <td>${ep.status === 'published' ? '<span class="pill done">公開中</span>' : '<span class="pill draft">下書き</span>'}</td>
            <td>${knowledgePill(ep)}${ep.status === 'published' && ep.has_audio && (ep.knowledge_status === 'error' || ep.knowledge_status === 'done') ? ` <button class="btn ghost sm" data-retry="${ep.id}" title="文字起こしと Notion 登録をやり直す">再処理</button>` : ''}</td>
            <td class="num"><a href="#/admin/stats/${ep.id}">${ep.listener_count || 0} / ${ep.completed_count || 0}</a></td>
            <td class="num">${ep.comment_count || 0}</td>
            <td class="num">${fmtDate(ep.published_at) || '—'}</td>
            <td class="actions">
              <button class="btn ghost sm" data-edit="${ep.id}">編集</button>
              <button class="btn ${ep.status === 'published' ? 'ghost' : 'primary'} sm" data-toggle="${ep.id}" ${!ep.has_audio && ep.status !== 'published' ? 'disabled title="音声をアップロードしてください"' : ''}>${ep.status === 'published' ? '非公開に' : '公開する'}</button>
              <button class="btn danger sm" data-delete="${ep.id}">削除</button>
            </td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="card empty"><b>配信がまだありません</b>「＋ 新しい配信」から音声ファイルを登録してください。</div>';
    $('#new-ep').addEventListener('click', () => episodeModal(null));
    $('#admin-body').addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.retry) return; // 共通ハンドラーで処理
      const ep = eps.find((x) => x.id === Number(t.dataset.edit || t.dataset.toggle || t.dataset.delete));
      if (!ep) return;
      if (t.dataset.edit) episodeModal(ep);
      if (t.dataset.toggle) {
        try {
          await api(`/api/admin/episodes/${ep.id}`, { method: 'PUT', json: { title: ep.title, description: ep.description, category_id: ep.category_id, status: ep.status === 'published' ? 'draft' : 'published' } });
          toast(ep.status === 'published' ? '非公開にしました' : '公開しました');
          await loadCategories();
          renderRoute();
        } catch (err) { toast(err.message, true); }
      }
      if (t.dataset.delete) {
        if (!confirm(`「${ep.title}」を削除します。音声ファイル・再生履歴・コメントも消えます。よろしいですか？`)) return;
        try { await api(`/api/admin/episodes/${ep.id}`, { method: 'DELETE' }); toast('削除しました'); if (player.ep && player.ep.id === ep.id) player.close(); await loadCategories(); renderRoute(); } catch (err) { toast(err.message, true); }
      }
    });
  }

  /**
   * 配信の登録・編集モーダル。
   * opts.quick = true なら「録音して配信」: 録音パネルを最初に出し、カテゴリーとタイトルを埋めた状態で開く
   */
  function episodeModal(ep, opts = {}) {
    const isNew = !ep;
    const quick = !!opts.quick && isNew;
    const preCat = quick ? (opts.category_id || null) : (ep ? ep.category_id : null);
    const cat = state.categories.find((c) => c.id === preCat);
    const cats = state.categories.map((c) => `<option value="${c.id}" ${c.id === preCat ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
    const today = new Date();
    const defaultTitle = quick ? `${today.getMonth() + 1}/${today.getDate()} ${cat ? cat.name : '配信'}` : (ep?.title || '');
    const metaHtml = `
        <div class="field full"><label>タイトル</label><input class="input" name="title" required maxlength="120" value="${esc(defaultTitle)}" placeholder="例: 9月 全体朝礼（社長メッセージ）"></div>
        <div class="field"><label>カテゴリー</label><select class="select" name="category_id"><option value="">未分類</option>${cats}</select></div>
        <div class="field"><label>公開設定</label><select class="select" name="status"><option value="published" ${quick || ep?.status === 'published' ? 'selected' : ''}>すぐに公開する</option><option value="draft" ${!quick && (!ep || ep.status === 'draft') ? 'selected' : ''}>下書きとして保存</option></select></div>
        <div class="field full"><label>説明（任意）</label><textarea class="textarea" name="description" maxlength="5000" placeholder="内容の要約、話者、関連資料へのリンクなど" ${quick ? 'style="min-height:56px"' : ''}>${esc(ep?.description || '')}</textarea></div>`;
    openModal(`
      <h3>${quick ? `${cat ? esc(cat.name) + 'に' : ''}録音して配信` : isNew ? '新しい配信を登録' : '配信を編集'}</h3>
      <form id="ep-form" class="form-grid">
        ${quick ? '' : metaHtml}
        <div class="field full">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <label>音声${isNew ? '' : '（差し替える場合のみ）'}</label>
            <div class="seg" role="tablist"><button type="button" class="${quick ? '' : 'active'}" data-mode="file">ファイルを選ぶ</button><button type="button" class="${quick ? 'active' : ''}" data-mode="record">その場で録音</button></div>
          </div>
          <div id="file-panel" ${quick ? 'hidden' : ''}>
            <label class="upload-box" id="drop"><input type="file" name="file" accept="audio/*,.mp3,.m4a,.wav,.ogg"><b id="file-name">${isNew ? 'ここにドラッグ、またはクリックして選択' : '差し替えるファイルを選択'}</b>mp3 / m4a / wav / ogg、1ファイル 200MB まで</label>
          </div>
          <div id="rec-panel" class="rec-panel" ${quick ? '' : 'hidden'}>
            <div class="rec-time" id="rec-time">0:00</div>
            <div class="rec-status" id="rec-status">ボタンを押すと録音が始まります</div>
            <button type="button" class="rec-btn" id="rec-btn" aria-label="録音 / 停止">${ICON.mic}</button>
            <div class="rec-level" id="rec-level"><i></i></div>
            <div class="rec-actions"><button type="button" class="btn ghost sm" id="rec-pause" hidden>一時停止</button><button type="button" class="btn ghost sm" id="rec-redo" hidden>録り直す</button></div>
            <div class="rec-preview" id="rec-preview" hidden></div>
            <div class="rec-hint">録音は自動で MP3 になり、iPhone でも PC でも再生できます。静かな場所で、口元から 20cm ほど離して話すと聴きやすくなります</div>
            <div class="rec-hint" id="rec-unsupported" hidden style="color:var(--red)">このブラウザは録音に対応していません。Chrome / Safari / Edge の最新版でお試しください</div>
          </div>
          <div class="upload-bar" id="upload-bar" hidden><i></i></div>
        </div>
        ${quick ? metaHtml : ''}
      </form>
      <div class="foot"><button class="btn ghost" data-close>キャンセル</button><button class="btn primary" id="ep-save">${quick ? '配信する' : isNew ? '登録する' : '保存する'}</button></div>`, () => {
      const R = window.AudioRecorder;
      if (R && R.state !== 'idle') { R.cancel(); toast('録音を破棄しました'); }
    });
    const form = $('#ep-form');
    const fileInput = form.querySelector('input[type=file]');
    const drop = $('#drop');
    if (isNew) form.querySelector('[name=status]').value = 'published';
    if (quick) form.querySelector('[name=title]').select();
    fileInput.addEventListener('change', () => { if (fileInput.files[0]) $('#file-name').textContent = `${fileInput.files[0].name}（${(fileInput.files[0].size / 1024 / 1024).toFixed(1)} MB）`; });
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('drag'); }));
    drop.addEventListener('drop', (e) => { if (e.dataTransfer.files[0]) { fileInput.files = e.dataTransfer.files; fileInput.dispatchEvent(new Event('change')); } });

    /* ── その場で録音 ── */
    const R = window.AudioRecorder;
    let mode = quick ? 'record' : 'file';
    let recorded = null; // { file, duration, url }
    const segBtns = form.querySelectorAll('.seg button');
    segBtns.forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      segBtns.forEach((x) => x.classList.toggle('active', x === b));
      $('#file-panel').hidden = mode !== 'file';
      $('#rec-panel').hidden = mode !== 'record';
    }));
    const recBtn = $('#rec-btn'), recTime = $('#rec-time'), recStatus = $('#rec-status'), recLevel = $('#rec-level > i'), recPause = $('#rec-pause'), recRedo = $('#rec-redo'), recPreview = $('#rec-preview');
    if (!R || !R.supported) { $('#rec-unsupported').hidden = false; recBtn.disabled = true; }
    function renderRec() {
      const st = R ? R.state : 'idle';
      const active = st === 'recording' || st === 'paused';
      recBtn.innerHTML = active ? ICON.stop : ICON.mic;
      recBtn.classList.toggle('stop', active);
      recBtn.disabled = st === 'stopping' || !(R && R.supported);
      recPause.hidden = !active;
      recPause.textContent = st === 'paused' ? '再開する' : '一時停止';
      recStatus.innerHTML = st === 'recording' ? '<span class="live"></span>録音中（もう一度押すと停止）'
        : st === 'paused' ? '<span class="live paused"></span>一時停止中'
        : st === 'stopping' ? 'MP3 に書き出しています…'
        : recorded ? '録音できました。下で聴き直してから登録してください' : 'ボタンを押すと録音が始まります';
      recRedo.hidden = !(recorded && st === 'idle');
      recPreview.hidden = !(recorded && st === 'idle');
    }
    recBtn.addEventListener('click', async () => {
      if (!R || !R.supported) return;
      if (R.state === 'idle') {
        try {
          if (recorded && recorded.url) URL.revokeObjectURL(recorded.url);
          recorded = null; recPreview.innerHTML = ''; recTime.textContent = '0:00';
          await R.start({
            onLevel: (v) => { recLevel.style.width = `${Math.round(v * 100)}%`; },
            onTime: (t) => { recTime.textContent = fmtTime(t); },
          });
        } catch (e) { toast(e.message, true); }
        renderRec();
        return;
      }
      if (R.state === 'recording' || R.state === 'paused') {
        try {
          const p = R.stop();
          renderRec();
          const r = await p;
          recorded = { file: r.file, duration: r.duration, url: URL.createObjectURL(r.blob) };
          recTime.textContent = fmtTime(r.duration);
          const size = r.blob.size >= 1024 * 1024 ? `${(r.blob.size / 1024 / 1024).toFixed(1)} MB` : `${Math.round(r.blob.size / 1024)} KB`;
          recPreview.innerHTML = `<div class="muted small">長さ ${fmtTime(r.duration)} ・ ${size}（MP3）</div><audio controls preload="metadata" src="${recorded.url}"></audio>`;
          if (r.duration < 1) { toast('録音が短すぎます。もう一度録音してください', true); recorded = null; }
        } catch (e) { toast(e.message, true); }
        recLevel.style.width = '0%';
        renderRec();
      }
    });
    recPause.addEventListener('click', () => { if (!R) return; if (R.state === 'recording') R.pause(); else if (R.state === 'paused') R.resume(); renderRec(); });
    recRedo.addEventListener('click', () => { if (recorded && recorded.url) URL.revokeObjectURL(recorded.url); recorded = null; recTime.textContent = '0:00'; recPreview.innerHTML = ''; renderRec(); });
    renderRec();

    $('#ep-save').addEventListener('click', async () => {
      if (!form.reportValidity()) return;
      const fd = new FormData(form);
      let file = fileInput.files[0];
      let recDuration = null;
      if (mode === 'record') {
        if (R && (R.state === 'recording' || R.state === 'paused')) { toast('録音を停止してから登録してください', true); return; }
        if (!recorded) { toast('先に録音してください', true); return; }
        file = recorded.file;
        recDuration = recorded.duration;
      }
      if (isNew && !file) { toast(mode === 'record' ? '先に録音してください' : '音声ファイルを選択してください', true); return; }
      const btn = $('#ep-save');
      btn.disabled = true;
      try {
        let duration = recDuration;
        if (file && duration == null) duration = await probeDuration(file);
        const payload = { title: fd.get('title'), description: fd.get('description'), category_id: fd.get('category_id') ? Number(fd.get('category_id')) : null, duration_sec: duration };
        let id = ep?.id;
        if (isNew) id = (await api('/api/admin/episodes', { method: 'POST', json: payload })).id;
        else await api(`/api/admin/episodes/${id}`, { method: 'PUT', json: payload });
        if (file) {
          btn.textContent = 'アップロード中…';
          $('#upload-bar').hidden = false;
          await uploadAudio(id, file, duration, (p) => { $('#upload-bar > i').style.width = `${Math.round(p * 100)}%`; });
        }
        await api(`/api/admin/episodes/${id}`, { method: 'PUT', json: { ...payload, status: fd.get('status') } });
        toast(fd.get('status') === 'published' ? '配信しました' : isNew ? '下書きとして保存しました' : '保存しました');
        closeModal();
        await loadCategories();
        if (quick) go(payload.category_id ? `/archive/${payload.category_id}` : '/archive');
        else renderRoute();
      } catch (err) { toast(err.message, true); btn.disabled = false; btn.textContent = quick ? '配信する' : isNew ? '登録する' : '保存する'; }
    });
  }

  function probeDuration(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(a.duration) ? a.duration : null); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      a.src = url;
    });
  }
  function guessType(file) {
    if (file.type && file.type !== 'application/octet-stream') return file.type;
    const ext = file.name.split('.').pop().toLowerCase();
    return { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm' }[ext] || 'application/octet-stream';
  }
  function uploadAudio(id, file, duration, onProgress) {
    if (window.__DEMO__) return window.demoUpload(id, file, duration, onProgress);
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/admin/episodes/${id}/audio`);
      xhr.setRequestHeader('Content-Type', guessType(file));
      if (duration) xhr.setRequestHeader('X-Audio-Duration', String(duration));
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch (e) { /* noop */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || `アップロードに失敗しました (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('アップロードに失敗しました。通信環境を確認してください'));
      xhr.send(file);
    });
  }

  async function adminStats() {
    const data = await api('/api/admin/stats');
    const pub = data.episodes.filter((e) => e.status === 'published');
    const total = data.total_members || 0;
    const avgReach = pub.length && total ? Math.round(pub.reduce((a, e) => a + e.listener_count / total, 0) / pub.length * 100) : 0;
    const avgDone = pub.length && total ? Math.round(pub.reduce((a, e) => a + e.completed_count / total, 0) / pub.length * 100) : 0;
    $('#admin-body').innerHTML = `
      <div class="stat-tiles">
        <div class="tile"><div class="k">メンバー数</div><div class="v num">${total}<small>人</small></div></div>
        <div class="tile"><div class="k">公開中の配信</div><div class="v num">${pub.length}<small>本</small></div></div>
        <div class="tile"><div class="k">平均 再生率</div><div class="v num">${avgReach}<small>%</small></div></div>
        <div class="tile"><div class="k">平均 聴了率</div><div class="v num">${avgDone}<small>%</small></div></div>
      </div>
      <p class="muted small" style="margin-bottom:10px">行をクリックすると、誰がどこまで聴いたかを確認できます。「聴了」は 90% 以上再生した人の数です。</p>
      <div class="table-wrap"><table>
        <thead><tr><th>配信</th><th>カテゴリー</th><th>再生した人</th><th>聴了</th><th>再生率</th><th>コメント</th><th>公開日</th></tr></thead>
        <tbody>${data.episodes.map((e) => `
          <tr class="clickable" data-listeners="${e.id}">
            <td style="font-weight:600">${esc(e.title)}${e.status !== 'published' ? ' <span class="pill draft">下書き</span>' : ''}</td>
            <td>${catPill(e)}</td>
            <td class="num">${e.listener_count} / ${total}</td>
            <td class="num">${e.completed_count}</td>
            <td><div class="progress ${total && e.completed_count === total ? 'done' : ''}"><i style="width:${total ? Math.round(e.listener_count / total * 100) : 0}%"></i></div></td>
            <td class="num">${e.comment_count}</td>
            <td class="num">${fmtDate(e.published_at) || '—'}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
    $('#admin-body').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-listeners]');
      if (tr) go(`/admin/stats/${tr.dataset.listeners}`);
    });
    if (window.__DEMO__) $('#csv')?.addEventListener('click', (e) => { e.preventDefault(); toast('デモ版では CSV 出力は動作しません'); });
    if (state.route.id) listenersModal(state.route.id);
  }

  async function listenersModal(id) {
    let data;
    try { data = await api(`/api/admin/episodes/${id}/listeners`); } catch (e) { toast(e.message, true); return; }
    const dur = Number(data.episode.duration_sec) || 0;
    const rows = data.listeners.map((l) => {
      const played = !!l.last_played_at;
      const p = l.completed ? 100 : dur ? Math.min(99, Math.round((Number(l.max_position_sec) || 0) / dur * 100)) : 0;
      return `<tr>
        <td><b>${esc(l.name)}</b><div class="muted small">${esc(l.email)}</div></td>
        <td>${l.completed ? '<span class="pill done">聴了</span>' : played ? `<span class="pill partial">${p}% まで</span>` : '<span class="pill none">未再生</span>'}</td>
        <td><div class="progress ${l.completed ? 'done' : ''}"><i style="width:${played ? p : 0}%"></i></div></td>
        <td class="num">${played ? l.play_count : '—'}</td>
        <td class="num small">${played ? fmtDateTime(l.last_played_at) : '—'}</td>
      </tr>`;
    }).join('');
    const played = data.listeners.filter((l) => l.last_played_at).length;
    openModal(`
      <h3>${esc(data.episode.title)}</h3>
      <p class="muted small" style="margin:-10px 0 14px">${played} / ${data.listeners.length} 人が再生 ・ ${data.listeners.filter((l) => l.completed).length} 人が聴了${dur ? ` ・ 長さ ${fmtDur(dur)}` : ''}</p>
      <div class="table-wrap"><table><thead><tr><th>メンバー</th><th>状態</th><th>進捗</th><th>再生回数</th><th>最終再生</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="foot"><button class="btn" data-close>閉じる</button></div>`, () => { if (state.route.name === 'admin') history.replaceState(null, '', '#/admin/stats'); });
  }

  async function adminCategories() {
    const cats = state.categories;
    $('#admin-body').innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>名前</th><th>色</th><th>並び順</th><th>配信数</th><th></th></tr></thead>
        <tbody>
          ${cats.map((c) => `<tr data-cat="${c.id}">
            <td><input class="input" name="name" value="${esc(c.name)}" maxlength="30"></td>
            <td><input type="color" name="color" value="${esc(c.color)}" style="width:44px;height:32px;border:1px solid var(--border);border-radius:6px;background:#fff"></td>
            <td><input class="input num" name="sort_order" type="number" value="${c.sort_order}" style="width:80px"></td>
            <td class="num">${c.episode_count || 0}</td>
            <td class="actions"><button class="btn ghost sm" data-save="${c.id}">保存</button><button class="btn danger sm" data-remove="${c.id}">削除</button></td>
          </tr>`).join('')}
          <tr data-cat="new">
            <td><input class="input" name="name" placeholder="新しいカテゴリー名" maxlength="30"></td>
            <td><input type="color" name="color" value="#F8B800" style="width:44px;height:32px;border:1px solid var(--border);border-radius:6px;background:#fff"></td>
            <td><input class="input num" name="sort_order" type="number" value="${cats.length + 1}" style="width:80px"></td>
            <td></td>
            <td class="actions"><button class="btn primary sm" data-add>追加</button></td>
          </tr>
        </tbody>
      </table></div>
      <p class="muted small" style="margin-top:10px">カテゴリーを削除しても配信は消えません。「未分類」に戻ります。</p>`;
    $('#admin-body').addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      const tr = t.closest('tr');
      const val = (n) => tr.querySelector(`[name=${n}]`).value;
      const payload = { name: val('name'), color: val('color').toUpperCase(), sort_order: Number(val('sort_order')) };
      try {
        if (t.dataset.add !== undefined) { await api('/api/admin/categories', { method: 'POST', json: payload }); toast('追加しました'); }
        else if (t.dataset.save) { await api(`/api/admin/categories/${t.dataset.save}`, { method: 'PUT', json: payload }); toast('保存しました'); }
        else if (t.dataset.remove) {
          const c = cats.find((x) => x.id === Number(t.dataset.remove));
          if (!confirm(`カテゴリー「${c.name}」を削除しますか？`)) return;
          await api(`/api/admin/categories/${c.id}`, { method: 'DELETE' });
          toast('削除しました');
        }
        await loadCategories();
        renderRoute();
      } catch (err) { toast(err.message, true); }
    });
  }

  async function adminMembers() {
    const data = await api('/api/admin/members');
    $('#admin-body').innerHTML = `
      <p class="muted small" style="margin-bottom:10px">メンバーは Cloudflare Access でログインした時点で自動的に追加されます。管理者にすると配信の登録や視聴状況の確認ができます。</p>
      <div class="table-wrap"><table>
        <thead><tr><th>メンバー</th><th>権限</th><th>再生した配信</th><th>聴了</th><th>コメント</th><th>最終再生</th><th>最終アクセス</th><th></th></tr></thead>
        <tbody>${data.members.map((m) => `
          <tr>
            <td><b>${esc(m.name)}</b><div class="muted small">${esc(m.email)}</div></td>
            <td>${m.role === 'admin' ? '<span class="pill admin">管理者</span>' : '<span class="pill">メンバー</span>'}</td>
            <td class="num">${m.played_count} / ${data.published_count}</td>
            <td class="num">${m.completed_count}</td>
            <td class="num">${m.comment_count}</td>
            <td class="num small">${m.last_played_at ? fmtDateTime(m.last_played_at) : '—'}</td>
            <td class="num small">${fmtDateTime(m.last_seen_at)}</td>
            <td class="actions">${m.id === state.me.id ? '<span class="muted small">自分</span>' : `<button class="btn ghost sm" data-role="${m.role === 'admin' ? 'member' : 'admin'}" data-id="${m.id}">${m.role === 'admin' ? '管理者を外す' : '管理者にする'}</button>`}</td>
          </tr>`).join('')}</tbody>
      </table></div>`;
    $('#admin-body').addEventListener('click', async (e) => {
      const t = e.target.closest('button[data-role]');
      if (!t) return;
      try { await api(`/api/admin/members/${t.dataset.id}`, { method: 'PUT', json: { role: t.dataset.role } }); toast('変更しました'); renderRoute(); } catch (err) { toast(err.message, true); }
    });
  }

  /* ───────── モーダル ───────── */
  let onCloseModal = null;
  function openModal(html, onClose) {
    closeModal();
    onCloseModal = onClose || null;
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.id = 'modal';
    bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
    bg.addEventListener('click', (e) => { if (e.target === bg || e.target.closest('[data-close]')) closeModal(); });
    document.body.appendChild(bg);
    const first = bg.querySelector('input, textarea, select, button');
    if (first) first.focus();
  }
  function closeModal() {
    const m = $('#modal');
    if (m) m.remove();
    if (onCloseModal) { const f = onCloseModal; onCloseModal = null; f(); }
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  /* ───────── グローバルなクリック処理 ───────── */
  document.addEventListener('click', async (e) => {
    const playBtn = e.target.closest('[data-play]');
    if (playBtn) {
      e.stopPropagation();
      const id = Number(playBtn.dataset.play);
      const ep = state.episodes.find((x) => x.id === id) || (state.detail && state.detail.episode.id === id ? state.detail.episode : null);
      if (ep) player.load(ep, true);
      return;
    }
    const quick = e.target.closest('[data-quick-record]');
    if (quick) {
      if (!state.isAdmin) return;
      episodeModal(null, { quick: true, category_id: Number(quick.dataset.quickRecord) || null });
      return;
    }
    const open = e.target.closest('[data-open]');
    if (open) { go(`/episode/${open.dataset.open}`); return; }
    const retry = e.target.closest('[data-retry]');
    if (retry) {
      try {
        await api(`/api/admin/episodes/${retry.dataset.retry}/knowledge/retry`, { method: 'POST' });
        toast('文字起こしをやり直します。数分後に更新されます');
        renderRoute();
      } catch (err) { toast(err.message, true); }
      return;
    }
    const del = e.target.closest('[data-del-comment]');
    if (del) {
      if (!confirm('このコメントを削除しますか？')) return;
      try {
        await api(`/api/comments/${del.dataset.delComment}`, { method: 'DELETE' });
        state.detail.comments = state.detail.comments.filter((c) => c.id !== Number(del.dataset.delComment));
        state.detail.episode.comment_count = Math.max(0, (state.detail.episode.comment_count || 1) - 1);
        toast('削除しました');
        renderEpisode(false);
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (e.target.id === 'rename') {
      const name = prompt('表示名（コメントや視聴状況に表示されます）', state.me.name);
      if (name && name.trim() && name.trim() !== state.me.name) {
        try { await api('/api/me', { method: 'PUT', json: { name: name.trim() } }); state.me.name = name.trim(); renderNav(); renderRoute(false); toast('表示名を変更しました'); } catch (err) { toast(err.message, true); }
      }
    }
  });

  $('#p-play').addEventListener('click', () => player.toggle());
  $('#p-back').addEventListener('click', () => player.skip(-15));
  $('#p-fwd').addEventListener('click', () => player.skip(15));
  $('#speed-menu').innerHTML = player.speeds.map((s, i) => `<button type="button" data-speed="${i}">${s}×</button>`).join('');
  player.renderSpeed();
  $('#p-speed').addEventListener('click', (e) => { e.stopPropagation(); player.toggleSpeedMenu(); });
  $('#speed-menu').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-speed]');
    if (!b) return;
    player.setSpeed(Number(b.dataset.speed));
    player.toggleSpeedMenu(false);
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#speed-menu') && !$('#speed-menu').hidden) player.toggleSpeedMenu(false); });
  $('#p-close').addEventListener('click', () => player.close());
  $('#p-title').addEventListener('click', () => { if (player.ep) go(`/episode/${player.ep.id}`); });
  const seek = $('#p-seek');
  seek.addEventListener('input', () => { player.seeking = true; const dur = audio.duration || Number(player.ep?.duration_sec) || 0; $('#p-cur').textContent = fmtTime((seek.value / 1000) * dur); });
  seek.addEventListener('change', () => { const dur = audio.duration || Number(player.ep?.duration_sec) || 0; if (dur) audio.currentTime = (seek.value / 1000) * dur; player.seeking = false; });
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || $('#modal')) return;
    if (e.code === 'Space' && player.ep) { e.preventDefault(); player.toggle(); }
    if (e.code === 'ArrowLeft' && player.ep) player.skip(-15);
    if (e.code === 'ArrowRight' && player.ep) player.skip(15);
  });

  /* ───────── 起動 ───────── */
  async function boot() {
    try {
      const me = await api('/api/me');
      state.me = me.member;
      state.isAdmin = me.isAdmin;
      await loadCategories();
      window.addEventListener('hashchange', () => renderRoute(true));
      await renderRoute(true);
    } catch (e) {
      if ($('#login').hidden) $('#main').innerHTML = `<div class="page"><div class="card empty"><b>読み込めませんでした</b>${esc(e.message)}</div></div>`;
    }
  }
  window.audioApp = { reload: boot, state, player };
  boot();
})();
