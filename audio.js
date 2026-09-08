// All sounds are made with the browser's built-in audio engine, so no sound files are needed.

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.ambientNodes = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
  }

  now() { return this.ctx ? this.ctx.currentTime : 0; }

  // Low rumbling water bed plus soft bubbling.
  startAmbient(depthFactor = 0.5) {
    this.ensure();
    if (!this.ctx || this.ambientNodes) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 260 + 300 * (1 - depthFactor);
    const g = ctx.createGain();
    g.gain.value = 0.0;
    g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + 1.5);
    src.connect(lp); lp.connect(g); g.connect(this.master);
    src.start();
    this.ambientNodes = { src, g };
    this._bubbleTimer = setInterval(() => { if (Math.random() < 0.6) this.bubble(0.05 + Math.random() * 0.06); }, 900);
  }

  stopAmbient() {
    if (!this.ambientNodes) return;
    const { src, g } = this.ambientNodes;
    g.gain.linearRampToValueAtTime(0, this.now() + 0.6);
    setTimeout(() => { try { src.stop(); } catch (e) {} }, 700);
    this.ambientNodes = null;
    clearInterval(this._bubbleTimer);
  }

  _tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  bubble(vol = 0.08) { this._tone(300 + Math.random() * 500, 0.18, 'sine', vol, 900 + Math.random() * 600); }

  shot(power = 50) {
    this.ensure(); if (!this.ctx) return;
    // Rubber-band twang: quick drop in pitch plus a noise burst.
    this._tone(180 + power * 2, 0.22, 'triangle', 0.5, 60);
    const ctx = this.ctx, t = ctx.currentTime;
    const len = ctx.sampleRate * 0.15;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1200;
    const g = ctx.createGain(); g.gain.value = 0.35;
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
  }

  hit() { this._tone(140, 0.25, 'square', 0.35, 70); this.bubble(0.15); this.bubble(0.12); }

  catchChime() {
    const n = [523, 659, 784, 1046];
    n.forEach((f, i) => setTimeout(() => this._tone(f, 0.5, 'sine', 0.3), i * 90));
  }

  trophy() {
    const n = [523, 659, 784, 1046, 1318];
    n.forEach((f, i) => setTimeout(() => { this._tone(f, 0.6, 'sine', 0.3); this._tone(f / 2, 0.6, 'triangle', 0.15); }, i * 80));
  }

  fail() { this._tone(220, 0.35, 'sawtooth', 0.25, 110); setTimeout(() => this._tone(160, 0.4, 'sawtooth', 0.25, 80), 120); }

  penalty() { this._tone(110, 0.6, 'sawtooth', 0.3, 55); }

  click() { this.ensure(); this._tone(900, 0.06, 'square', 0.08); }

  breath() { this.bubble(0.12); setTimeout(() => this.bubble(0.1), 120); setTimeout(() => this.bubble(0.08), 260); }

  warn() { this._tone(880, 0.12, 'square', 0.12); }
}
