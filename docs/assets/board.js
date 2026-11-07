/* The board. Everything it shows is a pure function of what it is told, so the same scene can be driven by scroll on
   the site and, later, by a clock when the ad is rendered. It never reads the page or the scroll position. */
(function (global) {
  'use strict';

  var CELLS = 81;
  var unitCells = [];
  for (var r = 0; r < 9; r++) { var row = []; for (var c = 0; c < 9; c++) row.push(r * 9 + c); unitCells.push(row); }
  for (c = 0; c < 9; c++) { var col = []; for (r = 0; r < 9; r++) col.push(r * 9 + c); unitCells.push(col); }
  for (var b = 0; b < 9; b++) {
    var box = [], br = Math.floor(b / 3) * 3, bc = (b % 3) * 3;
    for (r = 0; r < 3; r++) for (c = 0; c < 3; c++) box.push((br + r) * 9 + bc + c);
    unitCells.push(box);
  }

  var peersOf = [];
  for (var i = 0; i < CELLS; i++) {
    var seen = {};
    for (var u = 0; u < 27; u++) if (unitCells[u].indexOf(i) !== -1) unitCells[u].forEach(function (p) { if (p !== i) seen[p] = 1; });
    peersOf.push(Object.keys(seen).map(Number));
  }

  /** Every step of a solve as snapshots: values[f] and marks[f] are the board after f steps. */
  function replay(givens, steps) {
    var v = givens.slice(), m = [];
    for (var i = 0; i < CELLS; i++) {
      if (v[i]) { m.push(0); continue; }
      var mask = 1022;
      peersOf[i].forEach(function (p) { if (v[p]) mask &= ~(1 << v[p]); });
      m.push(mask);
    }
    var values = [v], marks = [m];
    steps.forEach(function (s) {
      v = v.slice(); m = m.slice();
      s.pl.forEach(function (x) {
        v[x[0]] = x[1]; m[x[0]] = 0;
        peersOf[x[0]].forEach(function (p) { m[p] &= ~(1 << x[1]); });
      });
      s.el.forEach(function (x) { m[x[0]] &= ~(1 << x[1]); });
      values.push(v); marks.push(m);
    });
    return { values: values, marks: marks };
  }

  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  var NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function create(root, givens) {
    var state = { values: new Array(CELLS).fill(0), marks: new Array(CELLS).fill(0), paint: '', strike: '', focus: 0 };
    var plate = el('div', 'plate', root);

    var fills = [], digits = [], marks = [], shadows = [];
    var fillLayer = el('div', 'layer fills', plate);
    var gridLayer = svg('svg', { class: 'layer grid', viewBox: '0 0 900 900', 'aria-hidden': 'true' }, plate);
    for (var i = 1; i < 9; i++) {
      var heavy = i % 3 === 0 ? 'box' : 'cell';
      svg('line', { class: heavy, x1: i * 100, y1: 0, x2: i * 100, y2: 900 }, gridLayer);
      svg('line', { class: heavy, x1: 0, y1: i * 100, x2: 900, y2: i * 100 }, gridLayer);
    }
    svg('rect', { class: 'box frame', x: 0, y: 0, width: 900, height: 900 }, gridLayer);

    var markLayer = el('div', 'layer marks', plate);
    var shadowLayer = el('div', 'layer shadows', plate);
    var sweep = svg('svg', { class: 'layer sweep', viewBox: '0 0 900 900', 'aria-hidden': 'true' }, plate);
    var digitLayer = el('div', 'layer digits', root);

    function place(e, n) { e.style.setProperty('--r', Math.floor(n / 9)); e.style.setProperty('--c', n % 9); }

    for (i = 0; i < CELLS; i++) {
      var f = el('i', 'fill', fillLayer); place(f, i); fills.push(f);
      var m = el('span', 'mk', markLayer); place(m, i);
      var slots = [];
      for (var d = 1; d <= 9; d++) { var s = el('i', 'm d' + d, m); s.textContent = d; slots.push(s); }
      marks.push(slots);
      var dg = el('span', 'd', digitLayer); place(dg, i);
      if (givens[i]) {
        dg.classList.add('given');
        // heights a little uneven, so the numbers read as objects standing on the sheet
        var z = 5 + ((i * 7) % 11) * 1.2;
        dg.style.setProperty('--z', z);
        var sh = el('span', 'd shadow', shadowLayer); place(sh, i);
        sh.style.setProperty('--z', z); sh.textContent = givens[i];
        shadows.push(sh);
      }
      digits.push(dg);
    }

    /** Digits on the board. A digit arriving going forwards drops in; going backwards it just leaves. */
    function setValues(values, forward) {
      for (var i = 0; i < CELLS; i++) {
        if (values[i] === state.values[i]) continue;
        var e = digits[i];
        e.textContent = values[i] || '';
        if (values[i] && !givens[i]) {
          e.classList.add('entry');
          if (forward) { e.classList.remove('drop'); void e.offsetWidth; e.classList.add('drop'); }
        } else e.classList.remove('entry', 'drop');
        state.values[i] = values[i];
      }
    }

    /** Pencil marks. [order] says when each cell's marks arrive as [amount] goes from 0 to 1. */
    function setMarks(mask, amount, order) {
      for (var i = 0; i < CELLS; i++) {
        var want = amount > order[i] ? mask[i] : 0;
        if (want === state.marks[i]) continue;
        for (var d = 1; d <= 9; d++) marks[i][d - 1].classList.toggle('on', !!(want & (1 << d)));
        state.marks[i] = want;
      }
    }

    /** Marks of one digit stand out; 0 clears it. */
    function setFocus(digit) {
      if (digit === state.focus) return;
      if (digit) markLayer.setAttribute('data-focus', digit); else markLayer.removeAttribute('data-focus');
      state.focus = digit;
    }

    /** [list] of [cell, digit] marks being crossed out. */
    function setStrike(list) {
      var key = list.join('|');
      if (key === state.strike) return;
      root.querySelectorAll('.m.strike').forEach(function (e) { e.classList.remove('strike'); });
      list.forEach(function (x) { marks[x[0]][x[1] - 1].classList.add('strike'); });
      state.strike = key;
    }

    /** Cell backgrounds: {zone: cells, hit: cells, corner: cells, target: cell, heat: {cell: 1..3}}. */
    function setPaint(p) {
      var key = JSON.stringify(p);
      if (key === state.paint) return;
      for (var i = 0; i < CELLS; i++) fills[i].className = 'fill';
      digits.forEach(function (e) { e.classList.remove('hit', 'lit'); });
      (p.zone || []).forEach(function (c) { fills[c].classList.add('zone'); });
      (p.hit || []).forEach(function (c) { fills[c].classList.add('hit'); digits[c].classList.add('hit'); });
      markLayer.querySelectorAll('.on-fill').forEach(function (e) { e.classList.remove('on-fill'); });
      (p.corner || []).forEach(function (c) { fills[c].classList.add('corner'); marks[c][state.focus - 1].classList.add('on-fill'); });
      if (p.target != null) { fills[p.target].classList.add('target'); digits[p.target].classList.add('lit'); }
      for (var c in (p.heat || {})) fills[c].classList.add('heat' + p.heat[c]);
      state.paint = key;
    }

    /** A wrong digit in a cell, or back to empty. */
    function setWrong(cell, digit) {
      var e = digits[cell];
      e.textContent = digit || '';
      e.classList.toggle('wrong', !!digit);
      if (digit) { e.classList.remove('shake'); void e.offsetWidth; e.classList.add('shake'); }
      state.values[cell] = 0;
    }

    return {
      setValues: setValues, setMarks: setMarks, setFocus: setFocus, setStrike: setStrike, setPaint: setPaint,
      setWrong: setWrong, sweep: sweep, digit: function (i) { return digits[i]; },
    };
  }

  global.Board = { create: create, replay: replay, unitCells: unitCells, peersOf: peersOf, svg: svg };
})(window);
