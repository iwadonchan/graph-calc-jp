// mamolii graph-calc-jp — グラフ描画エンジン
// 明示関数 y=f(x) / x=g(y)、陰関数 F(x,y)=0(マーチングスクエア法)、
// 不等式領域(ブロック塗り + 境界線)、点、グリッド・軸を描く。

'use strict';

// 補助: 見やすい目盛りの刻み (1, 2, 5) × 10^n
export function niceStep(range, targetCount) {
  const raw = range / Math.max(1, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step;
  if (norm < 1.5) step = 1; else if (norm < 3.5) step = 2; else if (norm < 7.5) step = 5; else step = 10;
  return step * mag;
}

function fmtTick(v, step) {
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  if (Math.abs(v) < step * 1e-6) return '0';
  return v.toFixed(Math.min(6, dec));
}

export class Grapher {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
  }

  resize(cssW, cssH) {
    this.cssW = cssW; this.cssH = cssH;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
  }

  toPx(view, X, Y) {
    const { xmin, xmax, ymin, ymax } = view;
    return [
      ((X - xmin) / (xmax - xmin)) * this.cssW,
      this.cssH - ((Y - ymin) / (ymax - ymin)) * this.cssH,
    ];
  }

  toWorld(view, px, py) {
    const { xmin, xmax, ymin, ymax } = view;
    return [
      xmin + (px / this.cssW) * (xmax - xmin),
      ymin + ((this.cssH - py) / this.cssH) * (ymax - ymin),
    ];
  }

  render(items, view, theme = 'light') {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    ctx.fillStyle = theme === 'dark' ? '#101418' : '#ffffff';
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    this.drawGrid(view, theme);
    for (const item of items) {
      if (item.visible === false) continue;
      try {
        switch (item.kind) {
          case 'explicit': this.drawExplicit(item, view); break;
          case 'explicitY': this.drawExplicitY(item, view); break;
          case 'implicit': this.drawImplicit(item.F, item, view); break;
          case 'inequality': this.drawInequality(item, view); break;
          case 'point': this.drawPoint(item, view); break;
          default: break;
        }
      } catch (e) { /* 1つの式の失敗で全体を落とさない */ }
    }
  }

  drawGrid(view, theme) {
    const ctx = this.ctx;
    const { xmin, xmax, ymin, ymax } = view;
    const axis = theme === 'dark' ? '#9aa4b2' : '#444';
    const grid = theme === 'dark' ? '#232a33' : '#e6e9ee';
    const label = theme === 'dark' ? '#aab4c0' : '#666';
    const stepX = niceStep(xmax - xmin, Math.max(4, this.cssW / 90));
    const stepY = niceStep(ymax - ymin, Math.max(4, this.cssH / 90));

    ctx.lineWidth = 1;
    ctx.strokeStyle = grid;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = label;

    const startX = Math.ceil(xmin / stepX) * stepX;
    for (let X = startX; X <= xmax; X += stepX) {
      const [px] = this.toPx(view, X, 0);
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, this.cssH); ctx.stroke();
    }
    const startY = Math.ceil(ymin / stepY) * stepY;
    for (let Y = startY; Y <= ymax; Y += stepY) {
      const [, py] = this.toPx(view, 0, Y);
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.cssW, py); ctx.stroke();
    }
    // 軸
    const yAxisPx = this.toPx(view, 0, 0)[0];
    const xAxisPy = this.toPx(view, 0, 0)[1];
    ctx.strokeStyle = axis;
    ctx.lineWidth = 1.4;
    // y軸(見えていれば)
    if (yAxisPx >= -1 && yAxisPx <= this.cssW + 1) {
      ctx.beginPath(); ctx.moveTo(yAxisPx, 0); ctx.lineTo(yAxisPx, this.cssH); ctx.stroke();
    }
    if (xAxisPy >= -1 && xAxisPy <= this.cssH + 1) {
      ctx.beginPath(); ctx.moveTo(0, xAxisPy); ctx.lineTo(this.cssW, xAxisPy); ctx.stroke();
    }
    // 目盛り数字
    ctx.fillStyle = label;
    const tickYPos = Math.min(Math.max(xAxisPy, 14), this.cssH - 6);
    for (let X = startX; X <= xmax; X += stepX) {
      if (Math.abs(X) < stepX * 1e-6) continue;
      const [px] = this.toPx(view, X, 0);
      ctx.fillText(fmtTick(X, stepX), px + 2, tickYPos - 4);
    }
    const tickXPos = Math.min(Math.max(yAxisPx, 4), this.cssW - 40);
    for (let Y = startY; Y <= ymax; Y += stepY) {
      if (Math.abs(Y) < stepY * 1e-6) continue;
      const [, py] = this.toPx(view, 0, Y);
      ctx.fillText(fmtTick(Y, stepY), tickXPos + 4, py - 3);
    }
  }

  setStroke(item) {
    const ctx = this.ctx;
    ctx.strokeStyle = item.color || '#c74440';
    ctx.lineWidth = item.width || 2.5;
    ctx.setLineDash(item.dash || []);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
  }

  // y = f(x) のプロット。不連続(漸近線)で線を切る
  drawExplicit(item, view) {
    const ctx = this.ctx;
    const { xmin, xmax } = view;
    this.setStroke(item);
    ctx.beginPath();
    let drawing = false;
    let prevPy = 0;
    const env = Object.assign({}, item.env);
    const step = 1; // 1pxごと
    for (let px = 0; px <= this.cssW; px += step) {
      const X = xmin + (px / this.cssW) * (xmax - xmin);
      env.x = X;
      const Y = item.f(env);
      if (!Number.isFinite(Y)) { drawing = false; continue; }
      const py = this.cssH - ((Y - view.ymin) / (view.ymax - view.ymin)) * this.cssH;
      if (!drawing) { ctx.moveTo(px, py); drawing = true; }
      else {
        const jump = Math.abs(py - prevPy);
        if (jump > this.cssH * 1.5) {
          // 中間点を評価して連続か判定(漸近線なら切る)
          const Xm = (X + this.prevXof(px - step, view)) / 2;
          env.x = Xm;
          const Ym = item.f(env);
          if (!Number.isFinite(Ym)) { ctx.moveTo(px, py); }
          else {
            const pym = this.cssH - ((Ym - view.ymin) / (view.ymax - view.ymin)) * this.cssH;
            if (Math.abs(pym - prevPy) > this.cssH) { ctx.moveTo(px, py); }
            else ctx.lineTo(px, py);
          }
        } else {
          ctx.lineTo(px, py);
        }
      }
      prevPy = py;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  prevXof(px, view) {
    const { xmin, xmax } = view;
    return xmin + (px / this.cssW) * (xmax - xmin);
  }

  // x = g(y)
  drawExplicitY(item, view) {
    const ctx = this.ctx;
    const { ymin, ymax } = view;
    this.setStroke(item);
    ctx.beginPath();
    let drawing = false;
    let prevPx = 0;
    const env = Object.assign({}, item.env);
    for (let py = 0; py <= this.cssH; py += 1) {
      const Y = ymin + ((this.cssH - py) / this.cssH) * (ymax - ymin);
      env.y = Y;
      const X = item.f(env);
      if (!Number.isFinite(X)) { drawing = false; continue; }
      const px = ((X - view.xmin) / (view.xmax - view.xmin)) * this.cssW;
      if (!drawing) { ctx.moveTo(px, py); drawing = true; }
      else if (Math.abs(px - prevPx) > this.cssW * 1.5) { ctx.moveTo(px, py); }
      else { ctx.lineTo(px, py); }
      prevPx = px;
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 陰関数 F(x,y)=0 をマーチングスクエア法で描く
  drawImplicit(F, item, view) {
    const ctx = this.ctx;
    const cellPx = 7;
    const nx = Math.max(8, Math.ceil(this.cssW / cellPx));
    const ny = Math.max(8, Math.ceil(this.cssH / cellPx));
    const { xmin, xmax, ymin, ymax } = view;
    const env = Object.assign({}, item.env);
    const V = new Float64Array((nx + 1) * (ny + 1));
    for (let j = 0; j <= ny; j++) {
      const Y = ymin + ((ny - j) / ny) * (ymax - ymin);
      env.y = Y;
      for (let i = 0; i <= nx; i++) {
        const X = xmin + (i / nx) * (xmax - xmin);
        env.x = X;
        const v = F(env);
        V[j * (nx + 1) + i] = Number.isFinite(v) ? v : NaN;
      }
    }
    this.setStroke(item);
    ctx.beginPath();
    const cw = this.cssW / nx, ch = this.cssH / ny;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v00 = V[j * (nx + 1) + i];         // 左上
        const v10 = V[j * (nx + 1) + i + 1];     // 右上
        const v01 = V[(j + 1) * (nx + 1) + i];   // 左下
        const v11 = V[(j + 1) * (nx + 1) + i + 1];
        if ([v00, v10, v01, v11].some((v) => !Number.isFinite(v))) continue;
        let idx = 0;
        if (v00 > 0) idx |= 8;
        if (v10 > 0) idx |= 4;
        if (v11 > 0) idx |= 2;
        if (v01 > 0) idx |= 1;
        if (idx === 0 || idx === 15) continue;
        const x0 = i * cw, y0 = j * ch;
        // 辺上の交点(線形補間)
        const top = () => [x0 + cw * (v00 / (v00 - v10)), y0];
        const bottom = () => [x0 + cw * (v01 / (v01 - v11)), y0 + ch];
        const left = () => [x0, y0 + ch * (v00 / (v00 - v01))];
        const right = () => [x0 + cw, y0 + ch * (v10 / (v10 - v11))];
        const seg = (a, b) => { ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); };
        switch (idx) {
          case 1: case 14: seg(left(), bottom()); break;
          case 2: case 13: seg(bottom(), right()); break;
          case 3: case 12: seg(left(), right()); break;
          case 4: case 11: seg(top(), right()); break;
          case 6: case 9: seg(top(), bottom()); break;
          case 7: case 8: seg(left(), top()); break;
          case 5: {
            const center = (v00 + v10 + v01 + v11) / 4;
            if (center > 0) { seg(left(), top()); seg(bottom(), right()); }
            else { seg(left(), bottom()); seg(top(), right()); }
            break;
          }
          case 10: {
            const center = (v00 + v10 + v01 + v11) / 4;
            if (center > 0) { seg(left(), bottom()); seg(top(), right()); }
            else { seg(left(), top()); seg(bottom(), right()); }
            break;
          }
        }
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 不等式: F op 0 の領域を塗る。厳密(<,>)は境界を破線に
  drawInequality(item, view) {
    const ctx = this.ctx;
    const block = 4;
    const cols = Math.ceil(this.cssW / block);
    const rows = Math.ceil(this.cssH / block);
    const env = Object.assign({}, item.env);
    ctx.fillStyle = item.color || '#c74440';
    ctx.globalAlpha = 0.28;
    for (let j = 0; j < rows; j++) {
      const py = j * block + block / 2;
      const Y = view.ymin + ((this.cssH - py) / this.cssH) * (view.ymax - view.ymin);
      env.y = Y;
      for (let i = 0; i < cols; i++) {
        const px = i * block + block / 2;
        const X = view.xmin + (px / this.cssW) * (view.xmax - view.xmin);
        env.x = X;
        const v = item.F(env);
        let ok = false;
        switch (item.op) {
          case '<': ok = v < 0; break;
          case '<=': ok = v <= 0; break;
          case '>': ok = v > 0; break;
          case '>=': ok = v >= 0; break;
        }
        if (ok) ctx.fillRect(i * block, j * block, block, block);
      }
    }
    ctx.globalAlpha = 1;
    // 境界線
    this.drawImplicit(item.F, { env: item.env, color: item.color, width: 1.5, dash: (item.op === '<' || item.op === '>') ? [6, 5] : [] }, view);
    ctx.setLineDash([]);
  }

  drawPoint(item, view) {
    const ctx = this.ctx;
    const env = Object.assign({}, item.env);
    const X = item.fx(env), Y = item.fy(env);
    if (!Number.isFinite(X) || !Number.isFinite(Y)) return;
    const [px, py] = this.toPx(view, X, Y);
    if (px < -20 || px > this.cssW + 20 || py < -20 || py > this.cssH + 20) return;
    ctx.beginPath();
    ctx.arc(px, py, 6, 0, Math.PI * 2);
    ctx.fillStyle = item.color || '#c74440';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }
}
