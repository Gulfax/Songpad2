/* Songpad core: pitch detection, note segmentation, key and chord theory.
   No DOM access, so it runs in the browser and in Node for testing. */
(function (root) {
  'use strict';

  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

  // Krumhansl-Kessler key profiles
  const MAJ_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MIN_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  const SCALE = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

  // Major keys spelled with flats: Db, Eb, F, Ab, Bb
  const FLAT_MAJORS = [1, 3, 5, 8, 10];

  function useFlats(tonic, mode) {
    const rel = mode === 'major' ? tonic : (tonic + 3) % 12;
    return FLAT_MAJORS.indexOf(rel) !== -1;
  }
  function noteName(pc, flats) {
    return (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12];
  }
  function midiName(midi, flats) {
    const n = Math.round(midi);
    return noteName(n, flats) + (Math.floor(n / 12) - 1);
  }
  function keyLabel(k) {
    return noteName(k.tonic, useFlats(k.tonic, k.mode)) + ' ' + k.mode;
  }
  function keyPcs(k) {
    return SCALE[k.mode].map(function (o) { return (k.tonic + o) % 12; });
  }

  /* ---------- pitch detection (YIN) ---------- */

  function rms(buf) {
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    return Math.sqrt(s / buf.length);
  }

  function yin(buf, sr, opts) {
    opts = opts || {};
    const minHz = opts.minHz || 75;
    const maxHz = opts.maxHz || 1000;
    const thr = opts.threshold || 0.15;
    const W = Math.floor(buf.length / 2);
    const tauMax = Math.min(W - 1, Math.floor(sr / minHz));
    const tauMin = Math.max(2, Math.floor(sr / maxHz));
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const x = buf[i] - buf[i + tau];
        s += x * x;
      }
      d[tau] = s;
    }
    const cm = new Float32Array(tauMax + 1);
    cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      cm[tau] = run === 0 ? 1 : (d[tau] * tau) / run;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cm[t] < thr) {
        while (t + 1 < tauMax && cm[t + 1] < cm[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau === -1) return null;
    const x0 = tau > 1 ? cm[tau - 1] : cm[tau];
    const x2 = tau < tauMax ? cm[tau + 1] : cm[tau];
    const denom = 2 * (2 * cm[tau] - x2 - x0);
    const shift = denom !== 0 ? (x2 - x0) / denom : 0;
    return { freq: sr / (tau + shift), clarity: 1 - cm[tau] };
  }

  function freqToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }

  /* ---------- turn pitch frames into note events ---------- */

  // frames: [{t: seconds, midi: float | null}]
  function segment(frames, opts) {
    opts = opts || {};
    const win = opts.win || 5;
    const minDur = opts.minDur || 0.09;
    const maxFrameDt = 0.12;
    const n = frames.length;
    if (n === 0) return [];
    const rounded = frames.map(function (f) { return f.midi == null ? null : Math.round(f.midi); });
    const half = Math.floor(win / 2);
    const smooth = new Array(n);
    for (let i = 0; i < n; i++) {
      const vals = [];
      for (let j = Math.max(0, i - half); j <= Math.min(n - 1, i + half); j++) {
        if (rounded[j] != null) vals.push(rounded[j]);
      }
      if (vals.length < Math.ceil(win / 2)) { smooth[i] = null; continue; }
      vals.sort(function (a, b) { return a - b; });
      smooth[i] = vals[Math.floor(vals.length / 2)];
    }
    function dt(i) {
      const next = i + 1 < n ? frames[i + 1].t : frames[i].t + 0.02;
      return Math.min(Math.max(next - frames[i].t, 0), maxFrameDt);
    }
    const events = [];
    let i = 0;
    while (i < n) {
      if (smooth[i] == null) { i++; continue; }
      const midi = smooth[i];
      let j = i;
      let dur = 0;
      while (j < n && smooth[j] === midi) {
        if (j > i && frames[j].t - frames[j - 1].t > 0.25) break;
        dur += dt(j);
        j++;
      }
      if (dur >= minDur) {
        events.push({ midi: midi, t: Math.round(frames[i].t * 100) / 100, dur: Math.round(dur * 100) / 100 });
      }
      i = j;
    }
    return events;
  }

  async function analyzeSamples(x, sr, onProgress) {
    let data = x;
    let rate = sr;
    if (sr >= 40000) {
      const n = Math.floor(x.length / 2);
      data = new Float32Array(n);
      for (let i = 0; i < n; i++) data[i] = (x[2 * i] + x[2 * i + 1]) / 2;
      rate = sr / 2;
    }
    const N = 2048;
    const hop = 1024;
    const buf = new Float32Array(N);
    const frames = [];
    const total = Math.max(0, Math.floor((data.length - N) / hop));
    for (let f = 0; f <= total; f++) {
      const off = f * hop;
      if (off + N > data.length) break;
      buf.set(data.subarray(off, off + N));
      let midi = null;
      if (rms(buf) > 0.012) {
        const r = yin(buf, rate);
        if (r && r.clarity > 0.8) midi = freqToMidi(r.freq);
      }
      frames.push({ t: (off + N / 2) / rate, midi: midi });
      if (f % 25 === 0) {
        if (onProgress) onProgress(f / Math.max(1, total));
        await new Promise(function (r) { setTimeout(r, 0); });
      }
    }
    return { events: segment(frames, { win: 3, minDur: 0.1 }), duration: data.length / rate };
  }

  /* ---------- key detection ---------- */

  function pcProfile(events) {
    const p = new Array(12).fill(0);
    events.forEach(function (e) {
      p[((e.midi % 12) + 12) % 12] += Math.min(e.dur, 1.5);
    });
    return p;
  }

  function pearson(a, b) {
    const n = a.length;
    let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      const x = a[i] - ma, y = b[i] - mb;
      num += x * y; da += x * x; db += y * y;
    }
    return da === 0 || db === 0 ? 0 : num / Math.sqrt(da * db);
  }

  function detectKeys(profile) {
    let total = 0;
    profile.forEach(function (v) { total += v; });
    if (total <= 0) return [];
    const out = [];
    for (let t = 0; t < 12; t++) {
      const rot = [];
      for (let i = 0; i < 12; i++) rot.push(profile[(t + i) % 12]);
      out.push({ tonic: t, mode: 'major', score: pearson(rot, MAJ_PROFILE) });
      out.push({ tonic: t, mode: 'minor', score: pearson(rot, MIN_PROFILE) });
    }
    out.sort(function (a, b) { return b.score - a.score; });
    return out;
  }

  /* ---------- chords ---------- */

  const DEGREES = {
    major: [
      { r: 'I', o: 0, q: 'maj' }, { r: 'ii', o: 2, q: 'min' }, { r: 'iii', o: 4, q: 'min' },
      { r: 'IV', o: 5, q: 'maj' }, { r: 'V', o: 7, q: 'maj', dom: 1 }, { r: 'vi', o: 9, q: 'min' },
      { r: 'vii°', o: 11, q: 'dim' }
    ],
    minor: [
      { r: 'i', o: 0, q: 'min' }, { r: 'ii°', o: 2, q: 'dim' }, { r: 'III', o: 3, q: 'maj' },
      { r: 'iv', o: 5, q: 'min' }, { r: 'v', o: 7, q: 'min' }, { r: 'V', o: 7, q: 'maj', dom: 1 },
      { r: 'VI', o: 8, q: 'maj' }, { r: 'VII', o: 10, q: 'maj', dom: 1 }
    ]
  };
  const TRIAD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };

  function chordName(root, q, dom, sevenths, flats) {
    const base = noteName(root, flats);
    if (q === 'maj') return base + (sevenths ? (dom ? '7' : 'maj7') : '');
    if (q === 'min') return base + (sevenths ? 'm7' : 'm');
    return base + (sevenths ? 'm7b5' : 'dim');
  }

  function chordIntervals(chord, sevenths) {
    const iv = TRIAD[chord.q].slice();
    if (sevenths) {
      if (chord.q === 'maj') iv.push(chord.dom ? 10 : 11);
      else iv.push(10);
    }
    return iv;
  }

  function chordsFor(key, sevenths) {
    const flats = useFlats(key.tonic, key.mode);
    return DEGREES[key.mode].map(function (d) {
      const root = (key.tonic + d.o) % 12;
      return {
        roman: d.r, root: root, q: d.q, dom: !!d.dom,
        tones: TRIAD[d.q].map(function (i) { return (root + i) % 12; }),
        name: chordName(root, d.q, !!d.dom, sevenths, flats)
      };
    });
  }

  const PROGRESSIONS = {
    major: [
      { name: 'Pop anthem', mood: 'bright and familiar', steps: ['I', 'V', 'vi', 'IV'] },
      { name: 'Sensitive start', mood: 'wistful, then lifts', steps: ['vi', 'IV', 'I', 'V'] },
      { name: 'Fifties', mood: 'warm and nostalgic', steps: ['I', 'vi', 'IV', 'V'] },
      { name: 'Folk', mood: 'open and easy', steps: ['I', 'IV', 'V', 'I'] },
      { name: 'Hopeful lift', mood: 'gentle, rising', steps: ['I', 'IV', 'vi', 'V'] },
      { name: 'Turnaround', mood: 'smooth and jazzy', steps: ['ii', 'V', 'I', 'vi'] },
      { name: 'Walk up', mood: 'steady, building', steps: ['I', 'iii', 'IV', 'V'] },
      { name: 'Canon', mood: 'stately, eight bars', steps: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'] }
    ],
    minor: [
      { name: 'Epic minor', mood: 'big and dramatic', steps: ['i', 'VI', 'III', 'VII'] },
      { name: 'Andalusian', mood: 'dark, flamenco feel', steps: ['i', 'VII', 'VI', 'V'] },
      { name: 'Brooding', mood: 'moody, circling', steps: ['i', 'iv', 'VII', 'III'] },
      { name: 'Classic minor', mood: 'plain and strong', steps: ['i', 'iv', 'V', 'i'] },
      { name: 'Sad pop', mood: 'melancholy, wide', steps: ['i', 'III', 'VII', 'VI'] },
      { name: 'Slow burn', mood: 'cinematic', steps: ['i', 'VI', 'VII', 'i'] },
      { name: 'Smoky turnaround', mood: 'late night', steps: ['ii°', 'V', 'i', 'iv'] }
    ]
  };

  function coverage(chord, profile, total) {
    if (total <= 0) return 0;
    let s = 0;
    chord.tones.forEach(function (pc) { s += profile[pc]; });
    return s / total;
  }

  function rankProgressions(key, profile, sevenths) {
    const chords = chordsFor(key, sevenths);
    let total = 0;
    profile.forEach(function (v) { total += v; });
    const byRoman = {};
    chords.forEach(function (c) { byRoman[c.roman] = c; });
    const out = PROGRESSIONS[key.mode].map(function (p, idx) {
      const list = p.steps.map(function (r) { return byRoman[r]; });
      const uniq = Array.from(new Set(list));
      let fit = 0;
      uniq.forEach(function (c) { fit += coverage(c, profile, total); });
      fit = uniq.length ? fit / uniq.length : 0;
      return { name: p.name, mood: p.mood, steps: p.steps, chords: list, fit: fit, idx: idx };
    });
    out.sort(function (a, b) { return b.fit - a.fit || a.idx - b.idx; });
    return out;
  }

  // Best chord for each sung phrase (phrases split on silences)
  function phrases(events, key, sevenths) {
    if (!events.length) return [];
    const chords = chordsFor(key, sevenths);
    const groups = [];
    let cur = [events[0]];
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      if (events[i].t - (prev.t + prev.dur) > 0.5) { groups.push(cur); cur = []; }
      cur.push(events[i]);
    }
    groups.push(cur);
    return groups.map(function (g) {
      const prof = pcProfile(g);
      let total = 0;
      prof.forEach(function (v) { total += v; });
      const first = ((g[0].midi % 12) + 12) % 12;
      const last = ((g[g.length - 1].midi % 12) + 12) % 12;
      const scored = chords.map(function (c) {
        let s = coverage(c, prof, total);
        if (c.tones.indexOf(first) !== -1) s += 0.12;
        if (c.tones.indexOf(last) !== -1) s += 0.12;
        if (c.roman === 'I' || c.roman === 'i' || c.roman === 'V' || c.roman === 'IV' || c.roman === 'iv') s += 0.03;
        return { c: c, s: s };
      });
      scored.sort(function (a, b) { return b.s - a.s; });
      const lastEv = g[g.length - 1];
      return {
        t: g[0].t,
        end: lastEv.t + lastEv.dur,
        best: scored[0].c,
        alt: scored[1] && scored[1].s > scored[0].s - 0.08 ? scored[1].c : null
      };
    });
  }


  /* ---------- fit a melody to a voice ---------- */

  // voice: {low, high} as MIDI numbers. Looks at shifts of -7..+7 semitones.
  function fitToRange(events, voice, key) {
    if (!events.length || !voice || voice.low == null || voice.high == null) return null;
    let ml = Infinity, mh = -Infinity;
    events.forEach(function (e) { ml = Math.min(ml, e.midi); mh = Math.max(mh, e.midi); });
    const span = mh - ml;
    const rangeSpan = voice.high - voice.low;
    const all = [];
    for (let s = -7; s <= 7; s++) {
      const lowGap = ml + s - voice.low;      // >= 0 means the lowest note is reachable
      const highGap = voice.high - (mh + s);  // >= 0 means the highest note is reachable
      const over = Math.max(0, -lowGap) + Math.max(0, -highGap);
      all.push({
        shift: s, margin: Math.min(lowGap, highGap), over: over, fits: over === 0,
        tonic: ((key.tonic + s) % 12 + 12) % 12, mode: key.mode
      });
    }
    const fitting = all.filter(function (r) { return r.fits; });
    fitting.sort(function (a, b) { return Math.abs(a.shift) - Math.abs(b.shift) || b.margin - a.margin; });
    let results = fitting.slice(0, 3);
    if (!results.length) {
      const sorted = all.slice().sort(function (a, b) { return a.over - b.over || Math.abs(a.shift) - Math.abs(b.shift); });
      results = [sorted[0]];
    }
    return {
      melodyLow: ml, melodyHigh: mh, span: span, rangeSpan: rangeSpan,
      fitsAsSung: all[7].fits, results: results, anyFit: fitting.length > 0
    };
  }

  // Low and high notes from a range-test recording. Short blips are ignored.
  function measureRange(events) {
    const sust = events.filter(function (e) { return e.dur >= 0.25; });
    if (sust.length < 2) return null;
    let lo = Infinity, hi = -Infinity;
    sust.forEach(function (e) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); });
    if (hi - lo < 3) return null;
    return { low: lo, high: hi };
  }

  /* ---------- guitar shapes and capo ---------- */

  const GUITAR_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  const SUFFIX = { maj: '', min: 'm', dim: 'dim', '7': '7', maj7: 'maj7', m7: 'm7', m7b5: 'm7b5' };

  function chordType(c, sevenths) {
    if (c.q === 'maj') return sevenths ? (c.dom ? '7' : 'maj7') : 'maj';
    if (c.q === 'min') return sevenths ? 'm7' : 'min';
    return sevenths ? 'm7b5' : 'dim';
  }
  function shapeName(root, type) { return GUITAR_NAMES[((root % 12) + 12) % 12] + SUFFIX[type]; }

  // Strings low E to high e. -1 is muted, 0 is open.
  const OPEN_SHAPES = {
    '0:maj': [-1, 3, 2, 0, 1, 0], '0:7': [-1, 3, 2, 3, 1, 0], '0:maj7': [-1, 3, 2, 0, 0, 0],
    '2:maj': [-1, -1, 0, 2, 3, 2], '2:min': [-1, -1, 0, 2, 3, 1], '2:7': [-1, -1, 0, 2, 1, 2],
    '2:maj7': [-1, -1, 0, 2, 2, 2], '2:m7': [-1, -1, 0, 2, 1, 1],
    '7:maj': [3, 2, 0, 0, 0, 3], '7:7': [3, 2, 0, 0, 0, 1], '7:maj7': [3, 2, 0, 0, 0, 2],
    '11:7': [-1, 2, 1, 2, 0, 2], '5:maj7': [-1, -1, 3, 2, 1, 0]
  };
  const E_SHAPES = { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], maj7: [0, 2, 1, 1, 0, 0] };
  const A_SHAPES = { maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], '7': [-1, 0, 2, 0, 2, 0], m7: [-1, 0, 2, 0, 1, 0], maj7: [-1, 0, 2, 1, 2, 0] };

  // Returns {frets, barre} or null when there is no diagram for this chord type.
  function fingering(root, type) {
    root = ((root % 12) + 12) % 12;
    const open = OPEN_SHAPES[root + ':' + type];
    if (open) return { frets: open.slice(), barre: false };
    if (!E_SHAPES[type]) return null;
    const fE = (root - 4 + 12) % 12;
    const fA = (root - 9 + 12) % 12;
    const useE = fE <= fA;
    const f = useE ? fE : fA;
    const base = useE ? E_SHAPES[type] : A_SHAPES[type];
    return { frets: base.map(function (x) { return x < 0 ? -1 : x + f; }), barre: f > 0 };
  }

  const OPEN_STRINGS = [40, 45, 50, 55, 59, 64];
  function fretPcs(frets) {
    const out = [];
    frets.forEach(function (f, i) {
      if (f >= 0) { const pc = (OPEN_STRINGS[i] + f) % 12; if (out.indexOf(pc) === -1) out.push(pc); }
    });
    return out.sort(function (a, b) { return a - b; });
  }

  // Rank capo positions 0..7 by how easy the shapes are to play.
  function capoOptions(chords, sevenths) {
    const opts = [];
    for (let capo = 0; capo <= 7; capo++) {
      let score = 0, hard = 0;
      const shapes = chords.map(function (c) {
        const root = ((c.root - capo) % 12 + 12) % 12;
        const type = chordType(c, sevenths);
        const fg = fingering(root, type);
        const cost = !fg ? 1.5 : fg.barre ? 1 : 0;
        score += cost;
        if (cost > 0) hard++;
        return { root: root, type: type, name: shapeName(root, type), fingering: fg, sounds: c.name };
      });
      opts.push({ capo: capo, score: score, hard: hard, shapes: shapes });
    }
    opts.sort(function (a, b) { return a.score - b.score || a.capo - b.capo; });
    return opts;
  }

  const api = {
    SHARP: SHARP, FLAT: FLAT, SCALE: SCALE,
    useFlats: useFlats, noteName: noteName, midiName: midiName, keyLabel: keyLabel, keyPcs: keyPcs,
    rms: rms, yin: yin, freqToMidi: freqToMidi, segment: segment, analyzeSamples: analyzeSamples,
    pcProfile: pcProfile, detectKeys: detectKeys,
    chordsFor: chordsFor, fitToRange: fitToRange, measureRange: measureRange, chordType: chordType,
    fingering: fingering, fretPcs: fretPcs, capoOptions: capoOptions, shapeName: shapeName, chordIntervals: chordIntervals, rankProgressions: rankProgressions, phrases: phrases
  };
  root.SongCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
