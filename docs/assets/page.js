/* The page: one real solve, told in scenes. Scroll picks the moment and the page plays to it at a readable pace, so a
   hard flick never blurs the solve. scene(p) turns a position in the story into everything on screen, so scrolling
   back rewinds the solve exactly. On touch screens every swipe stops at the next scene. */
(function () {
  'use strict';

  /* Set this to the Play Store address on launch day: every "Coming soon" on the page becomes a real link. */
  var PLAY_URL = null;

  var SOLVE = window.SOLVE;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touch = matchMedia('(pointer: coarse)').matches;
  var CAN_IRIS = !reduce && (CSS.supports('backdrop-filter', 'invert(1)') || CSS.supports('-webkit-backdrop-filter', 'invert(1)'));
  var html = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  var givens = SOLVE.givens.split('').map(Number);
  var snap = Board.replay(givens, SOLVE.steps);
  var LAST_FRAME = SOLVE.steps.length - 1;     // every step but the visitor's
  var LAST_CELL = SOLVE.steps[LAST_FRAME].pl[0][0];
  var LAST_DIGIT = SOLVE.steps[LAST_FRAME].pl[0][1];
  var units = Board.unitCells;
  var cellsOf = function (list) { return list.reduce(function (a, u) { return a.concat(units[u]); }, []); };

  var board = Board.create($('board'), givens);

  /* ------------------------------------------------------------------------------------------------ timeline --- */
  /* Each scene: its name, its share of the scroll (viewport heights), how long it takes to play (seconds), and where
     a swipe comes to rest in it (0 to 1). */
  var BEATS = [
    ['hero', .6, .8, 0], ['look', .8, 1.3, .86], ['find', .9, 1.7, .88], ['place', .8, 1.3, .88], ['run', 1.0, 2.2, .9],
    ['stall', .9, 1.8, .88], ['xwing', 1.3, 3.0, .9], ['fall', 1.0, 2.2, .9], ['rail', 1.2, 2.6, null],
    ['themes', .9, .9, .5], ['last', .8, .9, .9],
  ];
  var TOTAL = BEATS.reduce(function (a, b) { return a + b[1]; }, 0);
  var at = {}, run = 0;
  BEATS.forEach(function (b, i) { at[b[0]] = { i: i, from: run / TOTAL, to: (run + b[1]) / TOTAL }; run += b[1]; });

  function locate(p) {
    for (var i = 0; i < BEATS.length; i++) {
      var w = at[BEATS[i][0]];
      if (p < w.to || i === BEATS.length - 1) return { name: BEATS[i][0], i: i, u: clamp((p - w.from) / (w.to - w.from), 0, 1) };
    }
  }
  /* Story position in scenes (2.5 is halfway through the third), and back. */
  function toScenes(p) { var l = locate(p); return l.i + l.u; }
  function toP(b) {
    var i = Math.min(BEATS.length - 1, Math.floor(b)), w = at[BEATS[i][0]];
    return w.from + (w.to - w.from) * clamp(b - i, 0, 1);
  }

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function range(u, a, b) { return clamp((u - a) / (b - a), 0, 1); }

  /* ----------------------------------------------------------------------------------------------- the copy ---- */
  /* Each note shows across its scene, fading in and out at the edges, and follows the story as played, not the
     scroll bar, so the words always match the board. */
  var cues = [];
  document.querySelectorAll('[data-beat]').forEach(function (e) {
    var names = e.getAttribute('data-beat').split(' ');
    var a = at[names[0]], b = at[names[names.length - 1]];
    var win = (e.getAttribute('data-window') || '0 1').split(' ').map(Number);
    var len = b.to - a.from;
    var from = a.from + len * win[0], to = a.from + len * win[1];
    var ramp = Math.min((to - from) * .3, .08 / TOTAL);
    cues.push({ el: e, from: from, to: to, ramp: ramp, greet: e.hasAttribute('data-hold-start'), vis: -1 });
  });

  function cueVis(q, p) {
    if (q.greet) return p <= q.to - q.ramp ? 1 : ease(1 - (p - (q.to - q.ramp)) / q.ramp);
    if (p <= q.from || p >= q.to) return 0;
    if (p < q.from + q.ramp) return ease((p - q.from) / q.ramp);
    if (p > q.to - q.ramp) return ease((q.to - p) / q.ramp);
    return 1;
  }

  function setCues(p) {
    cues.forEach(function (q) {
      var v = Math.round(cueVis(q, p) * 100) / 100;
      if (v === q.vis) return;
      q.vis = v;
      q.el.style.opacity = v;
      q.el.style.transform = reduce || v === 1 ? '' : 'translate3d(0,' + ((1 - v) * 1.4).toFixed(2) + 'vh,0)';
      q.el.style.pointerEvents = v > .5 ? '' : 'none';
    });
  }

  /* -------------------------------------------------------------------------------------------------- layout --- */
  var W, H, B, wide, poses, top = 0, span = 1, section = $('solve'), rests = [];
  section.setAttribute('data-sc-span', (TOTAL + 1).toFixed(2));

  function focus(fx, fy, x, y, s) {
    return { x: x - (fx - .5) * B * s, y: y - (fy - .5) * B * s, s: s, rx: 0, rz: 0 };
  }

  function layout() {
    W = innerWidth; H = innerHeight;
    wide = W >= 640 && W / H >= 1.15;
    html.classList.toggle('wide', wide);
    var barH = $('bar').offsetHeight;
    B = Math.round(wide ? Math.min(H * .74, W * .46) : Math.min(W - 32, H * .5));
    html.style.setProperty('--b', B + 'px');
    html.style.setProperty('--board-bottom', (barH + 8 + B) + 'px');
    var box2 = [4.5 / 9, 1.5 / 9];
    poses = wide ? {
      hero: { x: W * .76, y: H * .6, s: 1.12, rx: 50, rz: -22 },
      right: { x: W * .69, y: H * .52, s: 1, rx: 0, rz: 0 },
      left: { x: W * .31, y: H * .52, s: 1, rx: 0, rz: 0 },
      box: focus(box2[0], box2[1], W * .69, H * .5, 1.8),
      away: { x: W * .5, y: H * -.6, s: .7, rx: 0, rz: 0 },
      last: { x: W * .36, y: H * .53, s: 1.05, rx: 0, rz: 0 },
    } : (function () {
      var flat = { x: W / 2, y: barH + 8 + B / 2, s: 1, rx: 0, rz: 0 };
      // the last cell needs room under the board for the question and two rows of keys
      var room = Math.min(1, (H - barH - 8 - 250) / B);
      return {
        hero: { x: W * .56, y: H * .8, s: 1.14, rx: 50, rz: -22 },
        right: flat, left: flat,
        box: focus(box2[0], box2[1], W / 2, barH + 8 + B * .42, 1.5),
        away: { x: W / 2, y: H * -.5, s: .7, rx: 0, rz: 0 },
        last: { x: W / 2, y: barH + 8 + B * room / 2, s: room, rx: 0, rz: 0 },
      };
    })();
    top = section.getBoundingClientRect().top + scrollY;
    span = Math.max(1, section.offsetHeight - H);
    railTravel = Math.max(0, rail.scrollWidth - W);
    placeRests();
    apply(true);
  }

  /* Where a swipe comes to rest: one point per scene, and one per screen on the rail. */
  function placeRests() {
    var points = [];
    BEATS.forEach(function (b) {
      var w = at[b[0]];
      if (b[0] === 'rail') {
        [].forEach.call(rail.children, function (item) {
          var x = clamp((item.offsetLeft + item.offsetWidth / 2 - W / 2) / Math.max(1, railTravel), 0, 1);
          points.push(w.from + (w.to - w.from) * (RAIL_FROM + (RAIL_TO - RAIL_FROM) * x));
        });
      } else points.push(w.from + (w.to - w.from) * b[3]);
    });
    var box = $('rests');
    while (box.children.length < points.length) box.appendChild(document.createElement('i'));
    points.forEach(function (p, i) { box.children[i].style.top = Math.round(p * span) + 'px'; });
    rests = points;
    // snapping starts only once the stops are in place, or the browser snaps the opening view to the foot of the page
    html.classList.add('snap');
  }

  function pose(a, b, t) {
    var A = poses[a], Z = poses[b]; t = ease(t);
    var m = function (k) { return A[k] + (Z[k] - A[k]) * t; };
    return { x: m('x'), y: m('y'), s: m('s'), rx: m('rx'), rz: m('rz') };
  }

  /* --------------------------------------------------------------------------------- the sweeps on the board --- */
  var sv = board.sweep, ink = Board.svg;
  function line(x1, y1, x2, y2, cls) {
    return ink('line', { x1: x1, y1: y1, x2: x2, y2: y2, pathLength: 1, class: cls || 'ray', 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, sv);
  }
  function cross(r, c) {
    var x = c * 100 + 50, y = r * 100 + 50, d = 22;
    return ink('path', { d: 'M' + (x - d) + ' ' + (y - d) + 'l' + 2 * d + ' ' + 2 * d + 'm0 ' + -2 * d + 'l' + -2 * d + ' ' + 2 * d, class: 'nope', opacity: 0 }, sv);
  }
  var rays = [line(150, 50, 590, 50), line(350, 550, 350, 10), line(450, 850, 450, 10)];
  var nopes = [[cross(0, 3), cross(0, 5)], [cross(1, 3), cross(2, 3)], [cross(1, 4), cross(2, 4)]];
  var wing = ink('path', { d: 'M150 450H750V650H150Z', pathLength: 1, class: 'wing', 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, sv);
  var wingCols = [line(150, 450, 150, 10, 'ray ray--gold'), line(150, 650, 150, 890, 'ray ray--gold'), line(750, 450, 750, 10, 'ray ray--gold'), line(750, 650, 750, 890, 'ray ray--gold')];

  function draw(e, t) { e.setAttribute('stroke-dashoffset', (1 - clamp(t, 0, 1)).toFixed(3)); }

  function setSweep(s) {
    rays.forEach(function (r, i) {
      var t = s.rays != null ? range(s.rays, i * .25, i * .25 + .5) : 0;
      draw(r, t);
      nopes[i].forEach(function (n) { n.setAttribute('opacity', s.rays != null && t > .75 ? 1 : 0); });
    });
    draw(wing, s.wing || 0);
    wingCols.forEach(function (c) { draw(c, s.cols || 0); });
  }

  /* --------------------------------------------------------------------------------------------------- scene --- */
  var ORDER = [];
  for (var i = 0; i < 81; i++) {
    var r = Math.floor(i / 9), c = i % 9;
    ORDER.push(((r + c) / 16) * .9 + ((i * 13) % 7) * .012);
  }
  var NO_MARKS = new Array(81).fill(9);

  var THEMES = [
    ['onyx', 'Onyx', 'Free'], ['swiss', 'Swiss Poster', 'Premium'], ['eink', 'E-Ink Reader', 'Premium'],
    ['terminal', 'Retro Terminal', 'Premium'], ['zen', 'Zen Garden', 'Premium'], ['editorial', 'New York Editorial', 'Premium'],
    ['broadsheet', 'Broadsheet', 'Premium'], ['paper', 'Paper', 'Free'],
  ];
  var THEME_MS = 1100;

  var BOX2 = units[19], BLOCKERS = [1, 48, 76], HINT_CELL = SOLVE.steps[0].pl[0][0];
  var XWING = SOLVE.steps[17];
  var RAIL_FROM = .08, RAIL_TO = .94;

  function scene(p) {
    var l = locate(p), u = l.u, s = {
      beat: l.name, u: u, frame: 0, marks: 0, marksOpacity: 1, focus: 0, strike: [], paint: {}, k: 0, iris: 0,
      theme: 'paper', lift: 0, board: 1, sweep: {}, step: null,
    };
    switch (l.name) {
      case 'hero': s.cam = pose('hero', 'hero', 0); s.lift = 1; break;
      case 'look':
        s.cam = pose('hero', 'box', range(u, 0, .45)); s.lift = 1 - ease(range(u, 0, .4));
        s.paint = { zone: u > .35 ? BOX2 : [] };
        break;
      case 'find':
        s.cam = pose('box', 'right', range(u, 0, .3));
        s.paint = { zone: BOX2, hit: BLOCKERS };
        s.sweep.rays = range(u, .25, .8);
        break;
      case 'place':
        s.cam = pose('right', 'box', range(u, 0, .45));
        s.paint = { zone: BOX2, hit: BLOCKERS, target: HINT_CELL };
        s.sweep.rays = u < .4 ? 1 : null;
        s.frame = u > .5 ? 1 : 0;
        break;
      case 'run':
        s.cam = pose('box', 'left', range(u, 0, .3));
        s.frame = 1 + Math.round(range(u, .12, .84) * 14);
        s.step = SOLVE.steps[Math.max(0, s.frame - 1)];
        if (s.frame > 1) s.paint = { target: s.step.pl[0][0] };
        break;
      case 'stall': {
        // the singles run out: pencil marks fill the board and the lights go out. The Pointing and Claiming steps
        // between here and the X-Wing only clear a few marks, so they happen as the scene settles.
        s.cam = pose('left', 'right', range(u, 0, .4));
        s.frame = u < .8 ? 15 : 17; s.marks = range(u, .05, .7);
        var dusk = range(u, .1, .66);
        if (CAN_IRIS) { s.k = dusk > 0 ? 1 : 0; s.iris = dusk > 0 && dusk < 1 ? 1 - dusk : 0; s.irisAt = 0; }
        else s.k = ease(dusk);
        break;
      }
      case 'xwing': {
        var open = range(u, .58, .82);
        s.cam = pose('right', 'left', range(u, 0, .2));
        s.frame = u < .6 ? 17 : 18; s.marks = 1; s.focus = 6;
        s.paint = { zone: cellsOf(XWING.units.slice(0, 2)), corner: XWING.pat };
        s.sweep.wing = range(u, .1, .28); s.sweep.cols = range(u, .28, .44);
        s.strike = u > .36 && u < .6 ? XWING.el : [];
        s.k = open >= 1 ? 0 : 1;
        s.iris = open >= 1 ? 0 : open; s.irisAt = 100 / 900;
        if (!CAN_IRIS) { s.iris = 0; s.k = 1 - ease(open); }
        break;
      }
      case 'fall':
        s.cam = pose('left', 'left', 0);
        s.frame = 18 + Math.round(Math.pow(range(u, .02, .84), 1.2) * (LAST_FRAME - 18));
        s.marks = 1; s.marksOpacity = 1 - range(u, .55, .82);
        break;
      case 'rail':
        s.cam = pose('left', 'away', range(u, 0, .16)); s.frame = LAST_FRAME; s.board = 1 - range(u, 0, .14);
        s.rail = range(u, RAIL_FROM, RAIL_TO); s.railIn = range(u, .03, .1) * (1 - range(u, .96, 1));
        break;
      case 'themes': {
        // the themes take turns while the scene is on screen, ending on Paper for the last cell
        var t = THEMES[Math.min(THEMES.length - 1, Math.floor(themeMs / THEME_MS))];
        s.cam = pose('right', 'right', 0); s.frame = LAST_FRAME; s.theme = t[0]; s.themeLabel = t;
        s.board = range(u, 0, .08);
        s.k = t[0] === 'onyx' ? 1 : 0;
        break;
      }
      case 'last':
        s.cam = pose('right', 'last', range(u, 0, .5)); s.frame = LAST_FRAME;
        s.paint = { target: LAST_CELL };
        s.close = range(u, .28, .55);
        break;
    }
    return s;
  }

  /* -------------------------------------------------------------------------------------------------- render --- */
  var camera = $('camera'), tilt = $('tilt'), rail = $('rail'), railWrap = $('railWrap');
  var closeEl = $('close'), pad = $('pad');
  var railTravel = 0, frameNow = 0, intro = reduce ? 1 : 0, pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var lastTheme = '', lastBeat = '', lastTech = '', lastK = -1, lastFlat = null, solved = false, mistakes = 0, wrongDigit = 0;
  var themeMs = 0;

  function apply(force) {
    var s = scene(smooth);
    var done = solved && s.beat === 'last';
    if (wrongDigit && s.beat !== 'last') { board.setWrong(LAST_CELL, 0); wrongDigit = 0; }
    board.setValues(snap.values[done ? SOLVE.steps.length : s.frame], s.frame > frameNow && !force);
    frameNow = s.frame;
    board.setMarks(snap.marks[s.frame], s.marks, s.marks > 0 ? ORDER : NO_MARKS);
    board.setFocus(s.focus);
    board.setStrike(s.strike);
    board.setPaint(done ? { heat: heatMap } : s.paint);
    setSweep(s.sweep);
    setCues(smooth);

    if (s.k !== lastK) { html.style.setProperty('--k', s.k); lastK = s.k; }
    if (s.theme !== lastTheme) { html.setAttribute('data-theme', s.theme); lastTheme = s.theme; }
    if (s.themeLabel) { $('themeName').textContent = s.themeLabel[1]; $('themeTier').textContent = s.themeLabel[2]; }
    if (s.beat !== lastBeat) { html.setAttribute('data-now', s.beat); lastBeat = s.beat; }
    var flat = s.lift === 0;
    if (flat !== lastFlat) { html.classList.toggle('flat', flat); lastFlat = flat; }

    var cam = s.cam;
    if (reduce) {
      var still = s.beat === 'last' ? poses.last : poses.right;
      cam = { x: still.x, y: still.y, s: still.s, rx: 0, rz: 0 };
      if (s.beat === 'rail') s.board = 0;
    }
    var lean = s.lift > 0 && !reduce ? s.lift : 0;
    camera.style.transform = 'translate3d(' + cam.x.toFixed(1) + 'px,' + cam.y.toFixed(1) + 'px,0) scale(' + cam.s.toFixed(4) + ')';
    tilt.style.transform = 'rotateX(' + (cam.rx - pointer.y * 3 * lean).toFixed(2) + 'deg) rotateZ(' + (cam.rz + pointer.x * 4 * lean).toFixed(2) + 'deg)';
    html.style.setProperty('--lift', (reduce ? 0 : s.lift * intro).toFixed(3));
    html.style.setProperty('--marks', s.marksOpacity.toFixed(2));
    camera.style.opacity = s.board.toFixed(2);

    if (s.iris > 0) {
      var cx = cam.x, cy = cam.y + s.irisAt * B * cam.s;
      iris.style.display = 'block';
      iris.style.clipPath = 'circle(' + (Math.hypot(W, H) * 1.02 * ease(s.iris)).toFixed(0) + 'px at ' + cx.toFixed(0) + 'px ' + cy.toFixed(0) + 'px)';
    } else iris.style.display = 'none';

    var railOn = s.rail != null;
    railWrap.style.visibility = railOn ? 'visible' : 'hidden';
    if (railOn) {
      railWrap.style.opacity = reduce ? 1 : s.railIn.toFixed(2);
      if (!reduce) rail.style.transform = 'translate3d(' + (-s.rail * railTravel).toFixed(1) + 'px,0,0)';
    }

    var showClose = s.close != null;
    closeEl.style.opacity = showClose ? s.close.toFixed(2) : 0;
    if (showClose !== closeEl.__on) {
      closeEl.__on = showClose;
      closeEl.style.visibility = showClose ? 'visible' : 'hidden';
      closeEl.inert = !showClose;
    }

    var name = s.step ? s.step.t : '';
    if (name && name !== lastTech) { $('tech').textContent = name; lastTech = name; }
  }

  /* --------------------------------------------------------------------------------------------- scroll loop --- */
  var smooth = 0, dwell = {}, lastT = 0, clockMs = 0, started = false, held = false, rush = false;

  /* Plays the story toward where the scroll is, one scene at that scene's own pace. Further than a scene away it
     fast-forwards, so a long scroll or the skip link still gets there quickly. */
  function chase(target, dt) {
    if (reduce) return target;
    var from = toScenes(smooth), to = toScenes(target), gap = to - from;
    if (Math.abs(gap) < .0005) { rush = false; return target; }
    var here = BEATS[Math.min(BEATS.length - 1, Math.floor(from))];
    var pace = 1 / here[2];                                         // scenes per second
    if (Math.abs(gap) > 1.15) pace *= 4;
    if (rush) pace *= 3;
    var step = Math.min(Math.abs(gap), pace * dt / 1000, Math.abs(gap) * .2 + .002);
    return toP(from + Math.sign(gap) * step);
  }

  function tick(t) {
    requestAnimationFrame(tick);
    if (held) return;
    var dt = Math.min(100, t - lastT); lastT = t;
    var target = clamp((scrollY - top) / span, 0, 1);
    if (scrollY > 4) started = true;
    if (started && !solved && !document.hidden) {
      clockMs += dt;
      var sec = Math.floor(clockMs / 1000);
      if (sec !== tick.sec) { tick.sec = sec; $('clock').textContent = clockText(sec); }
      var i = Math.max(0, Math.min(LAST_FRAME - 1, frameNow));
      dwell[i] = (dwell[i] || 0) + dt;
    }
    pointer.x += (pointer.tx - pointer.x) * .08;
    pointer.y += (pointer.ty - pointer.y) * .08;
    var before = smooth, theme = Math.floor(themeMs / THEME_MS);
    smooth = chase(target, dt);
    themeMs = lastBeat === 'themes' ? themeMs + dt : 0;
    var moving = smooth !== before || intro < 1 || Math.floor(themeMs / THEME_MS) !== theme || lastBeat === 'themes' ||
      Math.abs(pointer.tx - pointer.x) > .002 || Math.abs(pointer.ty - pointer.y) > .002;
    if (intro < 1) intro = Math.min(1, intro + dt / 1300);
    if (moving) apply(false);
  }

  /* The whole story from one number, 0 to 1, held still: how the ad's scenes will be rendered frame by frame.
     [ms] sets how long the themes scene has been on screen. */
  window.SudokuFilm = {
    seek: function (p, ms) { held = true; smooth = clamp(p, 0, 1); themeMs = ms || 0; intro = 1; apply(false); },
    /** The story position [u] of the way through scene [name], for seek. */
    at: function (name, u) { var w = at[name]; return w.from + (w.to - w.from) * (u || 0); },
  };

  function clockText(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
    addEventListener('pointermove', function (e) {
      pointer.tx = e.clientX / innerWidth * 2 - 1;
      pointer.ty = e.clientY / innerHeight * 2 - 1;
    }, { passive: true });
  }

  /* Skip to the last cell: the solve fast-forwards on the way there. */
  $('skip').addEventListener('click', function (e) {
    e.preventDefault();
    rush = true;
    scrollTo({ top: top + rests[rests.length - 1] * span, behavior: reduce ? 'auto' : 'smooth' });
  });

  /* ------------------------------------------------------------------------------ the last cell is the visitor's */
  var heatMap = {};

  for (var d = 1; d <= 9; d++) (function (d) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = d; b.setAttribute('aria-label', 'Place a ' + d);
    b.addEventListener('click', function () { place(d); });
    pad.appendChild(b);
  })(d);

  addEventListener('keydown', function (e) {
    if (lastBeat !== 'last' || solved || e.metaKey || e.ctrlKey || e.altKey) return;
    if (/^[1-9]$/.test(e.key)) place(Number(e.key));
  });

  function place(d) {
    if (solved) return;
    if (d !== LAST_DIGIT) {
      mistakes++;
      wrongDigit = d;
      board.setWrong(LAST_CELL, d);
      $('mistakes').textContent = mistakes + (mistakes === 1 ? ' mistake' : ' mistakes');
      $('askLine').textContent = 'Not this one. Check the row, the column and the box for a ' + d + '.';
      return;
    }
    board.setWrong(LAST_CELL, 0);
    wrongDigit = 0;
    solved = true;
    heatMap = heat();
    apply(true);
    board.digit(LAST_CELL).classList.add('drop');
    showResult();
  }

  /** The app's heat map, from this visit: the five steps the visitor stayed on longest. */
  function heat() {
    var ranked = Object.keys(dwell).map(Number).sort(function (a, b) { return dwell[b] - dwell[a]; });
    var out = {}, placed = 0;
    ranked.forEach(function (i) {
      var st = SOLVE.steps[Math.max(0, i - 1)];
      if (!st || !st.pl.length || placed >= 5) return;
      out[st.pl[0][0]] = placed < 2 ? 1 : placed < 4 ? 2 : 3;
      placed++;
    });
    return out;
  }

  var STAR = '<svg viewBox="0 0 24 24"><path d="M12 1.9l2.9 6.2 6.7.8c.9.1 1.3 1.3.6 1.9l-5 4.6 1.3 6.7c.2.9-.8 1.6-1.6 1.1L12 20.200l-5.900 3.300c-.8.5-1.800-.2-1.600-1.100l1.300-6.700-5-4.600c-.7-.6-.3-1.800.6-1.900l6.700-.8z"/></svg>';

  function showResult() {
    var sec = Math.floor(clockMs / 1000), time = clockText(sec);
    var earned = [mistakes <= 1, true, true];
    $('stars').innerHTML = earned.map(function (on, i) {
      return '<span class="star' + (on ? ' on' : '') + (i === 1 ? ' big' : '') + '" style="--i:' + i + '">' + STAR + '</span>';
    }).join('');
    $('resultTitle').textContent = mistakes === 0 ? 'Perfect game' : 'Solved';
    $('scoreMistakes').textContent = mistakes;
    $('scoreMistakesLabel').textContent = mistakes === 1 ? 'mistake' : 'mistakes';
    $('scoreTime').textContent = time;
    $('verdict').textContent = mistakes === 0 ? 'Clean solve, in ' + time + '.' : 'Solved in ' + time + ', with ' + mistakes + (mistakes === 1 ? ' mistake.' : ' mistakes.');
    $('ask').hidden = true;
    $('result').hidden = false;
    html.classList.add('solved');
    $('resultTitle').focus({ preventScroll: true });
  }

  /* -------------------------------------------------------------------------------------------------- launch --- */
  if (PLAY_URL) {
    document.querySelectorAll('[data-cta]').forEach(function (e) {
      var a = document.createElement('a');
      a.className = e.className + ' is-live'; a.href = PLAY_URL; a.textContent = 'Get it on Google Play';
      a.rel = 'noopener'; e.replaceWith(a);
    });
  }

  var iris = document.createElement('div');
  iris.id = 'iris'; iris.className = 'iris'; iris.setAttribute('aria-hidden', 'true');
  document.body.appendChild(iris);

  closeEl.style.visibility = 'hidden'; closeEl.inert = true; closeEl.__on = false;
  if (touch) html.classList.add('touch');

  new IntersectionObserver(function (e) { html.classList.toggle('past', e[0].isIntersecting); }, { rootMargin: '0px 0px -100% 0px' }).observe($('get'));

  addEventListener('resize', layout);
  addEventListener('load', layout);
  ScrollCraft.mount(document, {});
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  requestAnimationFrame(function (t) { lastT = t; tick(t); });
})();
