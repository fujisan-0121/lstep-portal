/**
 * ナレッジ連携パイプライン
 *
 *   公開された配信 → 文字起こし (Workers AI Whisper) → 要約 (Workers AI LLM)
 *     → Notion 議事録DB に 1 行（会議名 / 開催日 / 録音元=社内音声 / 要約 / トランスクリプトURL、本文に全文）
 *
 * 種別・タグは空欄のまま入れる。Vault の設計どおり、既存の後処理 AI（未処理ビュー）が埋める。
 * Cron（5 分おき）で pending を 1 件ずつ処理する。長い音声でも Cron ハンドラーは 15 分まで動ける。
 */

export interface KnowledgeEnv {
  DB: D1Database;
  AUDIO: R2Bucket;
  AI?: unknown;
  NOTION_TOKEN?: string;
  NOTION_DATABASE_ID?: string;
  APP_URL?: string;
}

type AiRunner = { run(model: string, input: Record<string, unknown>): Promise<unknown> };

const WHISPER_MODEL = '@cf/openai/whisper-large-v3-turbo';
const LLM_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const CHUNK_BYTES = 4 * 1024 * 1024; // 64kbps なら約 8 分
const STALE_MINUTES = 25; // processing のまま止まっていたら再実行
const NOTION_VERSION = '2022-06-28';
const SOURCE_LABEL = '社内音声';

interface EpisodeRow {
  id: number;
  title: string;
  description: string;
  audio_key: string | null;
  audio_content_type: string | null;
  duration_sec: number | null;
  published_at: string | null;
  created_at: string;
  category_name: string | null;
  knowledge_status: string;
  notion_page_id: string | null;
}

const now = () => new Date().toISOString();

/* ───────────────────────── 入口 ───────────────────────── */

/** pending（または止まった processing）を 1 件処理する。処理したら true */
export async function processNext(env: KnowledgeEnv, log: (s: string) => void = console.log): Promise<boolean> {
  const staleBefore = new Date(Date.now() - STALE_MINUTES * 60 * 1000).toISOString();
  const row = await env.DB.prepare(
    `SELECT e.id, e.title, e.description, e.audio_key, e.audio_content_type, e.duration_sec, e.published_at, e.created_at,
            e.knowledge_status, e.notion_page_id, cat.name AS category_name
     FROM episodes e LEFT JOIN categories cat ON cat.id = e.category_id
     WHERE e.status = 'published' AND e.audio_key IS NOT NULL
       AND (e.knowledge_status = 'pending' OR (e.knowledge_status = 'processing' AND COALESCE(e.knowledge_updated_at, '') < ?))
     ORDER BY COALESCE(e.published_at, e.created_at) ASC LIMIT 1`,
  )
    .bind(staleBefore)
    .first<EpisodeRow>();
  if (!row) return false;
  await processEpisode(env, row, log);
  return true;
}

export async function processEpisode(env: KnowledgeEnv, ep: EpisodeRow, log: (s: string) => void = console.log): Promise<void> {
  const setStatus = (status: string, extra: Record<string, unknown> = {}) => {
    const keys = Object.keys(extra);
    const sets = ['knowledge_status = ?', 'knowledge_updated_at = ?', ...keys.map((k) => `${k} = ?`)];
    return env.DB.prepare(`UPDATE episodes SET ${sets.join(', ')} WHERE id = ?`)
      .bind(status, now(), ...keys.map((k) => extra[k]), ep.id)
      .run();
  };
  await setStatus('processing', { knowledge_error: null });
  log(`[knowledge] #${ep.id} ${ep.title}: start`);
  try {
    if (!env.AI) throw new Error('Workers AI のバインディング (AI) がありません');
    const ai = env.AI as AiRunner;

    // 1. 文字起こし
    const obj = await env.AUDIO.get(ep.audio_key!);
    if (!obj) throw new Error('音声ファイルが見つかりません');
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const chunks = splitAudio(bytes, ep.audio_content_type || '', CHUNK_BYTES);
    log(`[knowledge] #${ep.id}: ${bytes.length} bytes → ${chunks.length} chunk(s)`);
    const parts: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const text = await transcribeChunk(ai, chunks[i]);
      parts.push(text.trim());
      log(`[knowledge] #${ep.id}: chunk ${i + 1}/${chunks.length} → ${text.length} chars`);
    }
    const transcript = parts.filter(Boolean).join('\n').trim();
    if (!transcript) throw new Error('文字起こし結果が空でした（無音の可能性）');
    await env.DB.prepare('UPDATE episodes SET transcript = ?, knowledge_updated_at = ? WHERE id = ?').bind(transcript, now(), ep.id).run();

    // 2. 要約
    const summary = await summarize(ai, ep, transcript);
    await env.DB.prepare('UPDATE episodes SET summary = ?, knowledge_updated_at = ? WHERE id = ?').bind(summary.full, now(), ep.id).run();

    // 3. Notion
    if (!env.NOTION_TOKEN || !env.NOTION_DATABASE_ID) {
      await setStatus('done', { knowledge_error: 'Notion 未設定（NOTION_TOKEN / NOTION_DATABASE_ID）。文字起こしと要約のみ保存しました' });
      log(`[knowledge] #${ep.id}: done without Notion`);
      return;
    }
    const page = await upsertNotionPage(env, ep, transcript, summary);
    await setStatus('done', { notion_page_id: page.id, notion_page_url: page.url, knowledge_error: null });
    log(`[knowledge] #${ep.id}: done → ${page.url}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`[knowledge] #${ep.id}: error ${msg}`);
    await setStatus('error', { knowledge_error: msg.slice(0, 500) });
  }
}

/* ───────────────────────── 文字起こし ───────────────────────── */

async function transcribeChunk(ai: AiRunner, chunk: Uint8Array): Promise<string> {
  const res = (await ai.run(WHISPER_MODEL, { audio: toBase64(chunk), language: 'ja', task: 'transcribe' })) as { text?: string };
  return res?.text ?? '';
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  return btoa(bin);
}

/**
 * 音声をモデルに渡せる大きさに分割する。MP3 はフレーム境界で切るので、各チャンクが単独で再生・認識できる。
 * MP3 以外（m4a / wav / ogg）はフレーム境界が取れないので、そのまま 1 チャンク（大きすぎる場合は先頭から固定長）。
 */
export function splitAudio(bytes: Uint8Array, contentType: string, target: number): Uint8Array[] {
  if (bytes.length <= target) return [bytes];
  if (/mpeg|mp3/.test(contentType)) {
    const frames = mp3FrameOffsets(bytes);
    if (frames.length > 10) {
      const chunks: Uint8Array[] = [];
      let start = frames[0];
      for (let i = 1; i < frames.length; i++) {
        if (frames[i] - start >= target) {
          chunks.push(bytes.subarray(start, frames[i]));
          start = frames[i];
        }
      }
      chunks.push(bytes.subarray(start));
      return chunks.filter((c) => c.length > 0);
    }
  }
  const chunks: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += target) chunks.push(bytes.subarray(i, i + target));
  return chunks;
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES: Record<number, number[]> = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/** MP3 の各フレーム先頭オフセット。ID3v2 タグは飛ばす */
export function mp3FrameOffsets(b: Uint8Array): number[] {
  const out: number[] = [];
  let pos = 0;
  if (b.length > 10 && b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) {
    pos = 10 + ((b[6] & 0x7f) << 21) + ((b[7] & 0x7f) << 14) + ((b[8] & 0x7f) << 7) + (b[9] & 0x7f);
  }
  while (pos + 4 <= b.length) {
    const len = mp3FrameLength(b, pos);
    if (len > 0) {
      out.push(pos);
      pos += len;
    } else {
      pos += 1; // 同期を探す
    }
  }
  return out;
}

function mp3FrameLength(b: Uint8Array, p: number): number {
  if (b[p] !== 0xff || (b[p + 1] & 0xe0) !== 0xe0) return 0;
  const version = (b[p + 1] >> 3) & 3; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layer = (b[p + 1] >> 1) & 3; // 1=Layer III
  if (version === 1 || layer !== 1) return 0;
  const bitrateIdx = (b[p + 2] >> 4) & 0xf;
  const srIdx = (b[p + 2] >> 2) & 3;
  const padding = (b[p + 2] >> 1) & 1;
  if (bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return 0;
  const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[bitrateIdx] * 1000;
  const sampleRate = SAMPLE_RATES[version][srIdx];
  const coef = version === 3 ? 144 : 72;
  return Math.floor((coef * bitrate) / sampleRate) + padding;
}

/* ───────────────────────── 要約 ───────────────────────── */

interface Summary {
  short: string; // Notion の「要約」プロパティ用（数百字）
  decisions: string[];
  actions: string[];
  full: string; // アプリ表示用のまとめ
}

async function summarize(ai: AiRunner, ep: EpisodeRow, transcript: string): Promise<Summary> {
  const MAX = 14000;
  const body = transcript.length > MAX ? transcript.slice(0, MAX) + '\n（以下省略）' : transcript;
  const prompt = `以下は社内向け音声配信「${ep.title}」${ep.category_name ? `（カテゴリー: ${ep.category_name}）` : ''}の文字起こしです。
自動文字起こしなので固有名詞の誤変換があります。文脈から自然に読める範囲で補ってください。

次の形式で、日本語で出力してください。見出しの記号はそのまま使ってください。

【概要】
（3〜5文。何の話か、聴き手に何を求めているかが分かるように。300字以内）

【決定事項】
- （箇条書き。なければ「なし」）

【次アクション】
- （誰が何をいつまでに。なければ「なし」）

--- 文字起こし ---
${body}`;
  const res = (await ai.run(LLM_MODEL, {
    messages: [
      { role: 'system', content: 'あなたは日本企業の社内アシスタントです。簡潔で正確な日本語で要約します。推測で事実を足しません。' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1200,
    temperature: 0.2,
  })) as { response?: string };
  const text = (res?.response ?? '').trim();
  const section = (name: string) => {
    const m = text.match(new RegExp(`【${name}】\\s*([\\s\\S]*?)(?=\\n【|$)`));
    return m ? m[1].trim() : '';
  };
  const bullets = (s: string) => s.split('\n').map((l) => l.replace(/^[-・*]\s*/, '').trim()).filter((l) => l && l !== 'なし');
  const short = (section('概要') || text.slice(0, 300)).replace(/\s+/g, ' ').slice(0, 400);
  return { short, decisions: bullets(section('決定事項')), actions: bullets(section('次アクション')), full: text || short };
}

/* ───────────────────────── Notion ───────────────────────── */

async function notion(env: KnowledgeEnv, method: string, path: string, body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`Notion API ${method} ${path} → ${res.status} ${(data.message as string) || ''}`);
  return data;
}

const rt = (text: string) => [{ type: 'text', text: { content: text.slice(0, 2000) } }];
const paragraph = (text: string) => ({ object: 'block', type: 'paragraph', paragraph: { rich_text: rt(text) } });
const heading = (text: string) => ({ object: 'block', type: 'heading_2', heading_2: { rich_text: rt(text) } });
const bullet = (text: string) => ({ object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: rt(text) } });

/** 1900 字ごとの段落に分ける（Notion の rich_text は 2000 字上限） */
function paragraphs(text: string): ReturnType<typeof paragraph>[] {
  const out: ReturnType<typeof paragraph>[] = [];
  for (const para of text.split(/\n{2,}/)) {
    let s = para.trim();
    while (s.length > 1900) {
      let cut = s.lastIndexOf('。', 1900);
      if (cut < 800) cut = 1900;
      else cut += 1;
      out.push(paragraph(s.slice(0, cut)));
      s = s.slice(cut);
    }
    if (s) out.push(paragraph(s));
  }
  return out;
}

async function upsertNotionPage(env: KnowledgeEnv, ep: EpisodeRow, transcript: string, summary: Summary): Promise<{ id: string; url: string }> {
  const appUrl = (env.APP_URL || '').replace(/\/$/, '');
  const episodeUrl = appUrl ? `${appUrl}/#/episode/${ep.id}` : undefined;
  const date = (ep.published_at || ep.created_at).slice(0, 10);
  const properties: Record<string, unknown> = {
    会議名: { title: rt(ep.title) },
    開催日: { date: { start: date } },
    録音元: { select: { name: SOURCE_LABEL } },
    要約: { rich_text: rt(summary.short) },
  };
  if (episodeUrl) properties['トランスクリプトURL'] = { url: episodeUrl };

  const children: unknown[] = [];
  children.push(heading('概要'), paragraph(summary.short));
  if (ep.description) children.push(heading('配信時の説明'), ...paragraphs(ep.description));
  children.push(heading('決定事項'), ...(summary.decisions.length ? summary.decisions.map(bullet) : [paragraph('なし')]));
  children.push(heading('次アクション'), ...(summary.actions.length ? summary.actions.map(bullet) : [paragraph('なし')]));
  if (episodeUrl) children.push(paragraph(`音声を聴く: ${episodeUrl}`));
  children.push(heading('文字起こし全文'), ...paragraphs(transcript));

  // 既存ページがあれば本文を作り直す（再実行時の二重登録を防ぐ）
  if (ep.notion_page_id) {
    const page = await notion(env, 'PATCH', `/pages/${ep.notion_page_id}`, { properties });
    const existing = (await notion(env, 'GET', `/blocks/${ep.notion_page_id}/children?page_size=100`)) as { results?: { id: string }[] };
    for (const blk of existing.results ?? []) await notion(env, 'DELETE', `/blocks/${blk.id}`);
    await appendChildren(env, ep.notion_page_id, children);
    return { id: ep.notion_page_id, url: page.url as string };
  }
  const first = children.slice(0, 100);
  const page = await notion(env, 'POST', '/pages', { parent: { database_id: env.NOTION_DATABASE_ID }, properties, children: first });
  await appendChildren(env, page.id as string, children.slice(100));
  return { id: page.id as string, url: page.url as string };
}

async function appendChildren(env: KnowledgeEnv, pageId: string, children: unknown[]): Promise<void> {
  for (let i = 0; i < children.length; i += 100) {
    await notion(env, 'PATCH', `/blocks/${pageId}/children`, { children: children.slice(i, i + 100) });
  }
}
