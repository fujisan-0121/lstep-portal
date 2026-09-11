// MP3 のフレーム分割が正しい境界で切れているかを確認する
// lamejs で 60 秒のテスト音声を作り、src/knowledge.ts の splitAudio を検証する
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const vm = require('node:vm');
const here = path.dirname(fileURLToPath(import.meta.url));
// ブラウザで実際に使う同梱版（public/vendor/lame.min.js）をそのまま評価する。npm の lamejs は Node では動かない
const lamejs = vm.runInThisContext(fs.readFileSync(path.join(here, '../public/vendor/lame.min.js'), 'utf8') + '\n;lamejs;');

async function loadKnowledge() {
  const src = fs.readFileSync(path.join(here, '../src/knowledge.ts'), 'utf8');
  const js = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const tmp = path.join(os.tmpdir(), `knowledge-${process.pid}.mjs`);
  fs.writeFileSync(tmp, js);
  const mod = await import(pathToFileURL(tmp).href);
  fs.unlinkSync(tmp);
  return mod;
}

function makeMp3(seconds, sampleRate = 44100, kbps = 64) {
  const enc = new lamejs.Mp3Encoder(1, sampleRate, kbps);
  const parts = [];
  const block = 1152;
  const total = sampleRate * seconds;
  for (let i = 0; i < total; i += block) {
    const n = Math.min(block, total - i);
    const pcm = new Int16Array(n);
    for (let j = 0; j < n; j++) pcm[j] = Math.round(Math.sin(((i + j) / sampleRate) * 2 * Math.PI * 440) * 8000);
    const out = enc.encodeBuffer(pcm);
    if (out.length) parts.push(new Uint8Array(out));
  }
  const out = enc.flush();
  if (out.length) parts.push(new Uint8Array(out));
  const len = parts.reduce((a, p) => a + p.length, 0);
  const all = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return all;
}

test('MP3 をフレーム境界で分割できる', async () => {
  const { splitAudio, mp3FrameOffsets } = await loadKnowledge();
  const mp3 = makeMp3(60); // 約 480KB
  const frames = mp3FrameOffsets(mp3);
  assert.ok(frames.length > 2000, `フレーム数 ${frames.length}`);
  // フレームが隙間なく連続している（各フレーム長は 64kbps/44.1kHz で 208 or 209 バイト）
  for (let i = 1; i < 500; i++) {
    const gap = frames[i] - frames[i - 1];
    assert.ok(gap === 208 || gap === 209, `フレーム間隔 ${gap}`);
  }

  const chunks = splitAudio(mp3, 'audio/mpeg', 100 * 1024);
  assert.ok(chunks.length >= 4, `チャンク数 ${chunks.length}`);
  assert.equal(chunks.reduce((a, c) => a + c.length, 0), mp3.length - frames[0], '合計サイズが一致');
  for (const c of chunks) {
    assert.ok(c[0] === 0xff && (c[1] & 0xe0) === 0xe0, 'チャンク先頭がフレーム同期');
    assert.ok(c.length <= 100 * 1024 + 300, 'チャンクが上限付近に収まる');
  }
});

test('小さいファイルは分割しない / MP3 以外は固定長', async () => {
  const { splitAudio } = await loadKnowledge();
  assert.equal(splitAudio(new Uint8Array(1000), 'audio/mpeg', 4096).length, 1);
  assert.equal(splitAudio(new Uint8Array(10000), 'audio/wav', 4096).length, 3);
});
