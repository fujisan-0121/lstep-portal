/* ブラウザ録音 → MP3
 * マイク入力を Web Audio で受け取り、録音しながら Web Worker 内の LAME (lamejs) で MP3 に変換する。
 * どの端末で録っても MP3 になるので、iPhone / Android / PC のどれでも再生できる。
 * LAME は LGPL: https://lame.sourceforge.net / lamejs: https://github.com/zhuker/lamejs */
(() => {
  'use strict';

  const WORKER_SRC = `
    let enc = null, parts = [];
    self.onmessage = (e) => {
      const m = e.data;
      try {
        if (m.type === 'init') {
          importScripts(m.lameUrl);
          enc = new lamejs.Mp3Encoder(1, m.sampleRate, m.kbps);
          parts = [];
          postMessage({ type: 'ready' });
        } else if (m.type === 'chunk') {
          const out = enc.encodeBuffer(m.samples);
          if (out.length) parts.push(new Uint8Array(out));
        } else if (m.type === 'finish') {
          const out = enc.flush();
          if (out.length) parts.push(new Uint8Array(out));
          const blob = new Blob(parts, { type: 'audio/mpeg' });
          parts = [];
          postMessage({ type: 'done', blob });
        }
      } catch (err) {
        postMessage({ type: 'error', message: String(err && err.message || err) });
      }
    };`;

  const AC = window.AudioContext || window.webkitAudioContext;
  const supported = !!(AC && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Worker);

  function lameUrl() {
    if (window.__LAME_URL__) return window.__LAME_URL__;
    return new URL('vendor/lame.min.js', document.baseURI).href;
  }

  const rec = {
    supported,
    state: 'idle',
    _ctx: null, _stream: null, _src: null, _proc: null, _gain: null, _worker: null,
    _samples: 0, _sampleRate: 48000, _onLevel: null, _onTime: null, _lastTime: 0,

    async start({ onLevel, onTime, kbps = 64 } = {}) {
      if (!supported) throw new Error('このブラウザは録音に対応していません');
      if (this.state !== 'idle') throw new Error('すでに録音中です');
      this._onLevel = onLevel || null;
      this._onTime = onTime || null;
      this._samples = 0;
      this._lastTime = 0;

      // 1. マイク許可（ユーザー操作の直後に呼ぶこと。iOS はこの順序が重要）
      this._stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      }).catch((e) => {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new Error('マイクの使用が許可されませんでした。ブラウザのアドレスバー付近の設定でマイクを許可してください');
        if (e && e.name === 'NotFoundError') throw new Error('マイクが見つかりません');
        throw new Error('マイクを開始できませんでした: ' + (e && e.message || e));
      });

      // 2. 音声処理
      this._ctx = new AC();
      if (this._ctx.state === 'suspended') await this._ctx.resume();
      this._sampleRate = this._ctx.sampleRate;

      // 3. エンコーダー (Worker)
      const workerUrl = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
      this._worker = new Worker(workerUrl);
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('MP3 変換の準備に時間がかかりすぎています。通信環境を確認してください')), 15000);
        this._worker.onmessage = (e) => {
          if (e.data.type === 'ready') { clearTimeout(t); resolve(); }
          else if (e.data.type === 'error') { clearTimeout(t); reject(new Error('MP3 変換を開始できません: ' + e.data.message)); }
        };
        this._worker.onerror = (e) => { clearTimeout(t); reject(new Error('MP3 変換の部品を読み込めませんでした (' + (e.message || 'worker error') + ')')); };
        this._worker.postMessage({ type: 'init', lameUrl: lameUrl(), sampleRate: this._sampleRate, kbps });
      }).catch((err) => { this._cleanup(); throw err; });

      this._src = this._ctx.createMediaStreamSource(this._stream);
      this._proc = this._ctx.createScriptProcessor(4096, 1, 1);
      this._gain = this._ctx.createGain();
      this._gain.gain.value = 0; // スピーカーには出さない（ハウリング防止）
      this._proc.onaudioprocess = (e) => {
        if (this.state !== 'recording') return;
        const f = e.inputBuffer.getChannelData(0);
        const i16 = new Int16Array(f.length);
        let sum = 0;
        for (let i = 0; i < f.length; i++) {
          const s = Math.max(-1, Math.min(1, f[i]));
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
          sum += s * s;
        }
        this._samples += f.length;
        this._worker.postMessage({ type: 'chunk', samples: i16 }, [i16.buffer]);
        if (this._onLevel) this._onLevel(Math.min(1, Math.sqrt(sum / f.length) * 4));
        const t = this._samples / this._sampleRate;
        if (this._onTime && t - this._lastTime >= 0.25) { this._lastTime = t; this._onTime(t); }
      };
      this._src.connect(this._proc);
      this._proc.connect(this._gain);
      this._gain.connect(this._ctx.destination);
      this.state = 'recording';
    },

    pause() { if (this.state === 'recording') this.state = 'paused'; },
    resume() { if (this.state === 'paused') this.state = 'recording'; },
    get duration() { return this._samples / this._sampleRate; },

    /** 停止して MP3 を返す */
    async stop() {
      if (this.state !== 'recording' && this.state !== 'paused') throw new Error('録音していません');
      this.state = 'stopping';
      const duration = this.duration;
      const worker = this._worker;
      const blob = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('MP3 の書き出しに時間がかかりすぎています')), 60000);
        worker.onmessage = (e) => {
          if (e.data.type === 'done') { clearTimeout(t); resolve(e.data.blob); }
          else if (e.data.type === 'error') { clearTimeout(t); reject(new Error(e.data.message)); }
        };
        worker.postMessage({ type: 'finish' });
      }).finally(() => this._cleanup());
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const name = `recording-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.mp3`;
      const file = new File([blob], name, { type: 'audio/mpeg' });
      return { blob, file, duration };
    },

    cancel() { if (this.state !== 'idle') this._cleanup(); },

    _cleanup() {
      try { if (this._proc) { this._proc.disconnect(); this._proc.onaudioprocess = null; } } catch (e) { /* noop */ }
      try { if (this._src) this._src.disconnect(); } catch (e) { /* noop */ }
      try { if (this._gain) this._gain.disconnect(); } catch (e) { /* noop */ }
      try { if (this._stream) this._stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* noop */ }
      try { if (this._ctx) this._ctx.close(); } catch (e) { /* noop */ }
      try { if (this._worker) this._worker.terminate(); } catch (e) { /* noop */ }
      this._proc = this._src = this._gain = this._stream = this._ctx = this._worker = null;
      this.state = 'idle';
    },
  };

  window.AudioRecorder = rec;
})();
