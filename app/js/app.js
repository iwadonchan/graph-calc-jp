// mamolii graph-calc-jp — アプリ本体
// 式リスト、スライダー(a, b)、別名表示、ズーム/パン、トレース、保存を行う。

'use strict';

import { parse, ParseError, collectVars } from './parser.js';
import { classify, SLIDER_VARS } from './classify.js';
import { Grapher } from './grapher.js';
import { renderMath } from './pretty.js';

const COLORS = ['#c74440', '#2d70b3', '#388c46', '#6042a6', '#fa7e19', '#000000'];
const STORE_KEY = 'graphcalcjp-state-v1';

// ---------- 状態 ----------

const state = {
  rows: [],      // {id, text, color, visible, width, dash}
  sliders: {},   // a: {value, min, max, step, alias, animating, dir}
  angleMode: 'radian',
  view: { xmin: -10, xmax: 10, ymin: -6.5, ymax: 6.5 },
};

let rowSeq = 1;
const compiled = new Map(); // rowId → {key, item}

function newSlider(vName, value = 1) {
  return { value, min: -10, max: 10, step: 0.1, alias: '', animating: false, dir: 1 };
}

function angleModeChanged() {
  compiled.clear();
  scheduleRender();
}

// ---------- 式の分類 → 描画アイテム ----------

function classifyRow(row) {
  let ast;
  try { ast = parse(row.text); } catch (e) {
    return { kind: 'error', message: e instanceof ParseError ? e.message : '式を読み解けませんでした' };
  }
  const ctx = {
    angleMode: state.angleMode,
    sliderValue: (v) => (state.sliders[v] ? state.sliders[v].value : undefined),
    ensureSlider: (v) => {
      if (!state.sliders[v]) {
        state.sliders[v] = newSlider(v);
        setTimeout(() => showHintToast(`${v} はグラフの平面に出ない変数です。スライダーを追加しました。⚙で別名表示も設定できます。`));
      }
    },
    setSliderValue: (v, val) => { state.sliders[v].value = val; },
  };
  const result = classify(ast, ctx);
  if (result.kind === 'item') {
    result.item.color = row.color;
    if (result.item.kind === 'explicit' || result.item.kind === 'explicitY' || result.item.kind === 'implicit') {
      result.item.width = row.width;
      result.item.dash = row.dash;
    }
  }
  return result;
}

function getItem(row) {
  const key = row.text + '|' + state.angleMode + '|' + row.color + '|' + row.width + '|' + (row.dash || []).join(',');
  const c = compiled.get(row.id);
  if (c && c.key === key) return c;
  const result = classifyRow(row);
  const entry = { key, result };
  compiled.set(row.id, entry);
  return entry;
}

// ---------- 描画 ----------

const canvas = document.getElementById('graph-canvas');
const grapher = new Grapher(canvas);
let renderQueued = false;

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; doRender(); });
}

function doRender() {
  const items = [];
  for (const row of state.rows) {
    if (!row.visible) continue;
    const { result } = getItem(row);
    if (result.kind === 'item') items.push(result.item);
  }
  grapher.render(items, state.view);
}

// ---------- UI構築 ----------

const exprList = document.getElementById('expr-list');

function addRow(text = '', opts = {}) {
  const row = {
    id: 'r' + (rowSeq++),
    text,
    color: opts.color || COLORS[(state.rows.length) % COLORS.length],
    visible: true,
    width: 2.5,
    dash: [],
  };
  state.rows.push(row);
  const li = buildRowEl(row);
  exprList.appendChild(li);
  scheduleRender();
  saveSoon();
  return row;
}

function removeRow(row) {
  state.rows = state.rows.filter((r) => r !== row);
  compiled.delete(row.id);
  const elx = document.getElementById('row-' + row.id);
  if (elx) elx.remove();
  pruneSliders();
  scheduleRender();
  saveSoon();
}

function pruneSliders() {
  for (const v of SLIDER_VARS) {
    if (!state.sliders[v]) continue;
    const used = state.rows.some((r) => {
      if (!r.visible || !r.text.trim()) return false;
      try { return collectVars(parse(r.text)).has(v); } catch (e) { return false; }
    });
    const isDefinedHere = state.rows.some((r) => {
      if (!r.text.trim()) return false;
      try {
        const ast = parse(r.text);
        return ast.k === 'rel' && ast.op === '=' && ast.l.k === 'var' && ast.l.name === v;
      } catch (e) { return false; }
    });
    if (!used && !isDefinedHere) {
      if (state.sliders[v].animating) stopAnim(v);
      delete state.sliders[v];
      const sel = document.getElementById('slider-' + v);
      if (sel) sel.remove();
    }
  }
}

function buildRowEl(row) {
  const li = document.createElement('li');
  li.className = 'expr-row';
  li.id = 'row-' + row.id;

  const colorBtn = document.createElement('button');
  colorBtn.className = 'color-dot';
  colorBtn.style.background = row.color;
  colorBtn.title = '色とスタイル';
  colorBtn.addEventListener('click', (ev) => { ev.stopPropagation(); openStylePopover(row, colorBtn); });

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'expr-input';
  input.value = row.text;
  input.placeholder = '式を入力（例: y=x^2）';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.addEventListener('input', () => {
    row.text = input.value;
    refreshRowDisplay(row, li);
    scheduleRender();
    saveSoon();
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const r = addRow('');
      const elx = document.getElementById('row-' + r.id);
      if (elx) elx.querySelector('.expr-input').focus();
    }
  });

  const visible = document.createElement('button');
  visible.className = 'vis-btn';
  visible.textContent = row.visible ? '👁' : '⃠';
  visible.title = '表示/非表示';
  visible.addEventListener('click', () => {
    row.visible = !row.visible;
    visible.textContent = row.visible ? '👁' : '⃠';
    li.classList.toggle('row-hidden', !row.visible);
    scheduleRender();
    saveSoon();
  });

  const del = document.createElement('button');
  del.className = 'del-btn';
  del.textContent = '×';
  del.title = 'この式を削除';
  del.addEventListener('click', () => removeRow(row));

  const main = document.createElement('div');
  main.className = 'expr-main';
  main.append(colorBtn, input, visible, del);

  const preview = document.createElement('div');
  preview.className = 'expr-preview';

  const msg = document.createElement('div');
  msg.className = 'expr-msg';

  li.append(main, preview, msg);
  refreshRowDisplay(row, li);
  return li;
}

function refreshRowDisplay(row, li) {
  const preview = li.querySelector('.expr-preview');
  const msg = li.querySelector('.expr-msg');
  preview.innerHTML = '';
  msg.textContent = '';
  li.classList.remove('row-error', 'row-hint');

  const text = row.text.trim();
  if (!text) return;

  const { result } = getItem(row);
  const aliasMap = aliasMapNow();
  const varColors = { a: state.sliders.a?.color || '#2d70b3', b: state.sliders.b?.color || '#388c46' };

  try {
    const ast = parse(text);
    preview.appendChild(renderMath(ast, aliasMap, varColors));
  } catch (e) { /* エラー表示は下で */ }

  if (result.kind === 'error') {
    msg.textContent = result.message;
    li.classList.add('row-error');
  } else if (result.kind === 'needsvar') {
    msg.textContent = result.message;
    li.classList.add('row-hint');
  }
  syncSliderRows();
}

// 定義済みスライダー変数の行を式リストへ反映(なければ作る)
function syncSliderRows() {
  for (const v of SLIDER_VARS) {
    if (state.sliders[v]) ensureSliderRow(v);
  }
}

function aliasMapNow() {
  const m = {};
  for (const v of SLIDER_VARS) {
    const s = state.sliders[v];
    if (s && s.alias && s.alias.trim()) m[v] = s.alias.trim();
  }
  return m;
}

// ---------- スライダー行 ----------

function ensureSliderRow(v) {
  if (document.getElementById('slider-' + v)) return;
  const li = document.createElement('li');
  li.className = 'slider-row';
  li.id = 'slider-' + v;
  const color = v === 'a' ? '#2d70b3' : '#388c46';
  rebuildSliderRow(li, v, color);
  exprList.appendChild(li);
}

function rebuildSliderRow(li, v, color) {
  li.innerHTML = '';
  const s = state.sliders[v];
  if (!s) { li.remove(); return; }

  const head = document.createElement('div');
  head.className = 'slider-head';

  const label = document.createElement('span');
  label.className = 'slider-label';
  const nameSpan = document.createElement('span');
  nameSpan.className = 'mvar';
  nameSpan.style.color = color;
  nameSpan.textContent = s.alias && s.alias.trim() ? s.alias.trim() : v;
  if (s.alias && s.alias.trim()) nameSpan.title = `内部変数 ${v} の別名表示`;
  label.append(nameSpan, document.createTextNode(' = '));
  const valSpan = document.createElement('span');
  valSpan.className = 'slider-value';
  valSpan.textContent = fmt(s.value);
  label.append(valSpan);

  const play = document.createElement('button');
  play.className = 'play-btn';
  play.textContent = s.animating ? '⏸' : '▶';
  play.title = 'アニメーション';
  play.addEventListener('click', () => {
    s.animating = !s.animating;
    play.textContent = s.animating ? '⏸' : '▶';
    if (s.animating) animLoop();
  });

  const settings = document.createElement('button');
  settings.className = 'gear-btn';
  settings.textContent = '⚙';
  settings.title = 'スライダーの設定（範囲・別名表示）';
  settings.addEventListener('click', (ev) => { ev.stopPropagation(); openSliderPopover(v, settings); });

  head.append(label, play, settings);

  const range = document.createElement('input');
  range.type = 'range';
  range.className = 'slider-range';
  range.min = s.min; range.max = s.max; range.step = s.step;
  range.value = s.value;
  range.addEventListener('input', () => {
    s.value = parseFloat(range.value);
    valSpan.textContent = fmt(s.value);
    scheduleRender();
    saveSoon();
  });

  li.append(head, range);
}

function fmt(v) {
  return String(Math.round(v * 1000) / 1000);
}

function openSliderPopover(v, anchor) {
  closePopovers();
  const s = state.sliders[v];
  const pop = document.createElement('div');
  pop.className = 'popover';

  const title = document.createElement('div');
  title.className = 'popover-title';
  title.textContent = `スライダー ${v} の設定`;
  pop.append(title);

  const mk = (labelText, value, onChange, step = 0.1) => {
    const lab = document.createElement('label');
    lab.className = 'popover-field';
    const span = document.createElement('span');
    span.textContent = labelText;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = value;
    inp.step = step;
    inp.addEventListener('change', () => { onChange(parseFloat(inp.value)); });
    lab.append(span, inp);
    pop.append(lab);
    return inp;
  };
  mk('最小値', s.min, (x) => { if (Number.isFinite(x)) { s.min = x; syncSliderRow(v); } });
  mk('最大値', s.max, (x) => { if (Number.isFinite(x)) { s.max = x; syncSliderRow(v); } });
  mk('刻み', s.step, (x) => { if (Number.isFinite(x) && x > 0) { s.step = x; syncSliderRow(v); } });

  const aliasLab = document.createElement('label');
  aliasLab.className = 'popover-field';
  const aliasSpan = document.createElement('span');
  aliasSpan.textContent = '別名表示';
  const aliasInput = document.createElement('input');
  aliasInput.type = 'text';
  aliasInput.value = s.alias || '';
  aliasInput.placeholder = '例: x, y, k, n';
  aliasInput.maxLength = 6;
  aliasInput.addEventListener('input', () => {
    s.alias = aliasInput.value;
    refreshAllRows();
    const li = document.getElementById('slider-' + v);
    if (li) rebuildSliderRow(li, v, v === 'a' ? '#2d70b3' : '#388c46');
    saveSoon();
  });
  aliasLab.append(aliasSpan, aliasInput);
  pop.append(aliasLab);

  const note = document.createElement('div');
  note.className = 'popover-note';
  note.textContent = '別名表示は画面の見た目だけを変えます。計算では内部変数 a, b が使われます。';
  pop.append(note);

  document.body.appendChild(pop);
  placePopover(pop, anchor);
}

function syncSliderRow(v) {
  const li = document.getElementById('slider-' + v);
  if (li) rebuildSliderRow(li, v, v === 'a' ? '#2d70b3' : '#388c46');
  scheduleRender();
  saveSoon();
}

function refreshAllRows() {
  for (const row of state.rows) {
    const li = document.getElementById('row-' + row.id);
    if (li) refreshRowDisplay(row, li);
  }
  scheduleRender();
}

// ---------- スタイル変更 ----------

function openStylePopover(row, anchor) {
  closePopovers();
  const pop = document.createElement('div');
  pop.className = 'popover';
  const palette = document.createElement('div');
  palette.className = 'palette';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'palette-dot';
    b.style.background = c;
    b.addEventListener('click', () => {
      row.color = c;
      compiled.delete(row.id);
      const li = document.getElementById('row-' + row.id);
      if (li) li.querySelector('.color-dot').style.background = c;
      scheduleRender(); saveSoon(); closePopovers();
    });
    palette.appendChild(b);
  }
  pop.append(palette);

  const mkStyle = (label, dash, width) => {
    const b = document.createElement('button');
    b.className = 'style-btn';
    b.textContent = label;
    b.addEventListener('click', () => {
      row.dash = dash; row.width = width;
      compiled.delete(row.id);
      scheduleRender(); saveSoon();
    });
    pop.append(b);
  };
  mkStyle('普通の線', [], 2.5);
  mkStyle('太い線', [], 4);
  mkStyle('細い線', [], 1.5);
  mkStyle('破線', [7, 5], 2.5);
  mkStyle('点線', [2, 4], 2.5);

  document.body.appendChild(pop);
  placePopover(pop, anchor);
}

function placePopover(pop, anchor) {
  const r = anchor.getBoundingClientRect();
  pop.style.left = Math.min(r.left, window.innerWidth - 240) + 'px';
  pop.style.top = (r.bottom + 6) + 'px';
}

function closePopovers() {
  document.querySelectorAll('.popover').forEach((p) => p.remove());
}
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.popover') && !ev.target.closest('.color-dot') && !ev.target.closest('.gear-btn')) closePopovers();
});

// ---------- アニメーション ----------

let animRunning = false;
function animLoop() {
  if (animRunning) return;
  animRunning = true;
  let last = performance.now();
  function tick(now) {
    const dt = (now - last) / 1000; last = now;
    let any = false;
    for (const v of SLIDER_VARS) {
      const s = state.sliders[v];
      if (!s || !s.animating) continue;
      any = true;
      const span = (s.max - s.min) || 1;
      s.value += s.dir * dt * (span / 4);
      if (s.value >= s.max) { s.value = s.max; s.dir = -1; }
      if (s.value <= s.min) { s.value = s.min; s.dir = 1; }
      const li = document.getElementById('slider-' + v);
      if (li) {
        const range = li.querySelector('.slider-range');
        if (range) range.value = s.value;
        const vs = li.querySelector('.slider-value');
        if (vs) vs.textContent = fmt(s.value);
      }
    }
    if (any) { scheduleRender(); requestAnimationFrame(tick); }
    else animRunning = false;
  }
  requestAnimationFrame(tick);
}
function stopAnim(v) { const s = state.sliders[v]; if (s) s.animating = false; }

// ---------- 画面操作（ズーム・パン・トレース） ----------

const wrap = document.getElementById('canvas-wrap');

function zoomAt(factor, cx, cy) {
  const v = state.view;
  const [X, Y] = grapher.toWorld(v, cx, cy);
  const nxmin = X + (v.xmin - X) * factor;
  const nxmax = X + (v.xmax - X) * factor;
  const nymin = Y + (v.ymin - Y) * factor;
  const nymax = Y + (v.ymax - Y) * factor;
  if (nxmax - nxmin > 1e-9 && nxmax - nxmin < 1e12) {
    v.xmin = nxmin; v.xmax = nxmax; v.ymin = nymin; v.ymax = nymax;
    scheduleRender(); saveSoon();
  }
}

wrap.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const factor = ev.deltaY > 0 ? 1.12 : 1 / 1.12;
  zoomAt(factor, ev.clientX - rect.left, ev.clientY - rect.top);
}, { passive: false });

let drag = null;
const pointers = new Map();

canvas.addEventListener('pointerdown', (ev) => {
  canvas.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
  const pt = hitPoint(ev.offsetX, ev.offsetY);
  drag = { x: ev.offsetX, y: ev.offsetY, moved: false, grab: pt };
});

canvas.addEventListener('pointermove', (ev) => {
  if (drag) {
    const dx = ev.offsetX - drag.x, dy = ev.offsetY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
    if (drag.grab && drag.moved) { dragPoint(drag.grab, ev.offsetX, ev.offsetY); }
    else if (drag.moved) {
      const v = state.view;
      const wx = (dx / grapher.cssW) * (v.xmax - v.xmin);
      const wy = (dy / grapher.cssH) * (v.ymax - v.ymin);
      v.xmin -= wx; v.xmax -= wx; v.ymin += wy; v.ymax += wy;
      drag.x = ev.offsetX; drag.y = ev.offsetY;
      scheduleRender();
    }
    hideTrace();
  } else {
    showTrace(ev.offsetX, ev.offsetY);
  }
});

canvas.addEventListener('pointerup', (ev) => {
  pointers.delete(ev.pointerId);
  drag = null;
});
canvas.addEventListener('pointercancel', () => { drag = null; pointers.clear(); });

function hitPoint(px, py) {
  for (const row of state.rows) {
    if (!row.visible) continue;
    const { result } = getItem(row);
    if (result.kind !== 'item' || result.item.kind !== 'point' || !result.item.free) continue;
    const it = result.item;
    const X = it.fx(it.env), Y = it.fy(it.env);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
    const [qx, qy] = grapher.toPx(state.view, X, Y);
    if (Math.hypot(qx - px, qy - py) < 12) return { row, item: it };
  }
  return null;
}

function dragPoint(grab, px, py) {
  const [X, Y] = grapher.toWorld(state.view, px, py);
  const v = state.view;
  const stepX = niceStepLocal((v.xmax - v.xmin) / 100);
  const stepY = niceStepLocal((v.ymax - v.ymin) / 100);
  const nx = Math.round(X / stepX) * stepX;
  const ny = Math.round(Y / stepY) * stepY;
  grab.row.text = `(${trimNum(nx)}, ${trimNum(ny)})`;
  compiled.delete(grab.row.id);
  const li = document.getElementById('row-' + grab.row.id);
  if (li) {
    li.querySelector('.expr-input').value = grab.row.text;
    refreshRowDisplay(grab.row, li);
  }
  scheduleRender(); saveSoon();
}

function trimNum(v) { return String(Math.round(v * 100) / 100); }
function niceStepLocal(raw) {
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
}

// トレース表示
const traceEl = document.createElement('div');
traceEl.className = 'trace-tip';
traceEl.style.display = 'none';
wrap.appendChild(traceEl);

function showTrace(px, py) {
  // 点を最優先
  for (const row of state.rows) {
    if (!row.visible) continue;
    const { result } = getItem(row);
    if (result.kind !== 'item' || result.item.kind !== 'point') continue;
    const it = result.item;
    const X = it.fx(it.env), Y = it.fy(it.env);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
    const [qx, qy] = grapher.toPx(state.view, X, Y);
    if (Math.hypot(qx - px, qy - py) < 12) {
      showTip(qx, qy, `(${trimNum(X)}, ${trimNum(Y)})`);
      return;
    }
  }
  for (const row of state.rows) {
    if (!row.visible) continue;
    const { result } = getItem(row);
    if (result.kind !== 'item' || result.item.kind !== 'explicit') continue;
    const it = result.item;
    const v = state.view;
    const X = v.xmin + (px / grapher.cssW) * (v.xmax - v.xmin);
    const Y = it.f(Object.assign({}, it.env, { x: X }));
    if (!Number.isFinite(Y)) continue;
    const [, qy] = grapher.toPx(state.view, X, Y);
    if (Math.abs(qy - py) < 10) {
      showTip(px, qy, `x=${trimNum(X)}  y=${trimNum(Y)}`);
      return;
    }
  }
  hideTrace();
}

function showTip(px, py, text) {
  traceEl.textContent = text;
  traceEl.style.display = 'block';
  traceEl.style.left = (px + 12) + 'px';
  traceEl.style.top = (py - 30) + 'px';
}
function hideTrace() { traceEl.style.display = 'none'; }

// ---------- ツールバー ----------

document.getElementById('btn-add').addEventListener('click', () => {
  const r = addRow('');
  const li = document.getElementById('row-' + r.id);
  if (li) li.querySelector('.expr-input').focus();
});
document.getElementById('btn-zoom-in').addEventListener('click', () => zoomAt(1 / 1.25, grapher.cssW / 2, grapher.cssH / 2));
document.getElementById('btn-zoom-out').addEventListener('click', () => zoomAt(1.25, grapher.cssW / 2, grapher.cssH / 2));
document.getElementById('btn-home').addEventListener('click', () => {
  state.view = { xmin: -10, xmax: 10, ymin: -6.5, ymax: 6.5 };
  scheduleRender(); saveSoon();
});
const angleBtn = document.getElementById('btn-angle');
angleBtn.addEventListener('click', () => {
  state.angleMode = state.angleMode === 'radian' ? 'degree' : 'radian';
  angleBtn.textContent = state.angleMode === 'radian' ? 'ラジアン' : '度数法';
  angleModeChanged(); saveSoon();
});

// ---------- 保存・復元 ----------

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}
function save() {
  try {
    const data = {
      rows: state.rows.map((r) => ({ text: r.text, color: r.color, visible: r.visible, width: r.width, dash: r.dash })),
      sliders: state.sliders,
      angleMode: state.angleMode,
      view: state.view,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch (e) { /* 保存できない環境では無視 */ }
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.rows)) return false;
    state.angleMode = data.angleMode === 'degree' ? 'degree' : 'radian';
    angleBtn.textContent = state.angleMode === 'radian' ? 'ラジアン' : '度数法';
    if (data.view && Number.isFinite(data.view.xmin)) state.view = data.view;
    for (const v of SLIDER_VARS) {
      if (data.sliders && data.sliders[v]) {
        state.sliders[v] = Object.assign(newSlider(v), data.sliders[v]);
        ensureSliderRow(v);
      }
    }
    for (const rd of data.rows) {
      const row = addRow(rd.text || '', rd);
      row.visible = rd.visible !== false;
      row.width = rd.width || 2.5;
      row.dash = Array.isArray(rd.dash) ? rd.dash : [];
      compiled.delete(row.id);
      const li = document.getElementById('row-' + row.id);
      if (li) {
        li.classList.toggle('row-hidden', !row.visible);
        li.querySelector('.vis-btn').textContent = row.visible ? '👁' : '⃠';
        refreshRowDisplay(row, li);
      }
    }
    return state.rows.length > 0;
  } catch (e) { return false; }
}

// ?add= で式を追加(チュートリアルから)
function handleAddParam() {
  const q = new URLSearchParams(location.search);
  const add = q.get('add');
  if (add) {
    for (const t of add.split('~')) {
      if (t.trim()) addRow(t.trim());
    }
    history.replaceState(null, '', location.pathname);
    return true;
  }
  return false;
}

// ---------- 起動 ----------

const hintToast = document.getElementById('hint-toast');
let hintTimer = null;
function showHintToast(text) {
  hintToast.textContent = text;
  hintToast.style.display = 'block';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { hintToast.style.display = 'none'; }, 5000);
}

const panelToggle = document.getElementById('panel-toggle');
panelToggle.addEventListener('click', () => {
  document.getElementById('panel').classList.toggle('open');
});

function resize() {
  const r = wrap.getBoundingClientRect();
  grapher.resize(r.width, r.height);
  scheduleRender();
}
window.addEventListener('resize', resize);

function init() {
  resize();
  const restored = load();
  if (!restored && !handleAddParam()) {
    addRow('y=x^2');
  } else {
    handleAddParam();
  }
  scheduleRender();
}

init();
