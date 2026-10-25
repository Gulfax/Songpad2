(function () {
  'use strict';
  var C = window.SongCore;
  var Beats = window.SongBeats;
  var Snd = window.SongAudio;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return [].slice.call(document.querySelectorAll(s)); };

  /* ---------- small helpers ---------- */
  function el(tag, attrs) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v == null || v === false) return;
        if (k === 'class') n.className = v;
        else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), v);
        else if (v === true) n.setAttribute(k, '');
        else n.setAttribute(k, v);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var kids = [].concat(arguments[i]);
      for (var j = 0; j < kids.length; j++) {
        var c = kids[j];
        if (c == null || c === false) continue;
        n.append(c.nodeType ? c : document.createTextNode(String(c)));
      }
    }
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function sv(tag, attrs, text) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(name) {
    var s = sv('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
    s.append(sv('path', { d: name === 'play' ? 'M7 4.5v15l12-7.5z' : 'M6 6h12v12H6z' }));
    return s;
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function fmtTime(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('show'); }, 4200);
  }
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function num(x, d) { return typeof x === 'number' && isFinite(x) ? x : d; }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  /* ---------- storage ---------- */
  var KEY = 'songpad.notes.v1';
  var notes = [];
  try {
    var parsed = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(parsed)) notes = parsed;
  } catch (e) { /* start fresh */ }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(notes)); }
    catch (e) { toast('Could not save. Browser storage may be full or blocked.'); }
  }

  var dbp = new Promise(function (res, rej) {
    try {
      var r = indexedDB.open('songpad', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('audio'); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    } catch (e) { rej(e); }
  });
  function idb(mode, fn) {
    return dbp.then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction('audio', mode);
        var rq = fn(t.objectStore('audio'));
        t.oncomplete = function () { res(rq && rq.result); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }
  function putAudio(id, blob) { return idb('readwrite', function (s) { return s.put(blob, id); }); }
  function getAudio(id) { return idb('readonly', function (s) { return s.get(id); }); }
  function delAudio(id) { return idb('readwrite', function (s) { return s.delete(id); }).catch(function () {}); }

  /* ---------- preferences and voice range ---------- */
  var PKEY = 'songpad.prefs.v1';
  var prefs = { click: true, drums: false, countIn: false, loop: true, presetTempo: true, tool: 'record' };
  try {
    var pp = JSON.parse(localStorage.getItem(PKEY));
    if (pp && typeof pp === 'object') Object.keys(prefs).forEach(function (k) { if (typeof pp[k] === typeof prefs[k]) prefs[k] = pp[k]; });
  } catch (e) { /* defaults */ }
  function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }

  var VKEY = 'songpad.voice.v1';
  var vocalRange = null;
  try {
    var pv = JSON.parse(localStorage.getItem(VKEY));
    if (pv && typeof pv.low === 'number' && typeof pv.high === 'number' && pv.low < pv.high) vocalRange = { low: pv.low, high: pv.high };
  } catch (e) { /* no saved range */ }
  function saveVocalRange() {
    try { localStorage.setItem(VKEY, JSON.stringify(vocalRange)); } catch (e) { /* ignore */ }
  }

  /* ---------- saving files out of the app ---------- */
  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(fr.result); };
      fr.onerror = function () { rej(fr.error); };
      fr.readAsDataURL(blob);
    });
  }
  function dataUrlToBlob(url) {
    var i = url.indexOf(';base64,');
    if (url.indexOf('data:') !== 0 || i < 0) throw new Error('bad data url');
    var mime = url.slice(5, i);
    var bin = atob(url.slice(i + 8));
    var bytes = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
    return new Blob([bytes], { type: mime });
  }
  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function safeName(s) { return (s || 'song').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'song'; }

  // Android app: write to cache and open the share sheet. Everywhere else: a normal download.
  function saveFile(blob, name) {
    var cap = window.Capacitor;
    var P = cap && cap.Plugins;
    if (cap && cap.isNativePlatform && cap.isNativePlatform() && P && P.Filesystem && P.Share) {
      return blobToDataUrl(blob).then(function (u) {
        return P.Filesystem.writeFile({ path: name, data: u.slice(u.indexOf(',') + 1), directory: 'CACHE' });
      }).then(function () {
        return P.Filesystem.getUri({ path: name, directory: 'CACHE' });
      }).then(function (r) {
        return P.Share.share({ title: name, url: r.uri });
      });
    }
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 20000);
    return Promise.resolve();
  }

  /* ---------- notes ---------- */
  var curId = null;
  var curBar = 0;
  function cur() { return notes.filter(function (n) { return n.id === curId; })[0]; }

  function defaultBeat() {
    var pr = Beats.byId('basic8');
    return { preset: 'basic8', bars: 2, swing: pr.swing, mute: {}, vol: 0.8, grid: Beats.buildGrid(pr, 2) };
  }
  function beatOf(n) {
    if (!n.beat || !n.beat.grid) n.beat = defaultBeat();
    return n.beat;
  }
  function sanitizeBeat(b) {
    if (!b || typeof b !== 'object') return null;
    var bars = clamp(Math.round(num(b.bars, 2)), 2, 4);
    var grid = Beats.emptyGrid(bars);
    Beats.LANES.forEach(function (l) {
      var src = b.grid && b.grid[l.id];
      if (!Array.isArray(src)) return;
      for (var i = 0; i < bars * 16; i++) grid[l.id][i] = src[i] === 1 || src[i] === 2 ? src[i] : 0;
    });
    var mute = {};
    Beats.LANES.forEach(function (l) { if (b.mute && b.mute[l.id] === true) mute[l.id] = true; });
    return {
      preset: typeof b.preset === 'string' && Beats.byId(b.preset) ? b.preset : null,
      bars: bars, swing: clamp(num(b.swing, 0), 0, 0.5), mute: mute, vol: clamp(num(b.vol, 0.8), 0.1, 1), grid: grid
    };
  }

  function newNote() {
    var n = { id: uid(), title: '', lyrics: '', updated: Date.now(), recs: [], key: null, sevenths: false, bpm: 96, beat: defaultBeat() };
    notes.unshift(n);
    persist();
    return n;
  }

  var saveT;
  function touch() {
    var n = cur();
    if (!n) return;
    n.updated = Date.now();
    $('#saved').textContent = 'Saving...';
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      persist();
      $('#saved').textContent = 'Saved on this device';
      renderList();
    }, 350);
  }

  function renderList() {
    var q = $('#search').value.trim().toLowerCase();
    var ul = $('#noteList');
    ul.replaceChildren();
    var shown = notes.slice().sort(function (a, b) { return b.updated - a.updated; }).filter(function (n) {
      return !q || (n.title + ' ' + n.lyrics).toLowerCase().indexOf(q) !== -1;
    });
    if (!shown.length) ul.append(el('li', { class: 'empty' }, q ? 'No notes match.' : 'No notes yet.'));
    shown.forEach(function (n) {
      var firstLine = (n.lyrics.split('\n').filter(function (l) { return l.trim(); })[0]) || 'Empty';
      var takes = n.recs.length ? plural(n.recs.length, 'take') : 'No takes';
      ul.append(el('li', null,
        el('button', { type: 'button', 'aria-current': n.id === curId ? 'true' : 'false', onclick: function () { openNote(n.id); } },
          el('span', { class: 'n-title' }, n.title || 'Untitled'),
          el('span', { class: 'n-snip' }, firstLine),
          el('span', { class: 'n-meta' }, takes + ' · ' + new Date(n.updated).toLocaleDateString())
        )));
    });
  }

  function openNote(id) {
    if (rec && rec.noteId !== id) { toast('Stop recording before switching notes.'); return; }
    stopPlayer(); stopTransport(); Snd.stopAdhoc();
    curId = id;
    curBar = 0;
    var n = cur();
    beatOf(n);
    $('#title').value = n.title;
    $('#lyrics').value = n.lyrics;
    $('#saved').textContent = '';
    $('#bpm').value = n.bpm || 96;
    document.body.dataset.view = 'editor';
    renderList(); renderTakes(); renderAnalysis(); renderBeat();
  }

  /* ---------- tabs ---------- */
  function setTab(name) {
    var b = document.body;
    if (name !== 'lyrics') { b.dataset.tool = name; prefs.tool = name; savePrefs(); }
    b.dataset.tab = name;
    $$('#tabsTop button').forEach(function (x) { x.setAttribute('aria-selected', x.dataset.go === b.dataset.tool ? 'true' : 'false'); });
    $$('#tabsBottom button').forEach(function (x) { x.setAttribute('aria-selected', x.dataset.go === name ? 'true' : 'false'); });
    if (name === 'record') { renderTakes(); }
    if (name === 'beat') renderBeat();
  }

  /* ---------- takes ---------- */
  var player = null;
  function stopPlayer() {
    if (!player) return;
    player.a.pause();
    URL.revokeObjectURL(player.url);
    player = null;
    if (cur()) renderTakes();
  }
  function togglePlay(r) {
    if (player && player.id === r.id) { stopPlayer(); return; }
    stopPlayer();
    getAudio(r.id).then(function (blob) {
      if (!blob) { toast('The audio for this take is missing on this device.'); return; }
      var url = URL.createObjectURL(blob);
      var a = new Audio(url);
      a.onended = stopPlayer;
      player = { id: r.id, a: a, url: url };
      a.play().catch(function () { toast('Could not play this take.'); stopPlayer(); });
      renderTakes();
    }).catch(function () { toast('Could not read saved audio.'); });
  }

  function armedDelete(label, action) {
    var armed = false, t;
    var b = el('button', { class: 'btn ghost danger small', type: 'button' }, label);
    b.addEventListener('click', function () {
      if (!armed) {
        armed = true; b.dataset.armed = 'true'; b.textContent = 'Tap again to delete';
        t = setTimeout(function () { armed = false; delete b.dataset.armed; b.textContent = label; }, 3000);
      } else { clearTimeout(t); action(); }
    });
    return b;
  }

  function renderTakes() {
    var n = cur();
    if (!n) return;
    var ul = $('#takeList');
    ul.replaceChildren();
    if (!n.recs.length) {
      ul.append(el('li', { class: 'empty' }, 'No takes yet. Press the red button and sing a line.'));
      return;
    }
    var key = effectiveKey(n);
    n.recs.forEach(function (r, i) {
      var canvas = el('canvas', { class: 'roll', 'aria-label': 'Notes detected in ' + r.name });
      canvas._events = r.events; canvas._dur = r.dur;
      var playingNow = player && player.id === r.id;
      ul.append(el('li', { class: 'take' },
        el('div', { class: 'take-head' },
          el('button', { class: 'btn small', type: 'button', onclick: function () { togglePlay(r); } }, playingNow ? 'Stop' : 'Play'),
          el('input', {
            class: 'take-name', value: r.name, 'aria-label': 'Take name',
            onchange: function (e) { r.name = e.target.value || 'Take ' + (i + 1); touch(); renderAnalysis(); }
          }),
          el('span', { class: 'take-meta mono' }, fmtTime(r.dur) + ' · ' + r.events.length + ' notes'),
          el('label', { class: 'check' },
            el('input', {
              type: 'checkbox', checked: r.use ? true : false,
              onchange: function (e) { r.use = e.target.checked; touch(); renderAnalysis(); }
            }), 'Use'),
          armedDelete('Delete', function () {
            if (player && player.id === r.id) stopPlayer();
            delAudio(r.id);
            n.recs = n.recs.filter(function (x) { return x !== r; });
            touch(); renderTakes(); renderAnalysis();
          })
        ),
        canvas
      ));
    });
    requestAnimationFrame(function () {
      $$('#takeList canvas').forEach(function (c) { drawRoll(c, c._events, c._dur, key); });
    });
  }

  function fitCanvas(c) {
    var dpr = window.devicePixelRatio || 1;
    var w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    var g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g: g, w: w, h: h };
  }

  function drawRoll(c, events, dur, key) {
    var d = fitCanvas(c);
    if (!d) return;
    if (!events.length) {
      d.g.fillStyle = css('--muted'); d.g.font = '13px ' + css('--ui');
      d.g.fillText('No clear notes heard in this take', 12, d.h / 2 + 4);
      return;
    }
    var lo = Infinity, hi = -Infinity;
    events.forEach(function (e) { lo = Math.min(lo, e.midi); hi = Math.max(hi, e.midi); });
    lo -= 2; hi += 2;
    if (hi - lo < 12) { var mid = (hi + lo) / 2; lo = mid - 6; hi = mid + 6; }
    var total = Math.max(dur, events[events.length - 1].t + events[events.length - 1].dur);
    var inKey = key ? C.keyPcs(key) : null;
    var rowH = d.h / (hi - lo + 1);
    events.forEach(function (e) {
      var x = (e.t / total) * (d.w - 8) + 4;
      var w = Math.max(3, (e.dur / total) * (d.w - 8));
      var y = d.h - (e.midi - lo + 1) * rowH;
      var out = inKey && inKey.indexOf(((e.midi % 12) + 12) % 12) === -1;
      d.g.fillStyle = out ? css('--warn') : css('--accent');
      d.g.beginPath();
      if (d.g.roundRect) d.g.roundRect(x, y + 1, w, Math.max(3, rowH - 2), 2); else d.g.rect(x, y + 1, w, Math.max(3, rowH - 2));
      d.g.fill();
    });
  }

  /* ---------- recording ---------- */
  var rec = null;
  var wake = null;

  function pickMime() {
    var opts = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < opts.length; i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(opts[i])) return opts[i];
    }
    return '';
  }

  function startRec(mode) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      toast('This browser cannot reach a microphone here. Open Songpad in Chrome or Edge over https or localhost.');
      return;
    }
    stopPlayer(); Snd.stopAdhoc();
    navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      .then(function (stream) {
        var Ctx = window.AudioContext || window.webkitAudioContext;
        var ctx = new Ctx();
        return ctx.resume().then(function () {
          var src = ctx.createMediaStreamSource(stream);
          var an = ctx.createAnalyser();
          an.fftSize = 2048;
          src.connect(an);
          var mime = pickMime();
          var mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
          var chunks = [];
          mr.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
          rec = {
            mode: mode || 'take', noteId: curId, ctx: ctx, stream: stream, an: an, mr: mr, chunks: chunks,
            frames: [], buf: new Float32Array(an.fftSize), t0: ctx.currentTime, raf: 0
          };
          mr.onstop = function () { finishRec(rec); };
          mr.start(1000);
          if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {});
          setRecUi(rec.mode);
          if (rec.mode === 'take' && (prefs.click || prefs.drums) && !transport.playing) {
            startTransport('beat', { countIn: prefs.countIn, byRec: true });
          }
          tickRec();
        });
      })
      .catch(function () {
        toast('The microphone is blocked. Allow it in the browser site settings, then try again.');
      });
  }

  function tickRec() {
    if (!rec) return;
    rec.an.getFloatTimeDomainData(rec.buf);
    var t = rec.ctx.currentTime - rec.t0;
    var lvl = C.rms(rec.buf);
    var midi = null;
    if (lvl > 0.012) {
      var r = C.yin(rec.buf, rec.ctx.sampleRate);
      if (r && r.clarity > 0.8) midi = C.freqToMidi(r.freq);
    }
    rec.frames.push({ t: t, midi: midi });
    updateLive(midi, lvl, t);
    rec.raf = requestAnimationFrame(tickRec);
  }

  function updateLive(midi, lvl, t) {
    $('#timer').textContent = fmtTime(t);
    $('#levelBar').style.width = Math.min(100, lvl * 400) + '%';
    var dot = $('#centsDot');
    var label = '–';
    if (midi == null) {
      dot.style.opacity = '0.25'; dot.style.left = '50%';
    } else {
      var n = Math.round(midi);
      label = C.midiName(n, false);
      dot.style.opacity = '1';
      dot.style.left = (50 + (midi - n) * 100) + '%';
    }
    $('#liveNote').textContent = label;
    $('#liveBig').textContent = label;
    drawTrail();
  }

  function drawTrail() {
    var c = $('#trail');
    var d = fitCanvas(c);
    if (!d || !rec) return;
    var now = rec.frames.length ? rec.frames[rec.frames.length - 1].t : 0;
    var span = 8, lo = 43, hi = 79; // G2 to G5
    var g = d.g;
    g.strokeStyle = css('--line'); g.lineWidth = 1;
    for (var m = lo; m <= hi; m++) {
      if (m % 12 === 0) {
        var y0 = d.h - ((m - lo) / (hi - lo)) * d.h;
        g.beginPath(); g.moveTo(0, y0); g.lineTo(d.w, y0); g.stroke();
        g.fillStyle = css('--muted'); g.font = '10px ' + css('--mono');
        g.fillText('C' + (m / 12 - 1), 3, y0 - 2);
      }
    }
    g.fillStyle = css('--accent');
    for (var i = rec.frames.length - 1; i >= 0; i--) {
      var f = rec.frames[i];
      if (now - f.t > span) break;
      if (f.midi == null) continue;
      var x = d.w - ((now - f.t) / span) * d.w;
      var y = d.h - ((Math.min(hi, Math.max(lo, f.midi)) - lo) / (hi - lo)) * d.h;
      g.fillRect(x, y - 1.5, 3, 3);
    }
  }

  function stopRec() {
    if (!rec) return;
    cancelAnimationFrame(rec.raf);
    try { rec.mr.stop(); } catch (e) { finishRec(rec); }
  }

  function finishRec(r) {
    if (!r || r !== rec) return;
    rec = null;
    r.stream.getTracks().forEach(function (t) { t.stop(); });
    r.ctx.close().catch(function () {});
    if (wake) { wake.release().catch(function () {}); wake = null; }
    setRecUi(null);
    if (playing && playing.byRec) stopTransport();
    $('#liveNote').textContent = '–'; $('#liveBig').textContent = '–';
    $('#levelBar').style.width = '0';
    $('#centsDot').style.opacity = '0.25'; $('#centsDot').style.left = '50%';
    var dur = r.frames.length ? r.frames[r.frames.length - 1].t : 0;
    var events = C.segment(r.frames, { win: 5, minDur: 0.09 });
    if (r.mode === 'range') {
      var m = C.measureRange(events);
      if (!m) { toast('Songpad did not hear a low and a high note held for a moment. Try again, holding each note a second or two.'); return; }
      vocalRange = m; saveVocalRange();
      renderVoice(); renderFit();
      toast('Your range is ' + C.midiName(m.low, false) + ' to ' + C.midiName(m.high, false) + '.');
      return;
    }
    var blob = new Blob(r.chunks, { type: r.mr.mimeType || 'audio/webm' });
    addTake(r.noteId, blob, events, dur);
  }

  function setRecUi(mode) {
    var rb = $('#recBtn'), mb = $('#measureBtn');
    rb.setAttribute('aria-pressed', mode === 'take' ? 'true' : 'false');
    rb.setAttribute('aria-label', mode === 'take' ? 'Stop recording' : 'Start recording');
    mb.textContent = mode === 'range' ? 'Stop measuring' : 'Measure my range';
    mb.classList.toggle('rec-live', mode === 'range');
  }

  function addTake(noteId, blob, events, dur) {
    var n = notes.filter(function (x) { return x.id === noteId; })[0];
    if (!n) return;
    var take = { id: uid(), name: 'Take ' + (n.recs.length + 1), dur: Math.round(dur * 10) / 10, events: events, use: true };
    n.recs.push(take);
    putAudio(take.id, blob).catch(function () { toast('The notes were found but the audio could not be stored.'); });
    n.updated = Date.now();
    persist(); renderList();
    if (curId === noteId) { renderTakes(); renderAnalysis(); }
    if (!events.length) toast('No clear notes heard. Try singing a little closer to the microphone.');
  }

  function importFile(file) {
    if (!file) return;
    var status = $('#status');
    var noteId = curId;
    var Ctx = window.AudioContext || window.webkitAudioContext;
    status.textContent = 'Reading file...';
    file.arrayBuffer().then(function (ab) {
      var ctx = new Ctx();
      return ctx.decodeAudioData(ab).then(function (buf) { ctx.close(); return buf; });
    }).then(function (buf) {
      var ch = buf.getChannelData(0);
      var mono = ch;
      if (buf.numberOfChannels > 1) {
        var b = buf.getChannelData(1);
        mono = new Float32Array(ch.length);
        for (var i = 0; i < ch.length; i++) mono[i] = (ch[i] + b[i]) / 2;
      }
      return C.analyzeSamples(mono, buf.sampleRate, function (p) { status.textContent = 'Finding notes... ' + Math.round(p * 100) + '%'; });
    }).then(function (res) {
      status.textContent = '';
      addTake(noteId, file, res.events, res.duration);
    }).catch(function () {
      status.textContent = '';
      toast('That file could not be read. Try an MP3, M4A, WAV or WebM file.');
    });
  }

  /* ---------- chords you can hear ---------- */
  function effectiveKey(n) {
    if (n.key) return n.key;
    var events = [];
    n.recs.forEach(function (r) { if (r.use) events = events.concat(r.events); });
    var keys = C.detectKeys(C.pcProfile(events));
    return keys[0] || null;
  }
  function sameKey(a, b) { return a && b && a.tonic === b.tonic && a.mode === b.mode; }

  function chordVoicing(c, sevenths) {
    var root = 48 + c.root;
    return { midis: C.chordIntervals(c, sevenths).map(function (i) { return root + i; }), bass: root - 12, name: c.name };
  }
  function previewChord(c) {
    var n = cur();
    var v = chordVoicing(c, n && n.sevenths);
    Snd.chordNow(v.midis, v.bass, 1.8);
  }

  function insertAtCursor(text) {
    var ta = $('#lyrics');
    var s = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
    var e = ta.selectionEnd == null ? s : ta.selectionEnd;
    ta.value = ta.value.slice(0, s) + text + ta.value.slice(e);
    var pos = s + text.length;
    ta.setSelectionRange(pos, pos);
    var n = cur(); n.lyrics = ta.value; touch();
    toast('Added ' + text.trim() + ' to your lyrics');
  }

  // One click plays the chord. A second click within 0.4 seconds (a double click or double tap) adds it to the lyrics.
  function chordChip(c, label) {
    var last = 0;
    var b = el('button', {
      class: 'chord', type: 'button',
      title: 'Click to hear it. Double-click to add it to your lyrics.',
      'aria-label': c.name + '. Click to hear it, double-click to add it to your lyrics.'
    }, el('b', null, c.name), el('small', null, label != null ? label : (c.roman || '')));
    b.addEventListener('click', function () {
      var now = Date.now();
      if (now - last < 400) { last = 0; insertAtCursor('[' + c.name + ']'); return; }
      last = now;
      previewChord(c);
    });
    b.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.shiftKey) { e.preventDefault(); insertAtCursor('[' + c.name + ']'); }
    });
    return b;
  }

  /* ---------- transport: click, drums and chord progressions in time ---------- */
  var transport = new Snd.Transport();
  var playing = null; // {kind: 'beat' | 'prog', row, btn, byRec}
  var raf = 0;
  var phCells = [];

  function stateFor(n, chords) {
    var b = beatOf(n);
    return {
      bpm: function () { return clamp(n.bpm || 96, 40, 220); },
      swing: function () { return b.swing; },
      bars: function () { return b.bars; },
      grid: function () { return b.grid; },
      mute: function () { return b.mute; },
      vol: function () { return b.vol; },
      click: function () { return prefs.click; },
      drums: function () { return prefs.drums; },
      countIn: false,
      chords: chords ? { list: chords, loop: function () { return prefs.loop; } } : null
    };
  }

  function startTransport(kind, o) {
    o = o || {};
    var n = cur();
    transport.stop(true);
    var chords = o.chords ? o.chords.map(function (c) { return chordVoicing(c, n.sevenths); }) : null;
    var st = stateFor(n, chords);
    st.countIn = !!o.countIn;
    Snd.stopAdhoc();
    playing = { kind: kind, row: o.row || null, btn: o.btn || null, byRec: !!o.byRec };
    transport.start(st);
    syncPlayUi();
    if (!raf) raf = requestAnimationFrame(uiLoop);
  }
  function stopTransport() { transport.stop(); }
  transport.onstop = function () {
    playing = null;
    syncPlayUi();
    clearHighlights();
  };

  function uiLoop() {
    raf = 0;
    if (!transport.playing) return;
    var it = transport.poll();
    if (it) applyTick(it);
    raf = requestAnimationFrame(uiLoop);
  }
  function applyTick(it) {
    var n = cur();
    if (!n) return;
    var b = beatOf(n);
    if (it.step >= 0) {
      var gi = it.step % (b.bars * 16);
      var bar = Math.floor(gi / 16);
      if (bar !== curBar && document.body.dataset.tool === 'beat') { curBar = bar; renderBeat(); }
      showPlayhead(gi % 16, bar === curBar);
    } else showPlayhead(-1, false);
    if (it.chord >= 0 && playing && playing.row) {
      var chips = playing.row.querySelectorAll('.chord');
      for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('now', i === it.chord);
    }
  }
  function showPlayhead(i, visible) {
    phCells.forEach(function (c) { c.classList.remove('ph'); });
    phCells = [];
    if (i < 0 || !visible) return;
    phCells = $$('#grid .g-cell[data-i="' + i + '"]');
    phCells.forEach(function (c) { c.classList.add('ph'); });
  }
  function clearHighlights() {
    showPlayhead(-1, false);
    $$('.chord.now').forEach(function (c) { c.classList.remove('now'); });
  }
  function syncPlayUi() {
    var pb = $('#playBtn');
    var beatOn = !!(playing && playing.kind === 'beat');
    pb.setAttribute('aria-pressed', beatOn ? 'true' : 'false');
    pb.setAttribute('aria-label', beatOn ? 'Stop beat' : 'Play beat');
    pb.replaceChildren(icon(beatOn ? 'stop' : 'play'));
    $$('.prog-play').forEach(function (b) {
      var on = !!(playing && playing.btn === b);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.setAttribute('aria-label', (on ? 'Stop ' : 'Play ') + (b.dataset.name || 'progression'));
      b.replaceChildren(icon(on ? 'stop' : 'play'));
    });
  }

  function syncPills() {
    $('#tClick').setAttribute('aria-pressed', prefs.click ? 'true' : 'false');
    $('#tDrums').setAttribute('aria-pressed', prefs.drums ? 'true' : 'false');
    $('#tCount').setAttribute('aria-pressed', prefs.countIn ? 'true' : 'false');
    $('#useTempo').setAttribute('aria-pressed', prefs.presetTempo ? 'true' : 'false');
  }
  function togglePref(k) { prefs[k] = !prefs[k]; savePrefs(); syncPills(); }

  function setBpm(v, quiet) {
    var n = cur();
    v = clamp(Math.round(num(v, n.bpm || 96)), 40, 220);
    n.bpm = v;
    $('#bpm').value = v;
    if (!quiet) touch();
  }
  var taps = [];
  function tapTempo() {
    var now = Date.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length >= 2) {
      var span = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setBpm(60000 / span);
    }
  }

  /* ---------- analysis ---------- */
  function analyze(n) {
    var used = n.recs.filter(function (r) { return r.use && r.events.length; });
    if (!used.length) return null;
    var events = [];
    used.forEach(function (r) { events = events.concat(r.events); });
    var profile = C.pcProfile(events);
    var keys = C.detectKeys(profile);
    var key = n.key || keys[0];
    return { used: used, events: events, profile: profile, keys: keys, key: key, ranked: C.rankProgressions(key, profile, n.sevenths) };
  }

  function renderAnalysis() {
    var n = cur();
    if (!n) return;
    if (playing && playing.kind === 'prog') stopTransport();
    var box = $('#analysis');
    box.replaceChildren();
    var A = analyze(n);
    if (!A) {
      box.append(el('p', { class: 'empty' }, n.recs.length
        ? 'Tick "Use" on a take that has notes.'
        : 'Record a take or analyze an audio file. The notes you sang, likely keys and chord ideas show up here.'));
      renderFit();
      return;
    }
    var key = A.key;
    var flats = C.useFlats(key.tonic, key.mode);
    var inKey = C.keyPcs(key);

    // notes heard
    var max = Math.max.apply(null, A.profile) || 1;
    var pcs = el('div', { class: 'pcs' });
    for (var pc = 0; pc < 12; pc++) {
      var cls = 'pc ' + (A.profile[pc] > 0 ? (inKey.indexOf(pc) !== -1 ? 'in' : 'out') : 'none') + (pc === key.tonic ? ' root' : '');
      pcs.append(el('div', { class: cls },
        el('div', { class: 'col' }, el('i', { style: 'height:' + Math.round((A.profile[pc] / max) * 100) + '%' })),
        el('span', null, C.noteName(pc, flats))));
    }
    // keys
    var top = A.keys.slice(0, 3);
    if (!top.some(function (k) { return sameKey(k, key); })) {
      top.push({ tonic: key.tonic, mode: key.mode, score: A.keys.filter(function (k) { return sameKey(k, key); })[0].score });
    }
    var chips = el('div', { class: 'chips' });
    top.forEach(function (k) {
      chips.append(el('button', {
        class: 'keychip', type: 'button', 'aria-pressed': sameKey(k, key) ? 'true' : 'false',
        onclick: function () { n.key = { tonic: k.tonic, mode: k.mode }; touch(); renderTakes(); renderAnalysis(); }
      }, el('b', null, C.keyLabel(k)), el('small', null, Math.max(0, Math.round(k.score * 100)) + '% match')));
    });
    var other = el('select', {
      'aria-label': 'Choose another key', onchange: function (e) {
        if (!e.target.value) return;
        var p = e.target.value.split(':');
        n.key = { tonic: +p[0], mode: p[1] }; touch(); renderTakes(); renderAnalysis();
      }
    }, el('option', { value: '' }, 'Another key...'));
    ['major', 'minor'].forEach(function (mode) {
      for (var t = 0; t < 12; t++) other.append(el('option', { value: t + ':' + mode }, C.keyLabel({ tonic: t, mode: mode })));
    });
    box.append(el('div', { class: 'chords-top' },
      el('div', { class: 'block' }, el('h3', null, 'Notes you sang'), pcs,
        el('p', { class: 'hint' }, 'Teal notes are in ' + C.keyLabel(key) + '. Orange are outside it.')),
      el('div', { class: 'block' }, el('h3', null, 'Likely keys'), chips,
        el('div', { class: 'row' }, other, n.key ? el('button', {
          class: 'btn ghost small', type: 'button', onclick: function () { n.key = null; touch(); renderTakes(); renderAnalysis(); }
        }, 'Best match') : null),
        el('p', { class: 'hint' }, 'Scale: ' + inKey.map(function (p) { return C.noteName(p, flats); }).join(' ')))
    ));

    // options
    var sev = el('button', {
      class: 'pill', type: 'button', 'aria-pressed': n.sevenths ? 'true' : 'false',
      onclick: function () { n.sevenths = !n.sevenths; touch(); renderAnalysis(); }
    }, '7th chords');
    var loop = el('button', {
      class: 'pill', type: 'button', 'aria-pressed': prefs.loop ? 'true' : 'false',
      onclick: function (e) { togglePref('loop'); e.currentTarget.setAttribute('aria-pressed', prefs.loop ? 'true' : 'false'); }
    }, 'Loop');
    box.append(el('div', { class: 'row' }, sev, loop,
      el('span', { class: 'hint' }, 'Click a chord to hear it. Double-click to add it to your lyrics.')));

    // phrases
    var phraseBlock = el('div', { class: 'block' }, el('h3', null, 'Chord for each phrase you sang'));
    A.used.forEach(function (r) {
      var ph = C.phrases(r.events, key, n.sevenths);
      if (!ph.length) return;
      var row = el('div', { class: 'phrases' });
      ph.slice(0, 24).forEach(function (p) {
        row.append(el('div', { class: 'phrase' },
          el('span', { class: 'when' }, fmtTime(p.t)),
          chordChip(p.best),
          p.alt ? el('span', { class: 'alt' }, 'or ' + p.alt.name) : null));
      });
      phraseBlock.append(el('p', { class: 'take-meta' }, r.name), row);
    });
    box.append(phraseBlock);

    // progressions
    var grid = el('div', { class: 'prog-grid' });
    A.ranked.slice(0, 6).forEach(function (p) { grid.append(progCard(p, n)); });
    box.append(el('div', { class: 'block' },
      el('h3', null, 'Chord progressions in ' + C.keyLabel(key)),
      el('p', { class: 'hint' }, 'Sorted by how much of your melody lands on the chord notes. The round button plays the whole progression.'),
      grid));
    syncPlayUi();
    renderFit();
  }

  function progCard(p, n) {
    var row = el('div', { class: 'chips-row' });
    p.chords.forEach(function (c) { row.append(chordChip(c)); });
    var btn = el('button', { class: 'prog-play', type: 'button', 'aria-pressed': 'false', 'data-name': p.name, 'aria-label': 'Play ' + p.name });
    btn.append(icon('play'));
    btn.addEventListener('click', function () {
      if (playing && playing.btn === btn) { stopTransport(); return; }
      startTransport('prog', { chords: p.chords, row: row, btn: btn });
    });
    var line = '| ' + p.chords.map(function (c) { return c.name; }).join(' | ') + ' |';
    return el('div', { class: 'prog' },
      el('div', { class: 'prog-head' }, btn,
        el('div', { class: 'prog-title' }, el('b', null, p.name), el('small', null, p.mood)),
        el('span', { class: 'fit' }, Math.round(p.fit * 100) + '%')),
      row,
      el('div', { class: 'prog-actions' },
        el('button', { class: 'btn small', type: 'button', onclick: function () { insertAtCursor('\n' + line + '\n'); } }, 'Add to lyrics')),
      guitarBlock(p.chords, n.sevenths));
  }

  /* ---------- your voice ---------- */
  function fillNoteSelect(sel, selected) {
    sel.replaceChildren(el('option', { value: '' }, 'Not set'));
    for (var m = 36; m <= 88; m++) {
      var o = el('option', { value: String(m) }, C.midiName(m, false));
      if (m === selected) o.selected = true;
      sel.append(o);
    }
  }
  function spanText(semi) {
    var oct = Math.floor(semi / 12), rem = semi % 12;
    var parts = [];
    if (oct) parts.push(plural(oct, 'octave'));
    if (rem) parts.push(plural(rem, 'semitone'));
    return parts.join(' and ') || 'no span';
  }
  function renderVoice() {
    var box = $('#voiceSummary');
    box.replaceChildren();
    if (vocalRange) {
      box.append(el('div', { class: 'voice-line' },
        el('b', null, C.midiName(vocalRange.low, false) + ' to ' + C.midiName(vocalRange.high, false)),
        el('span', { class: 'muted' }, spanText(vocalRange.high - vocalRange.low))));
    } else {
      box.append(el('p', { class: 'empty' }, 'Range not set yet.'));
    }
    fillNoteSelect($('#vLow'), vocalRange ? vocalRange.low : null);
    fillNoteSelect($('#vHigh'), vocalRange ? vocalRange.high : null);
  }
  function onVoiceSelect() {
    var lo = parseInt($('#vLow').value, 10), hi = parseInt($('#vHigh').value, 10);
    if (isNaN(lo) || isNaN(hi)) return;
    if (lo >= hi) { toast('The lowest note has to be below the highest note.'); renderVoice(); return; }
    vocalRange = { low: lo, high: hi };
    saveVocalRange(); renderVoice(); renderFit();
  }

  function renderFit() {
    var n = cur();
    var b = $('#fitBox');
    if (!n || !b) return;
    b.replaceChildren(el('h3', null, 'Fit to your voice'));
    var A = analyze(n);
    if (!A) {
      b.append(el('p', { class: 'hint' }, 'Record a take first. Then Songpad finds the keys that fit the melody you sang to your range.'));
      return;
    }
    if (!vocalRange) {
      b.append(el('p', { class: 'hint' }, 'Set your range above and Songpad will tell you which key suits the melody you sang.'));
      return;
    }
    var key = A.key;
    var f = C.fitToRange(A.events, vocalRange, key);
    if (!f) return;
    var lowN = C.midiName(f.melodyLow, false), highN = C.midiName(f.melodyHigh, false);
    b.append(el('p', { class: 'hint' }, 'Your melody runs ' + lowN + ' to ' + highN + ' (' + spanText(f.span) + '). Your range is ' +
      C.midiName(vocalRange.low, false) + ' to ' + C.midiName(vocalRange.high, false) + '.'));
    var verdict;
    if (f.fitsAsSung) verdict = el('p', { class: 'verdict' }, 'It sits inside your range in ' + C.keyLabel(key) + ', as you sang it.');
    else if (f.anyFit) verdict = el('p', { class: 'verdict warn' }, 'Part of this melody is outside your range in ' + C.keyLabel(key) + '. These keys fit your voice:');
    else verdict = el('p', { class: 'verdict warn' }, 'This melody spans ' + spanText(f.span) + ' and your range spans ' + spanText(f.rangeSpan) +
      ', so no key fits every note. The closest is below. For the notes that still stick out, try an octave lower or higher, or a lighter head voice.');
    b.append(verdict);

    var steps = A.ranked[0].steps;
    f.results.forEach(function (r) {
      if (r.shift === 0 && f.fitsAsSung && f.results.length === 1) return;
      var k = { tonic: r.tonic, mode: r.mode };
      var byRoman = {};
      C.chordsFor(k, n.sevenths).forEach(function (c) { byRoman[c.roman] = c; });
      var how = r.shift === 0 ? 'as sung' : (r.shift > 0 ? 'up ' : 'down ') + plural(Math.abs(r.shift), 'semitone');
      var note = r.fits ? (r.margin === 0 ? 'right at the edge of your range' : plural(r.margin, 'semitone') + ' to spare') : plural(r.over, 'semitone') + ' outside your range';
      var chordRow = el('div', { class: 'chips-row' });
      steps.forEach(function (st) { if (byRoman[st]) chordRow.append(chordChip(byRoman[st])); });
      b.append(el('div', { class: 'fitkey' },
        el('div', { class: 'fitkey-head' }, el('b', null, C.keyLabel(k)), el('span', { class: 'shift' }, how + ' · ' + note)),
        el('p', { class: 'hint' }, A.ranked[0].name + ' in this key:'),
        chordRow,
        el('div', { class: 'prog-actions' }, el('button', {
          class: 'btn small', type: 'button', onclick: function () { insertAtCursor('Key: ' + C.keyLabel(k) + '\n'); }
        }, 'Note this key in lyrics'))));
    });
  }

  /* ---------- guitar ---------- */
  var STRINGS = [40, 45, 50, 55, 59, 64];
  function diagram(shape, capo, chord) {
    var fg = shape.fingering;
    var btn = el('button', {
      class: 'dg', type: 'button', title: 'Click to hear this shape',
      'aria-label': shape.name + ' shape. Click to hear it.'
    }, el('span', { class: 'dg-name' }, shape.name),
    el('span', { class: 'dg-sounds' }, shape.name === shape.sounds ? '' : 'sounds ' + shape.sounds));
    btn.addEventListener('click', function () {
      if (!fg) { previewChord(chord); return; }
      var midis = [];
      fg.frets.forEach(function (f, i) { if (f >= 0) midis.push(STRINGS[i] + f + capo); });
      Snd.strumNow(midis);
    });
    if (!fg) { btn.append(el('div', { class: 'dg-none' }, 'no diagram')); return btn; }
    var played = fg.frets.filter(function (f) { return f > 0; });
    var minF = played.length ? Math.min.apply(null, played) : 1;
    var maxF = played.length ? Math.max.apply(null, played) : 1;
    var base = maxF <= 4 ? 1 : minF;
    var X0 = 10, DX = 8, Y0 = 18, DY = 12, rows = 4;
    var svg = sv('svg', { viewBox: '0 0 60 78', role: 'img', 'aria-hidden': 'true' });
    for (var s = 0; s < 6; s++) svg.append(sv('line', { class: 'ln', x1: X0 + s * DX, x2: X0 + s * DX, y1: Y0, y2: Y0 + rows * DY }));
    for (var r = 0; r <= rows; r++) svg.append(sv('line', { class: r === 0 && base === 1 ? 'nut' : 'ln', x1: X0, x2: X0 + 5 * DX, y1: Y0 + r * DY, y2: Y0 + r * DY }));
    if (base > 1) svg.append(sv('text', { class: 'fr', x: X0 + 5 * DX + 5, y: Y0 + DY * 0.75 }, base + 'fr'));
    if (fg.barre) {
      var idx = [];
      fg.frets.forEach(function (f, i) { if (f === minF) idx.push(i); });
      var by = Y0 + (minF - base) * DY + DY / 2;
      svg.append(sv('rect', { class: 'bar', x: X0 + idx[0] * DX - 3.5, y: by - 3.5, width: (idx[idx.length - 1] - idx[0]) * DX + 7, height: 7, rx: 3.5 }));
    }
    fg.frets.forEach(function (f, i) {
      var x = X0 + i * DX;
      if (f < 0) svg.append(sv('path', { class: 'mk', d: 'M' + (x - 2.5) + ' 6 L' + (x + 2.5) + ' 11 M' + (x + 2.5) + ' 6 L' + (x - 2.5) + ' 11' }));
      else if (f === 0) svg.append(sv('circle', { class: 'mk', cx: x, cy: 8.5, r: 2.8 }));
      else svg.append(sv('circle', { class: 'dot', cx: x, cy: Y0 + (f - base) * DY + DY / 2, r: 3.6 }));
    });
    btn.append(svg);
    return btn;
  }

  function guitarBlock(chords, sevenths) {
    var opts = C.capoOptions(chords, sevenths);
    var best = opts[0];
    var none = opts.filter(function (o) { return o.capo === 0; })[0];
    var body = el('div', { class: 'guitar-body' });
    var summary = el('p', { class: 'hint' });
    var shapes = el('div', { class: 'diagrams' });
    var sel = el('select', { 'aria-label': 'Capo position' });
    for (var c = 0; c <= 7; c++) {
      var o = el('option', { value: String(c) }, c === 0 ? 'No capo' : 'Capo on fret ' + c);
      if (c === best.capo) o.selected = true;
      sel.append(o);
    }
    function show(capo) {
      var opt = opts.filter(function (x) { return x.capo === capo; })[0];
      shapes.replaceChildren.apply(shapes, opt.shapes.map(function (s, i) { return diagram(s, capo, chords[i]); }));
      var easy = opt.hard === 0 ? 'All open shapes, no barre chords.' : opt.hard + (opt.hard === 1 ? ' chord needs' : ' chords need') + ' a barre or has no diagram here.';
      var isBest = capo === best.capo && capo !== 0;
      summary.textContent = (isBest ? 'Easiest: ' : '') + easy + (isBest ? ' Without a capo: ' + (none.hard === 0 ? 'also all open.' : none.hard + ' hard.') : '') + ' Click a shape to hear it.';
    }
    sel.addEventListener('change', function () { show(parseInt(sel.value, 10)); });
    body.append(el('div', { class: 'row' }, el('label', { class: 'check' }, 'Capo', sel)), summary, shapes);
    var det = el('details', { class: 'guitar' }, el('summary', null,
      best.capo === 0 ? 'Guitar shapes (no capo needed)' : 'Guitar shapes (easiest with capo on fret ' + best.capo + ')'), body);
    var filled = false;
    det.addEventListener('toggle', function () { if (det.open && !filled) { filled = true; show(best.capo); } });
    return det;
  }

  /* ---------- beat tab: step sequencer and presets ---------- */
  var presetGenre = 'All';
  var presetMood = '';

  function renderBeat() {
    var n = cur();
    if (!n) return;
    var b = beatOf(n);
    if (curBar >= b.bars) curBar = 0;
    $$('#barsSeg button').forEach(function (x) { x.setAttribute('aria-pressed', String(parseInt(x.dataset.bars, 10) === b.bars)); });
    $('#swing').value = Math.round(b.swing * 100);
    $('#vol').value = Math.round(b.vol * 100);
    var bt = $('#barTabs');
    bt.replaceChildren();
    for (var i = 0; i < b.bars; i++) {
      (function (bi) {
        bt.append(el('button', {
          type: 'button', 'aria-pressed': String(bi === curBar),
          onclick: function () { curBar = bi; renderBeat(); }
        }, 'Bar ' + (bi + 1)));
      })(i);
    }
    renderGrid();
    renderPresets();
  }

  function cellState(v) { return v === 1 ? 'on' : v === 2 ? 'soft' : ''; }
  function renderGrid() {
    var n = cur(), b = beatOf(n), g = $('#grid');
    g.replaceChildren();
    var head = el('div', { class: 'g-head' }, el('span'), el('span'));
    for (var k = 1; k <= 4; k++) head.append(el('span', { class: 'beatnum' }, String(k)));
    g.append(head);
    Beats.LANES.forEach(function (l) {
      var row = el('div', { class: 'g-row' + (b.mute[l.id] ? ' muted-row' : '') });
      row.append(el('button', { class: 'g-label', type: 'button', title: 'Hear ' + l.name, onclick: function () { Snd.drumNow(l.id, b.vol); } }, l.name));
      row.append(el('button', {
        class: 'g-mute', type: 'button', 'aria-pressed': b.mute[l.id] ? 'true' : 'false', title: 'Mute ' + l.name, 'aria-label': 'Mute ' + l.name,
        onclick: function (e) {
          b.mute[l.id] = !b.mute[l.id];
          e.currentTarget.setAttribute('aria-pressed', b.mute[l.id] ? 'true' : 'false');
          row.classList.toggle('muted-row', !!b.mute[l.id]);
          touch();
        }
      }, 'M'));
      for (var i = 0; i < 16; i++) {
        var v = b.grid[l.id][curBar * 16 + i];
        row.append(el('button', {
          class: 'g-cell ' + cellState(v) + ((i >= 4 && i < 8) || i >= 12 ? ' alt' : ''), type: 'button',
          'data-lane': l.id, 'data-i': String(i), 'aria-label': l.name + ' step ' + (i + 1)
        }));
      }
      g.append(row);
    });
    phCells = [];
  }

  var paint = null;
  function setCell(cell, v) {
    var n = cur(), b = beatOf(n);
    var lane = cell.dataset.lane, i = parseInt(cell.dataset.i, 10);
    b.grid[lane][curBar * 16 + i] = v;
    cell.classList.remove('on', 'soft');
    if (v === 1) cell.classList.add('on');
    if (v === 2) cell.classList.add('soft');
    if (b.preset) { b.preset = null; syncPresetPress(); }
    if (v && !transport.playing) Snd.drumNow(lane, (v === 2 ? 0.45 : 1) * b.vol);
    touch();
  }
  function cellAt(x, y) {
    var t = document.elementFromPoint(x, y);
    return t && t.closest ? t.closest('.g-cell') : null;
  }
  function wireGrid() {
    var g = $('#grid');
    g.addEventListener('pointerdown', function (e) {
      var cell = e.target.closest('.g-cell');
      if (!cell) return;
      e.preventDefault();
      var b = beatOf(cur());
      var v = ((b.grid[cell.dataset.lane][curBar * 16 + parseInt(cell.dataset.i, 10)] || 0) + 1) % 3;
      paint = { lane: cell.dataset.lane, v: v, last: cell };
      try { g.setPointerCapture(e.pointerId); } catch (err) { /* not needed everywhere */ }
      setCell(cell, v);
    });
    g.addEventListener('pointermove', function (e) {
      if (!paint) return;
      var cell = cellAt(e.clientX, e.clientY);
      if (!cell || cell === paint.last || cell.dataset.lane !== paint.lane) return;
      paint.last = cell;
      setCell(cell, paint.v);
    });
    function end() { paint = null; }
    g.addEventListener('pointerup', end);
    g.addEventListener('pointercancel', end);
  }

  function syncPresetPress() {
    var b = beatOf(cur());
    $$('#presetList .preset').forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.id === b.preset)); });
  }

  function renderPresets() {
    var n = cur(), b = beatOf(n);
    var chipBox = $('#genreChips');
    chipBox.replaceChildren();
    ['All'].concat(Beats.GENRES).forEach(function (gname) {
      chipBox.append(el('button', {
        class: 'chip', type: 'button', 'aria-pressed': String(gname === presetGenre),
        onclick: function () { presetGenre = gname; renderPresets(); }
      }, gname));
    });
    var ms = $('#moodSel');
    if (!ms.options.length) {
      ms.append(el('option', { value: '' }, 'Any'));
      Beats.MOODS.forEach(function (m) { ms.append(el('option', { value: m }, m)); });
    }
    ms.value = presetMood;
    var list = $('#presetList');
    list.replaceChildren();
    var shown = Beats.PRESETS.filter(function (p) {
      return (presetGenre === 'All' || p.genre === presetGenre) && (!presetMood || p.mood === presetMood);
    });
    if (!shown.length) list.append(el('p', { class: 'empty' }, 'No presets match. Try another mood.'));
    shown.forEach(function (p) {
      list.append(el('button', {
        class: 'preset', type: 'button', 'data-id': p.id, 'aria-pressed': String(b.preset === p.id),
        onclick: function () { applyPreset(p); }
      }, el('b', null, p.name), el('small', null, p.bpm + ' BPM · ' + p.mood + (presetGenre === 'All' ? ' · ' + p.genre : ''))));
    });
  }

  function applyPreset(p) {
    var n = cur(), b = beatOf(n);
    b.preset = p.id;
    b.swing = p.swing;
    b.grid = Beats.buildGrid(p, b.bars);
    b.mute = {};
    curBar = 0;
    if (prefs.presetTempo) setBpm(p.bpm, true);
    if (!prefs.drums) { prefs.drums = true; savePrefs(); syncPills(); }
    touch();
    renderBeat();
    if (!transport.playing) startTransport('beat', {});
  }

  function setBars(nb) {
    var n = cur(), b = beatOf(n);
    if (nb === b.bars) return;
    var pr = b.preset && Beats.byId(b.preset);
    b.grid = pr ? Beats.buildGrid(pr, nb) : Beats.resizeGrid(b.grid, b.bars, nb);
    b.bars = nb;
    if (curBar >= nb) curBar = 0;
    touch(); renderBeat();
  }
  function clearBeat() {
    var b = beatOf(cur());
    b.grid = Beats.emptyGrid(b.bars);
    b.preset = null;
    touch(); renderBeat();
  }
  function repeatBar() {
    var b = beatOf(cur());
    Beats.LANES.forEach(function (l) {
      if (l.id === 'crash') return;
      for (var bar = 1; bar < b.bars; bar++) for (var i = 0; i < 16; i++) b.grid[l.id][bar * 16 + i] = b.grid[l.id][i];
    });
    b.preset = null;
    touch(); renderBeat();
    toast('Bar 1 copied to the other bars.');
  }

  /* ---------- backup, restore, export ---------- */
  function exportAll() {
    if (!notes.length) { toast('Nothing to back up yet.'); return; }
    toast('Preparing your backup...');
    var audio = {};
    var jobs = [];
    notes.forEach(function (n) {
      n.recs.forEach(function (r) {
        jobs.push(getAudio(r.id).then(function (b) { return b ? blobToDataUrl(b) : null; })
          .then(function (u) { if (u) audio[r.id] = u; }).catch(function () {}));
      });
    });
    Promise.all(jobs).then(function () {
      var payload = { app: 'songpad', version: 2, exported: new Date().toISOString(), notes: notes, voice: vocalRange, audio: audio };
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      return saveFile(blob, 'songpad-backup-' + stamp() + '.json');
    }).then(function () {
      toast('Backup ready. Keep the file somewhere safe.');
    }).catch(function () { toast('The backup could not be saved.'); });
  }

  function cleanNote(x) {
    if (!x || typeof x.id !== 'string') return null;
    var recs = (Array.isArray(x.recs) ? x.recs : []).map(function (r) {
      if (!r || typeof r.id !== 'string') return null;
      var ev = (Array.isArray(r.events) ? r.events : []).filter(function (e) {
        return e && typeof e.midi === 'number' && typeof e.t === 'number' && typeof e.dur === 'number';
      }).map(function (e) { return { midi: e.midi, t: e.t, dur: e.dur }; });
      return { id: r.id, name: String(r.name || 'Take'), dur: num(r.dur, 0), events: ev, use: r.use !== false };
    }).filter(Boolean);
    var k = x.key && typeof x.key.tonic === 'number' && x.key.tonic >= 0 && x.key.tonic < 12 && (x.key.mode === 'major' || x.key.mode === 'minor')
      ? { tonic: x.key.tonic, mode: x.key.mode } : null;
    return {
      id: x.id, title: String(x.title || ''), lyrics: String(x.lyrics || ''), updated: num(x.updated, Date.now()),
      recs: recs, key: k, sevenths: !!x.sevenths, bpm: clamp(num(x.bpm, 96), 40, 220), beat: sanitizeBeat(x.beat) || defaultBeat()
    };
  }

  function importAll(file) {
    if (!file) return;
    if (rec) { toast('Stop recording before restoring.'); return; }
    file.text().then(function (text) {
      var data = JSON.parse(text);
      if (!data || data.app !== 'songpad' || !Array.isArray(data.notes)) throw new Error('not a backup');
      var audio = data.audio && typeof data.audio === 'object' ? data.audio : {};
      var added = 0, updated = 0, kept = 0;
      var writes = [];
      data.notes.forEach(function (raw) {
        var inc = cleanNote(raw);
        if (!inc) return;
        var have = notes.filter(function (n) { return n.id === inc.id; })[0];
        if (have && have.updated >= inc.updated) { kept++; return; }
        if (have) { notes[notes.indexOf(have)] = inc; updated++; } else { notes.push(inc); added++; }
        inc.recs.forEach(function (r) {
          if (typeof audio[r.id] === 'string') {
            try { writes.push(putAudio(r.id, dataUrlToBlob(audio[r.id])).catch(function () {})); } catch (e) { /* skip bad audio */ }
          }
        });
      });
      if (!vocalRange && data.voice && typeof data.voice.low === 'number' && typeof data.voice.high === 'number' && data.voice.low < data.voice.high) {
        vocalRange = { low: data.voice.low, high: data.voice.high }; saveVocalRange();
      }
      return Promise.all(writes).then(function () {
        persist();
        renderVoice();
        var open = cur() ? curId : (notes[0] && notes[0].id);
        if (open) openNote(open); else renderList();
        toast('Restored: ' + added + ' new, ' + updated + ' updated' + (kept ? ', ' + kept + ' left alone because yours were newer.' : '.'));
      });
    }).catch(function () { toast('That file is not a Songpad backup.'); });
  }

  function exportText() {
    var n = cur();
    var key = effectiveKey(n);
    var out = (n.title || 'Untitled') + '\n' + (key ? 'Key: ' + C.keyLabel(key) + '\n' : '') + '\n' + n.lyrics + '\n';
    saveFile(new Blob([out], { type: 'text/plain' }), safeName(n.title) + '.txt')
      .then(function () { toast('Lyrics exported.'); })
      .catch(function () { toast('The text could not be saved.'); });
    $('#moreMenu').open = false;
  }

  /* ---------- wiring ---------- */
  $('#newNote').addEventListener('click', function () {
    if (rec) { toast('Stop recording first.'); return; }
    var n = newNote(); openNote(n.id); $('#title').focus();
  });
  $('#search').addEventListener('input', renderList);
  $('#backupBtn').addEventListener('click', exportAll);
  $('#restoreFile').addEventListener('change', function (e) { importAll(e.target.files[0]); e.target.value = ''; });
  $('#exportTxt').addEventListener('click', exportText);
  $('#back').addEventListener('click', function () { document.body.dataset.view = 'list'; });
  $('#title').addEventListener('input', function (e) { var n = cur(); n.title = e.target.value; touch(); });
  $('#lyrics').addEventListener('input', function (e) { var n = cur(); n.lyrics = e.target.value; touch(); });
  $('#importFile').addEventListener('change', function (e) { importFile(e.target.files[0]); e.target.value = ''; });
  $('#vLow').addEventListener('change', onVoiceSelect);
  $('#vHigh').addEventListener('change', onVoiceSelect);

  $('#recBtn').addEventListener('click', function () { if (rec) stopRec(); else startRec('take'); });
  $('#measureBtn').addEventListener('click', function () { if (rec) stopRec(); else startRec('range'); });

  $('#playBtn').addEventListener('click', function () {
    if (playing && playing.kind === 'beat') { stopTransport(); return; }
    if (!prefs.click && !prefs.drums) { prefs.click = true; savePrefs(); syncPills(); toast('Click turned on so you can hear the beat.'); }
    startTransport('beat', { countIn: false });
  });
  $('#bpm').addEventListener('change', function (e) { setBpm(e.target.value); });
  $('#bpmDown').addEventListener('click', function (e) { setBpm((cur().bpm || 96) - (e.shiftKey ? 5 : 1)); });
  $('#bpmUp').addEventListener('click', function (e) { setBpm((cur().bpm || 96) + (e.shiftKey ? 5 : 1)); });
  $('#tapBtn').addEventListener('click', tapTempo);
  $('#tClick').addEventListener('click', function () { togglePref('click'); });
  $('#tDrums').addEventListener('click', function () { togglePref('drums'); });
  $('#tCount').addEventListener('click', function () { togglePref('countIn'); });
  $('#useTempo').addEventListener('click', function () { togglePref('presetTempo'); });

  $$('#barsSeg button').forEach(function (b) { b.addEventListener('click', function () { setBars(parseInt(b.dataset.bars, 10)); }); });
  $('#swing').addEventListener('input', function (e) { var b = beatOf(cur()); b.swing = clamp(parseInt(e.target.value, 10) / 100, 0, 0.5); touch(); });
  $('#vol').addEventListener('input', function (e) { var b = beatOf(cur()); b.vol = clamp(parseInt(e.target.value, 10) / 100, 0.1, 1); touch(); });
  $('#clearBeat').addEventListener('click', clearBeat);
  $('#repeatBar').addEventListener('click', repeatBar);
  $('#moodSel').addEventListener('change', function (e) { presetMood = e.target.value; renderPresets(); });
  wireGrid();
  $$('[data-go]').forEach(function (b) { b.addEventListener('click', function () { setTab(b.dataset.go); }); });

  var delBtn = $('#delNote');
  var delArmed = false, delT;
  delBtn.addEventListener('click', function () {
    if (rec) { toast('Stop recording first.'); return; }
    if (!delArmed) {
      delArmed = true; delBtn.dataset.armed = 'true'; delBtn.textContent = 'Tap again to delete';
      delT = setTimeout(function () { delArmed = false; delete delBtn.dataset.armed; delBtn.textContent = 'Delete note'; }, 3000);
      return;
    }
    clearTimeout(delT); delArmed = false; delete delBtn.dataset.armed; delBtn.textContent = 'Delete note';
    $('#moreMenu').open = false;
    var n = cur();
    stopPlayer(); stopTransport();
    n.recs.forEach(function (r) { delAudio(r.id); });
    notes = notes.filter(function (x) { return x !== n; });
    persist();
    var next = notes.slice().sort(function (a, b) { return b.updated - a.updated; })[0] || newNote();
    openNote(next.id);
    document.body.dataset.view = window.matchMedia('(max-width: 760px)').matches ? 'list' : 'editor';
  });

  var rz;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { if (cur()) renderTakes(); }, 150);
  });
  window.addEventListener('beforeunload', function () { persist(); });

  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
  }

  // first run
  syncPills();
  syncPlayUi();
  renderVoice();
  if (!notes.length) newNote();
  var latest = notes.slice().sort(function (a, b) { return b.updated - a.updated; })[0];
  openNote(latest.id);
  setTab(prefs.tool === 'beat' || prefs.tool === 'chords' || prefs.tool === 'voice' ? prefs.tool : 'record');
  if (window.matchMedia('(max-width: 1000px)').matches) setTab('lyrics');
  if (notes.length > 1 && window.matchMedia('(max-width: 760px)').matches) document.body.dataset.view = 'list';
})();
