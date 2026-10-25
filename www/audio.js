/* Songpad sound: drum synth, metronome click, chord and guitar voices, and the transport
   that keeps beat, click and chords in time. Everything is built from Web Audio nodes,
   so there are no sample files to ship. */
(function (root) {
  'use strict';

  var ctx = null, master = null, noiseBuf = null, adhoc = null;
  var LANE_IDS = ['kick', 'snare', 'hat', 'clap', 'crash'];

  function makeNoise(c) {
    var len = c.sampleRate;
    var b = c.createBuffer(1, len, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function ensure() {
    if (!ctx) {
      var Ctx = root.AudioContext || root.webkitAudioContext;
      ctx = new Ctx();
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 20; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = makeNoise(ctx);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function newBus(c) {
    var g = c.createGain();
    g.connect(master);
    return g;
  }
  function killBus(bus) {
    if (!bus || !ctx) return;
    var now = ctx.currentTime;
    try {
      bus.gain.cancelScheduledValues(now);
      bus.gain.setTargetAtTime(0, now, 0.015);
    } catch (e) { /* already gone */ }
    setTimeout(function () { try { bus.disconnect(); } catch (e) { /* ignore */ } }, 400);
  }

  function env(g, t, peak, att, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(Math.max(0.0002, peak), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function noiseSrc(c, nb, t, dur) {
    var s = c.createBufferSource();
    s.buffer = nb;
    s.loop = true;
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur);
    return s;
  }
  function filt(c, type, freq, q) {
    var f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  // Every drum is (context, destination, start time, loudness 0..1, noise buffer)
  var DRUMS = {
    kick: function (c, dest, t, v) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(155, t);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
      env(g, t, 1.0 * v, 0.002, 0.36);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + 0.45);
    },
    snare: function (c, dest, t, v, nb) {
      var n = noiseSrc(c, nb, t, 0.3), hp = filt(c, 'highpass', 1400), g = c.createGain();
      env(g, t, 0.8 * v, 0.001, 0.17);
      n.connect(hp); hp.connect(g); g.connect(dest);
      var o = c.createOscillator(), g2 = c.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      env(g2, t, 0.55 * v, 0.001, 0.1);
      o.connect(g2); g2.connect(dest);
      o.start(t); o.stop(t + 0.2);
    },
    hat: function (c, dest, t, v, nb) {
      var n = noiseSrc(c, nb, t, 0.1), hp = filt(c, 'highpass', 7000), g = c.createGain();
      env(g, t, 0.4 * v, 0.001, 0.05);
      n.connect(hp); hp.connect(g); g.connect(dest);
    },
    clap: function (c, dest, t, v, nb) {
      var n = noiseSrc(c, nb, t, 0.35), bp = filt(c, 'bandpass', 1400, 0.9), g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      for (var k = 0; k < 3; k++) {
        var tt = t + k * 0.012;
        g.gain.linearRampToValueAtTime(0.9 * v, tt + 0.001);
        g.gain.exponentialRampToValueAtTime(0.12 * v + 0.0001, tt + 0.011);
      }
      var tl = t + 0.036;
      g.gain.linearRampToValueAtTime(0.85 * v, tl + 0.001);
      g.gain.exponentialRampToValueAtTime(0.0001, tl + 0.22);
      n.connect(bp); bp.connect(g); g.connect(dest);
    },
    crash: function (c, dest, t, v, nb) {
      var n = noiseSrc(c, nb, t, 1.8), hp = filt(c, 'highpass', 4200), g = c.createGain();
      env(g, t, 0.5 * v, 0.002, 1.5);
      n.connect(hp); hp.connect(g); g.connect(dest);
      var n2 = noiseSrc(c, nb, t, 1.4), bp = filt(c, 'bandpass', 7500, 0.5), g2 = c.createGain();
      env(g2, t, 0.3 * v, 0.002, 1.0);
      n2.connect(bp); bp.connect(g2); g2.connect(dest);
    }
  };

  function click(c, dest, t, accent) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1700 : 1100;
    env(g, t, accent ? 0.6 : 0.4, 0.001, 0.035);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 0.08);
  }

  /* ---------- chords and guitar ---------- */

  function tone(c, dest, midi, t, len, peak, bass) {
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    var g = c.createGain(), lp = filt(c, 'lowpass', bass ? 700 : 2400);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(peak * 0.5, t + Math.min(0.5, len * 0.5));
    g.gain.setTargetAtTime(0.0001, t + len - 0.12, 0.05);
    var o = c.createOscillator();
    o.type = bass ? 'sine' : 'triangle';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t); o.stop(t + len + 0.3);
    if (!bass) {
      var o2 = c.createOscillator(), g2 = c.createGain();
      o2.type = 'sine';
      o2.frequency.value = f * 2;
      g2.gain.value = 0.25;
      o2.connect(g2); g2.connect(lp);
      o2.start(t); o2.stop(t + len + 0.3);
    }
    lp.connect(g); g.connect(dest);
  }

  // midis: chord tones, bass: one note. Slight strum so it sounds played, not stamped.
  function chord(c, dest, midis, bass, t, len) {
    tone(c, dest, bass, t, len, 0.22, true);
    midis.forEach(function (m, i) { tone(c, dest, m, t + i * 0.012, len, 0.11, false); });
  }

  function pluck(c, dest, midi, t, peak) {
    var f = 440 * Math.pow(2, (midi - 69) / 12);
    var o = c.createOscillator(), lp = filt(c, 'lowpass', 3200, 1), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = f;
    lp.frequency.setValueAtTime(3200, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.5);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(lp); lp.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 1.7);
  }

  function stopAdhoc() { killBus(adhoc); adhoc = null; }

  // Play a chord now. Clicking another chord cuts the last one off.
  function chordNow(midis, bass, len) {
    var c = ensure();
    stopAdhoc();
    adhoc = newBus(c);
    chord(c, adhoc, midis, bass, c.currentTime + 0.01, len || 1.8);
  }
  function strumNow(midis) {
    var c = ensure();
    stopAdhoc();
    adhoc = newBus(c);
    var t = c.currentTime + 0.01;
    midis.forEach(function (m, i) { pluck(c, adhoc, m, t + i * 0.028, 0.16); });
  }
  function drumNow(lane, v) {
    var c = ensure();
    if (DRUMS[lane]) DRUMS[lane](c, master, c.currentTime + 0.005, v || 1, noiseBuf);
  }
  function clickNow() { var c = ensure(); click(c, master, c.currentTime + 0.005, true); }

  /* ---------- transport ---------- */

  // Moves the off-beat 8th later for swing. p is the 16th inside a beat (0..3); s is 0..0.5.
  function warp(p, s) { return p < 2 ? p * (1 + s) : 2 + 2 * s + (p - 2) * (1 - s); }

  function Transport() {
    this.playing = false;
    this.queue = [];
    this.timer = null;
    this.bus = null;
    this.onstop = null;
  }

  // state: getters bpm(), swing(), bars(), grid(), mute(), vol(), click(), drums(); countIn (bool);
  // chords: null or {list: [{midis, bass, name}], loop()}
  Transport.prototype.start = function (state) {
    var c = ensure();
    this.stop(true);
    this.state = state;
    this.playing = true;
    this.ending = false;
    this.queue = [];
    this.step = state.countIn ? -16 : 0;
    this.beatStart = c.currentTime + 0.1;
    this.bus = newBus(c);
    var self = this;
    this.timer = setInterval(function () { self.pump(); }, 25);
    this.pump();
  };

  Transport.prototype.pump = function () {
    if (!this.playing) return;
    var s = this.state;
    while (!this.ending && this.beatStart < ctx.currentTime + 0.18) {
      var beat = 60 / Math.max(30, s.bpm());
      var sw = Math.min(0.5, Math.max(0, s.swing()));
      for (var j = 0; j < 4; j++) {
        this.sched(this.step + j, j, this.beatStart + warp(j, sw) * beat / 4, beat);
      }
      this.step += 4;
      this.beatStart += beat;
    }
  };

  Transport.prototype.sched = function (idx, j, t, beat) {
    if (this.ending) return;
    var s = this.state, bus = this.bus;
    if (idx < 0) {
      if (j === 0) click(ctx, bus, t, (idx + 16) % 16 === 0);
      this.queue.push({ t: t, step: idx, chord: -1 });
      return;
    }
    var total = s.bars() * 16, gi = idx % total, chordIdx = -1;
    if (s.chords && idx % 16 === 0) {
      var bi = Math.floor(idx / 16), list = s.chords.list;
      if (!s.chords.loop() && bi >= list.length) {
        this.ending = true;
        var self = this;
        setTimeout(function () { self.stop(); }, Math.max(0, (t - ctx.currentTime) * 1000) + 30);
        return;
      }
      chordIdx = bi % list.length;
      var ch = list[chordIdx];
      chord(ctx, bus, ch.midis, ch.bass, t, beat * 4 * 0.98);
    }
    if (s.click() && j === 0) click(ctx, bus, t, idx % 16 === 0);
    if (s.drums()) {
      var grid = s.grid(), mute = s.mute(), vol = s.vol();
      for (var k = 0; k < LANE_IDS.length; k++) {
        var lane = LANE_IDS[k], v = grid[lane] && grid[lane][gi];
        if (v && !mute[lane]) DRUMS[lane](ctx, bus, t, (v === 2 ? 0.45 : 1) * vol, noiseBuf);
      }
    }
    this.queue.push({ t: t, step: idx, chord: chordIdx });
  };

  // What the listener is hearing now: {step, chord} or null if nothing new is due.
  Transport.prototype.poll = function () {
    if (!ctx || !this.queue.length) return null;
    var now = ctx.currentTime, out = null;
    while (this.queue.length && this.queue[0].t <= now) {
      var q = this.queue.shift();
      if (!out) out = { step: q.step, chord: -1 };
      out.step = q.step;
      if (q.chord >= 0) out.chord = q.chord;
    }
    return out;
  };

  Transport.prototype.stop = function (silent) {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    var was = this.playing;
    this.playing = false;
    killBus(this.bus);
    this.bus = null;
    this.queue = [];
    if (was && !silent && this.onstop) this.onstop();
  };

  root.SongAudio = {
    ensure: ensure, context: function () { return ctx; },
    DRUMS: DRUMS, LANES: LANE_IDS, makeNoise: makeNoise, click: click,
    chordNow: chordNow, strumNow: strumNow, drumNow: drumNow, clickNow: clickNow, stopAdhoc: stopAdhoc,
    Transport: Transport, warp: warp
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SongAudio;
})(typeof window !== 'undefined' ? window : globalThis);
