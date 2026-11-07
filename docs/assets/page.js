/* The page: one real solve, driven by scroll. scene(p) turns a scroll position into everything on screen and holds no
   state of its own, so scrolling back rewinds the solve exactly. */
(function () {
  'use strict';

  /* Set this to the Play Store address on launch day: every "Coming soon" on the page becomes a real link. */
  var PLAY_URL = null;

  var SOLVE = window.SOLVE;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CAN_IRIS = !reduce && (CSS.supports('backdrop-filter', 'invert(1)') || CSS.supports('-webkit-backdrop-filter', 'invert(1)'));
  var html = document.documentElement;
  var $ = function (id) { return document.getElementById(id); };

  var givens = SOLVE.givens.split('').map(Number);
  var solution = SOLVE.solution.split('').map(Number);
  var snap = Board.replay(givens, SOLVE.steps);
  var LAST_FRAME = SOLVE.steps.length - 1;     // every step but the visitor's
  var LAST_CELL = SOLVE.steps[LAST_FRAME].pl[0][0];
  var LAST_DIGIT = SOLVE.steps[LAST_FRAME].pl[0][1];
  var units = Board.unitCells;
  var cellsOf = function (list) { return list.reduce(function (a, u) { return a.concat(units[u]); }, []); };

  var board = Board.create($('board'), givens);

  /* ------------------------------------------------------------ timeline: name, viewport-heights of scroll ------ */
  var BEATS = [
    ['hero', .5], ['lift', .4], ['look', .6], ['find', .8], ['place', .5], ['teach', .4], ['run', 1.1],
    ['stall', .9], ['narrow', .6], ['xwing', 1.2], ['fall', 1.5], ['rail', 2.0], ['themes', 1.6], ['last', .8],
  ];
  var TOTAL = BEATS.reduce(function (a, b) { return a + b[1]; }, 0);
  var at = {}, run = 0;
  BEATS.forEach(function (b) { at[b[0]] = { from: run / TOTAL, to: (run + b[1]) / TOTAL }; run += b[1]; });

  function locate(p) {
    for (var i = 0; i < BEATS.length; i++) {
      var w = at[BEATS[i][0]];
      if (p < w.to || i === BEATS.length - 1) return { name: BEATS[i][0], u: clamp((p - w.from) / (w.to - w.from), 0, 1) };
    }
  }

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ease(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }
  function range(u, a, b) { return clamp((u - a) / (b - a), 0, 1); }

  /* -------------------------------------------------------------------------- copy windows, fed to the engine --- */
  document.querySelectorAll('[data-beat]').forEach(function (e) {
    var names = e.getAttribute('data-beat').split(' ');
    var a = at[names[0]], b = at[names[names.length - 1]];
    var win = (e.getAttribute('data-window') || '0 1').split(' ').map(Number);
    var len = b.to - a.from;
    var from = a.from + len * win[0], to = a.from + len * win[1];
    if (e.hasAttribute('data-hold-start')) { e.setAttribute('data-sc-cue', '0 ' + to.toFixed(4) + ' 0 0.3'); return; }
    var edge = 0.1 / TOTAL;
    var ramp = clamp(edge / (to - from), 0.05, 0.3).toFixed(3);
    e.setAttribute('data-sc-cue', from.toFixed(4) + ' ' + to.toFixed(4) + ' ' + ramp + ' ' + ramp);
  });

  /* -------------------------------------------------------------------------------------------------- layout --- */
  var W, H, B, wide, poses, top = 0, span = 1, section = $('solve');

  function focus(fx, fy, x, y, s) {
    return { x: x - (fx - .5) * B * s, y: y - (fy - .5) * B * s, s: s, rx: 0, rz: 0 };
  }

  function layout() {
    W = innerWidth; H = innerHeight;
    wide = W >= 640 && W / H >= 1.15;
    html.classList.toggle('wide', wide);
    var barH = $('bar').offsetHeight;
    B = Math.round(wide ? Math.min(H * .74, W * .46) : Math.min(W - 24, H * .52));
    html.style.setProperty('--b', B + 'px');
    html.style.setProperty('--board-bottom', (barH + 8 + B) + 'px');
    var box2 = [4.5 / 9, 1.5 / 9];
    var last = wide ? null : Math.min(1, (H - barH - 268) / B);
    poses = wide ? {
      hero: { x: W * .76, y: H * .6, s: 1.12, rx: 50, rz: -22 },
      right: { x: W * .69, y: H * .52, s: 1, rx: 0, rz: 0 },
      left: { x: W * .31, y: H * .52, s: 1, rx: 0, rz: 0 },
      centre: { x: W * .5, y: H * .53, s: 1.1, rx: 0, rz: 0 },
      box: focus(box2[0], box2[1], W * .69, H * .5, 1.8),
      away: { x: W * .5, y: H * -.6, s: .7, rx: 0, rz: 0 },
      last: { x: W * .36, y: H * .53, s: 1.05, rx: 0, rz: 0 },
    } : (function () {
      var flat = { x: W / 2, y: barH + 8 + B / 2, s: 1, rx: 0, rz: 0 };
      var lastPose = { x: W / 2, y: barH + 8 + B * last / 2, s: last, rx: 0, rz: 0 };
      return {
        hero: { x: W * .56, y: H * .8, s: 1.14, rx: 50, rz: -22 },
        right: flat, left: flat, centre: flat,
        box: focus(box2[0], box2[1], W / 2, barH + 8 + B * .42, 1.5),
        away: { x: W / 2, y: H * -.5, s: .7, rx: 0, rz: 0 },
        last: lastPose,
      };
    })();
    top = section.getBoundingClientRect().top + scrollY;
    span = Math.max(1, section.offsetHeight - H);
    railTravel = Math.max(0, $('rail').scrollWidth - W);
    apply(true);
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

  var BOX2 = units[19], BLOCKERS = [1, 48, 76], HINT_CELL = SOLVE.steps[0].pl[0][0];
  var POINTING = SOLVE.steps[15], CLAIMING = SOLVE.steps[16], XWING = SOLVE.steps[17];

  function scene(p) {
    var l = locate(p), u = l.u, s = {
      beat: l.name, u: u, frame: 0, marks: 0, marksOpacity: 1, focus: 0, strike: [], paint: {}, k: 0, iris: 0,
      theme: 'paper', lift: 0, board: 1, sweep: {}, step: null,
    };
    switch (l.name) {
      case 'hero': s.cam = pose('hero', 'hero', 0); s.lift = 1; break;
      case 'lift': s.cam = pose('hero', 'box', u); s.lift = 1 - ease(u * 1.2); s.paint = { zone: u > .5 ? BOX2 : [] }; break;
      case 'look': s.cam = pose('box', 'box', 0); s.paint = { zone: BOX2 }; break;
      case 'find':
        s.cam = pose('box', 'right', range(u, 0, .3));
        s.paint = { zone: BOX2, hit: BLOCKERS };
        s.sweep.rays = range(u, .25, .85);
        break;
      case 'place':
        s.cam = pose('right', 'box', range(u, 0, .45));
        s.paint = { zone: BOX2, hit: BLOCKERS, target: HINT_CELL };
        s.sweep.rays = u < .4 ? 1 : null;
        s.frame = u > .5 ? 1 : 0;
        break;
      case 'teach': s.cam = pose('box', 'right', range(u, 0, .7)); s.frame = 1; s.paint = { target: HINT_CELL }; break;
      case 'run': {
        s.cam = pose('right', 'left', range(u, 0, .28));
        s.frame = 1 + Math.round(range(u, .1, .95) * 14);
        s.step = SOLVE.steps[Math.max(0, s.frame - 1)];
        if (s.frame > 1) s.paint = { target: s.step.pl[0][0] };
        break;
      }
      case 'stall':
        s.cam = pose('left', 'right', range(u, 0, .4));
        s.frame = 15; s.marks = range(u, .05, .8);
        var dusk = range(u, .08, .72);
        if (CAN_IRIS) { s.k = dusk > 0 ? 1 : 0; s.iris = dusk > 0 && dusk < 1 ? 1 - dusk : 0; s.irisAt = 0; }
        else s.k = ease(dusk);
        break;
      case 'narrow':
        s.cam = pose('right', 'right', 0); s.frame = 15; s.marks = 1; s.k = 1;
        if (u < .5) {
          var a = range(u, .05, .35);
          s.step = POINTING; s.focus = 9; s.paint = { zone: units[POINTING.units[0]] };
          if (a >= 1) { s.frame = 16; s.strike = []; } else if (a > .4) s.strike = POINTING.el;
        } else {
          var b = range(u, .55, .85);
          s.frame = 16; s.step = CLAIMING; s.focus = 3; s.paint = { zone: units[CLAIMING.units[0]] };
          if (b >= 1) { s.frame = 17; s.strike = []; } else if (b > .4) s.strike = CLAIMING.el;
        }
        break;
      case 'xwing': {
        var open = range(u, .6, .84);
        s.cam = pose('right', 'left', range(u, 0, .22));
        s.frame = u < .62 ? 17 : 18; s.marks = 1; s.focus = 6;
        s.paint = { zone: cellsOf(XWING.units.slice(0, 2)), corner: XWING.pat };
        s.sweep.wing = range(u, .14, .34); s.sweep.cols = range(u, .34, .52);
        s.strike = u > .4 && u < .62 ? XWING.el : [];
        s.k = open >= 1 ? 0 : 1;
        s.iris = open >= 1 ? 0 : open; s.irisAt = 100 / 900;
        if (!CAN_IRIS) { s.iris = 0; s.k = 1 - ease(open); }
        break;
      }
      case 'fall':
        s.cam = pose('left', 'left', 0);
        s.frame = 18 + Math.round(Math.pow(range(u, .02, .94), 1.25) * (LAST_FRAME - 18));
        s.marks = 1; s.marksOpacity = 1 - range(u, .7, .92);
        break;
      case 'rail':
        s.cam = pose('left', 'away', range(u, 0, .16)); s.frame = LAST_FRAME; s.board = 1 - range(u, 0, .14);
        s.rail = range(u, .06, .96); s.railIn = range(u, .04, .12) * (1 - range(u, .95, 1));
        break;
      case 'themes': {
        var t = THEMES[Math.min(THEMES.length - 1, Math.floor(u * THEMES.length))];
        s.cam = pose('right', 'right', 0); s.frame = LAST_FRAME; s.theme = t[0]; s.themeLabel = t;
        s.board = range(u, 0, .05) * 1;
        s.k = t[0] === 'onyx' ? 1 : 0;
        break;
      }
      case 'last':
        s.cam = pose('right', 'last', range(u, 0, .5)); s.frame = LAST_FRAME;
        s.paint = { target: LAST_CELL };
        s.close = range(u, .28, .5);
        break;
    }
    return s;
  }

  /* -------------------------------------------------------------------------------------------------- render --- */
  var stage = $('stage'), camera = $('camera'), tilt = $('tilt'), rail = $('rail'), railWrap = $('railWrap');
  var themes = document.querySelector('.themes'), closeEl = $('close'), pad = $('pad');
  var railTravel = 0, frameNow = 0, intro = reduce ? 1 : 0, pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  var lastTheme = '', lastBeat = '', lastTech = '', lastK = -1, solved = false, mistakes = 0, wrongDigit = 0;

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

    if (s.k !== lastK) { html.style.setProperty('--k', s.k); lastK = s.k; }
    if (s.theme !== lastTheme) {
      html.setAttribute('data-theme', s.theme);
      lastTheme = s.theme;
    }
    if (s.themeLabel) { $('themeName').textContent = s.themeLabel[1]; $('themeTier').textContent = s.themeLabel[2]; }

    if (s.beat !== lastBeat) {
      html.setAttribute('data-now', s.beat);
      html.classList.toggle('flat', s.lift === 0 && s.beat !== 'hero' && s.beat !== 'lift');
      lastBeat = s.beat;
    }

    var cam = s.cam;
    if (reduce) {
      var still = poses[wide ? 'right' : 'centre'];
      if (s.beat === 'last') still = poses.last;
      cam = { x: still.x, y: still.y, s: still.s, rx: 0, rz: 0 };
      if (s.beat === 'rail') s.board = 0;
    }
    var lean = s.lift > 0 && !reduce ? s.lift : 0;
    camera.style.transform = 'translate3d(' + cam.x.toFixed(1) + 'px,' + cam.y.toFixed(1) + 'px,0) scale(' + cam.s.toFixed(4) + ')';
    tilt.style.transform = 'rotateX(' + (cam.rx - pointer.y * 3 * lean).toFixed(2) + 'deg) rotateZ(' + (cam.rz + pointer.x * 4 * lean).toFixed(2) + 'deg)';
    html.style.setProperty('--lift', (reduce ? 0 : s.lift * intro).toFixed(3));
    html.style.setProperty('--marks', s.marksOpacity.toFixed(2));
    camera.style.opacity = s.board.toFixed(2);

    var iris = $('iris');
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
    if (name && name !== lastTech) {
      $('tech').textContent = name; $('tech2').textContent = name; lastTech = name;
    }
  }

  /* --------------------------------------------------------------------------------------------- scroll loop --- */
  var smooth = 0, dwell = {}, lastT = 0, clockMs = 0, started = false, held = false;

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
    var before = smooth;
    smooth += (target - smooth) * (reduce ? 1 : .16);
    if (Math.abs(target - smooth) < .00002) smooth = target;
    var moving = smooth !== before || intro < 1 || Math.abs(pointer.tx - pointer.x) > .002 || Math.abs(pointer.ty - pointer.y) > .002;
    if (intro < 1) intro = Math.min(1, intro + dt / 1300);
    if (moving) apply(false);
  }

  /* The whole story from one number, 0 to 1: how the ad's scenes will be rendered frame by frame. */
  window.SudokuFilm = { seek: function (p) { held = true; smooth = clamp(p, 0, 1); intro = 1; apply(false); } };

  function clockText(sec) { return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); }

  if (matchMedia('(hover: hover) and (pointer: fine)').matches && !reduce) {
    addEventListener('pointermove', function (e) {
      pointer.tx = e.clientX / innerWidth * 2 - 1;
      pointer.ty = e.clientY / innerHeight * 2 - 1;
    }, { passive: true });
  }

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
    var perfect = earned.every(Boolean);
    $('stars').innerHTML = earned.map(function (on, i) {
      return '<span class="star' + (on ? ' on' : '') + (i === 1 ? ' big' : '') + '" style="--i:' + i + '">' + STAR + '</span>';
    }).join('');
    $('resultTitle').textContent = perfect && mistakes === 0 ? 'Perfect game' : 'Solved';
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

  new IntersectionObserver(function (e) { html.classList.toggle('past', e[0].isIntersecting); }, { rootMargin: '0px 0px -100% 0px' }).observe($('get'));

  addEventListener('resize', layout);
  addEventListener('load', layout);
  ScrollCraft.mount(document, {});
  layout();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
  requestAnimationFrame(function (t) { lastT = t; tick(t); });
})();
