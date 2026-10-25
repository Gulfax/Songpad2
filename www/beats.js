/* Songpad drum patterns. 16 steps per bar (sixteenth notes), 4/4 time.
   In a pattern string: x = hit, o = soft hit, . = rest. "|" is only for reading. */
(function (root) {
  'use strict';

  var LANES = [
    { id: 'kick', name: 'Kick' },
    { id: 'snare', name: 'Snare' },
    { id: 'hat', name: 'Hi-hat' },
    { id: 'clap', name: 'Clap' },
    { id: 'crash', name: 'Crash' }
  ];
  var GENRES = ['Basics', 'Pop & Rock', 'Funk & Soul', 'Hip-Hop & R&B', 'Electronic', 'Latin & Reggae', 'Jazz & Blues'];
  var MOODS = ['Chill', 'Upbeat', 'Groovy', 'Dark', 'Intense', 'Tender', 'Nostalgic'];

  var H8 = 'x.x.|x.x.|x.x.|x.x.';
  var H8S = 'o.o.|o.o.|o.o.|o.o.';
  var OFF = '..x.|..x.|..x.|..x.';
  var F4 = 'x...|x...|x...|x...';
  var SN24 = '....|x...|....|x...';
  var SN3 = '....|....|x...|....';
  var NONE = '....|....|....|....';

  function bar(kick, snare, hat, clap) {
    return { kick: kick, snare: snare, hat: hat, clap: clap || NONE };
  }
  // p(id, name, genre, mood, bpm, swing, a, b, crashOnOne)
  // a is the main bar. b is the last bar of the loop, usually a small fill.
  function p(id, name, genre, mood, bpm, swing, a, b, crash) {
    return { id: id, name: name, genre: genre, mood: mood, bpm: bpm, swing: swing, a: a, b: b || a, crash: crash !== false };
  }

  var PRESETS = [
    // ---- Basics
    p('basic8', 'Basic 8th beat', 'Basics', 'Upbeat', 100, 0,
      bar('x...|....|x...|....', SN24, H8),
      bar('x...|....|x...|....', '....|x...|....|xxxx', 'x.x.|x.x.|x.x.|....')),
    p('basic16', 'Basic 16th beat', 'Basics', 'Groovy', 95, 0,
      bar('x...|....|x...|..x.', SN24, 'xoxo|xoxo|xoxo|xoxo'),
      bar('x...|....|x...|..x.', '....|x...|....|x.xx', 'xoxo|xoxo|xoxo|xoxo')),
    p('halftime', 'Half-time beat', 'Basics', 'Chill', 80, 0,
      bar('x...|....|....|..x.', SN3, H8),
      bar('x...|....|....|..x.', '....|....|x...|..xx', H8)),
    p('four', 'Four on the floor', 'Basics', 'Upbeat', 120, 0,
      bar(F4, SN24, OFF),
      bar(F4, '....|x...|....|xxxx', '..x.|..x.|..x.|....')),

    // ---- Pop & Rock
    p('poprock', 'Pop rock', 'Pop & Rock', 'Upbeat', 104, 0,
      bar('x...|....|x.x.|....', SN24, H8),
      bar('x...|....|x.x.|....', '....|x...|....|xoxx', H8)),
    p('classic', 'Classic rock', 'Pop & Rock', 'Nostalgic', 112, 0,
      bar('x.x.|....|x...|..x.', SN24, H8),
      bar('x.x.|....|x...|....', '....|x...|....|x.xx', 'x.x.|x.x.|x.x.|....')),
    p('punk', 'Punk', 'Pop & Rock', 'Intense', 172, 0,
      bar('x...|..x.|x...|..x.', SN24, H8),
      bar('x...|..x.|....|....', '....|x...|xxxx|xxxx', 'x.x.|x.x.|....|....')),
    p('heavy', 'Heavy half-time', 'Pop & Rock', 'Dark', 84, 0,
      bar('x...|....|..x.|.x..', SN3, H8),
      bar('x...|....|..x.|.x..', '....|....|x...|..xx', H8)),
    p('ballad', 'Power ballad', 'Pop & Rock', 'Tender', 68, 0,
      bar('x...|....|x...|..x.', SN24, 'x.o.|o.o.|o.o.|o.o.'),
      bar('x...|....|x...|..x.', '....|x...|....|x.xx', 'x.o.|o.o.|o.o.|o.o.')),
    p('gentle', 'Gentle acoustic', 'Pop & Rock', 'Tender', 78, 0,
      bar('x...|....|..o.|....', '....|o...|....|o...', H8S),
      bar('x...|....|..o.|..o.', '....|o...|....|o.oo', H8S), false),
    p('country', 'Country shuffle', 'Pop & Rock', 'Nostalgic', 108, 0.25,
      bar('x...|....|x...|....', SN24, H8),
      bar('x...|....|x...|....', '....|x...|....|x.xx', H8), false),

    // ---- Funk & Soul
    p('funk', 'Funk', 'Funk & Soul', 'Groovy', 102, 0,
      bar('x..x|..x.|.x..|....', '....|x..o|.o..|x..o', 'xoxo|xoxo|xoxo|xoxo'),
      bar('x..x|..x.|.x..|....', '....|x..o|.o..|xoxx', 'xoxo|xoxo|xoxo|xoxo'), false),
    p('motown', 'Motown stomp', 'Funk & Soul', 'Upbeat', 112, 0,
      bar('x...|..x.|x...|..x.', SN24, H8, 'o...|x...|o...|x...'),
      bar('x...|..x.|x...|..x.', '....|x...|....|xxxx', H8, 'o...|x...|o...|x...')),
    p('disco', 'Disco', 'Funk & Soul', 'Upbeat', 118, 0,
      bar(F4, NONE, 'o.x.|o.x.|o.x.|o.x.', SN24),
      bar(F4, NONE, 'o.x.|o.x.|o.x.|o.x.', '....|x...|....|x.xx')),

    // ---- Hip-Hop & R&B
    p('boombap', 'Boom bap', 'Hip-Hop & R&B', 'Groovy', 90, 0.12,
      bar('x...|..x.|..x.|....', SN24, 'x.o.|x.o.|x.o.|x.o.'),
      bar('x...|..x.|..x.|.x..', '....|x...|....|x.xx', 'x.o.|x.o.|x.o.|x.o.'), false),
    p('trap', 'Trap', 'Hip-Hop & R&B', 'Dark', 140, 0,
      bar('x..x|....|..x.|..x.', SN3, 'x.x.|x.xx|x.x.|xxxx', SN3),
      bar('x..x|....|..x.|..x.', '....|....|x...|...x', 'x.x.|xxxx|x.x.|xxxx', SN3), false),
    p('lofi', 'Lo-fi chill', 'Hip-Hop & R&B', 'Chill', 76, 0.25,
      bar('x...|....|..x.|....', SN24, 'x.o.|o.o.|x.o.|o.o.'),
      bar('x...|....|..x.|.x..', '....|x...|....|x..o', 'x.o.|o.o.|x.o.|o.o.'), false),
    p('slowjam', 'Slow jam', 'Hip-Hop & R&B', 'Tender', 66, 0,
      bar('x...|..x.|....|.x..', SN24, 'x.o.|x.o.|x.o.|x.o.', SN24),
      bar('x...|..x.|....|.x..', '....|x...|....|x..x', 'x.o.|x.o.|x.o.|x.o.', SN24), false),

    // ---- Electronic
    p('house', 'House', 'Electronic', 'Upbeat', 124, 0,
      bar(F4, NONE, OFF, SN24),
      bar(F4, NONE, '..x.|..x.|..x.|.xxx', '....|x...|....|x.xx')),
    p('techno', 'Techno', 'Electronic', 'Dark', 132, 0,
      bar(F4, NONE, 'ooxo|ooxo|ooxo|ooxo', SN24),
      bar(F4, NONE, 'ooxo|ooxo|ooxo|xxxx', SN24)),
    p('dnb', 'Drum & bass', 'Electronic', 'Intense', 172, 0,
      bar('x...|....|..x.|....', SN24, H8),
      bar('x...|....|..x.|..x.', '....|x...|....|x.xx', H8)),
    p('synth', 'Synthwave', 'Electronic', 'Nostalgic', 100, 0,
      bar('x...|....|x...|..x.', SN24, H8, SN24),
      bar('x...|....|x...|..x.', '....|x...|....|xxxx', H8, SN24)),
    p('dubstep', 'Dubstep', 'Electronic', 'Intense', 140, 0,
      bar('x..x|....|....|..x.', SN3, OFF, SN3),
      bar('x..x|....|....|..x.', '....|....|x...|x.xx', OFF, SN3)),
    p('downtempo', 'Downtempo', 'Electronic', 'Chill', 86, 0.15,
      bar('x...|....|..x.|....', '....|x...|....|x..o', H8S),
      bar('x...|....|..x.|....', '....|x...|..o.|x.oo', H8S), false),

    // ---- Latin & Reggae
    p('bossa', 'Bossa nova', 'Latin & Reggae', 'Chill', 128, 0,
      bar('x...|..x.|x...|..x.', 'o..o|..o.|..o.|.o..', H8S),
      bar('x...|..x.|x...|..x.', 'o..o|..o.|..o.|.o..', H8S), false),
    p('reggae', 'One drop', 'Latin & Reggae', 'Chill', 76, 0.15,
      bar(SN3, SN3, H8),
      bar(SN3, '....|....|x...|..x.', H8), false),
    p('dembow', 'Reggaeton dembow', 'Latin & Reggae', 'Upbeat', 96, 0,
      bar(F4, '...x|..x.|...x|..x.', H8S),
      bar(F4, '...x|..x.|...x|.xxx', H8S), false),

    // ---- Jazz & Blues
    p('jazz', 'Jazz swing', 'Jazz & Blues', 'Groovy', 132, 0.33,
      bar('o...|o...|o...|o...', '....|....|..o.|....', 'x...|x.x.|x...|x.x.'),
      bar('o...|o...|o...|o...', '....|..o.|....|.o.o', 'x...|x.x.|x...|x.x.'), false),
    p('shuffle', 'Blues shuffle', 'Jazz & Blues', 'Groovy', 98, 0.33,
      bar('x...|....|x...|....', SN24, H8),
      bar('x...|....|x...|....', '....|x...|....|x.xx', H8), false)
  ];

  function norm(s) {
    var t = String(s).replace(/[|\s]/g, '');
    while (t.length < 16) t += '.';
    return t.slice(0, 16);
  }
  function val(ch) { return ch === 'x' ? 1 : ch === 'o' ? 2 : 0; }

  // 2 bars: main + fill. 3 bars: main, main, fill. 4 bars: main x3 + fill.
  function barPlan(bars) {
    if (bars === 2) return ['a', 'b'];
    if (bars === 3) return ['a', 'a', 'b'];
    return ['a', 'a', 'a', 'b'];
  }

  function emptyGrid(bars) {
    var g = {};
    LANES.forEach(function (l) { g[l.id] = new Array(bars * 16).fill(0); });
    return g;
  }

  function buildGrid(preset, bars) {
    var g = emptyGrid(bars);
    barPlan(bars).forEach(function (which, bi) {
      var def = preset[which];
      LANES.forEach(function (l) {
        if (l.id === 'crash') return;
        var str = norm(def[l.id] || NONE);
        for (var i = 0; i < 16; i++) g[l.id][bi * 16 + i] = val(str[i]);
      });
    });
    if (preset.crash) g.crash[0] = 1;
    return g;
  }

  // Change the number of bars. New bars copy the existing ones in turn (crash is not copied).
  function resizeGrid(grid, oldBars, newBars) {
    var g = emptyGrid(newBars);
    LANES.forEach(function (l) {
      for (var b = 0; b < newBars; b++) {
        var from = b < oldBars ? b : (b % oldBars);
        if (l.id === 'crash' && b >= oldBars) continue;
        for (var i = 0; i < 16; i++) g[l.id][b * 16 + i] = (grid[l.id] && grid[l.id][from * 16 + i]) || 0;
      }
    });
    return g;
  }

  function byId(id) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i];
    return null;
  }

  var api = {
    LANES: LANES, GENRES: GENRES, MOODS: MOODS, PRESETS: PRESETS,
    norm: norm, buildGrid: buildGrid, emptyGrid: emptyGrid, resizeGrid: resizeGrid, byId: byId, barPlan: barPlan
  };
  root.SongBeats = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
