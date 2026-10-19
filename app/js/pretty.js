// mamolii graph-calc-jp — 数式レンダラ(DOM)
// AST から HTML 要素を組み立てる。分数は縦組み、べき乗は上付き、√ は上線。
// aliasMap {a:'表示名', b:'表示名'} があるとき、スライダー変数を別名で色付き表示する。

'use strict';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function fmtNum(v) {
  if (Number.isInteger(v)) return String(v);
  return String(Math.round(v * 1e6) / 1e6);
}

export function renderMath(ast, aliasMap = {}, varColors = {}) {
  return node(ast, aliasMap, varColors, false);
}

function varSpan(name, aliasMap, varColors) {
  const hasAlias = aliasMap && aliasMap[name];
  const s = el('span', 'mvar' + (hasAlias ? ' mvar-alias' : ''), hasAlias ? aliasMap[name] : name);
  const color = varColors && varColors[name];
  if (color) s.style.color = color;
  if (hasAlias) s.title = `内部変数 ${name} の別名表示`;
  return s;
}

function needsParens(child, parentOp, isRight) {
  const cp = prec(child);
  const pp = precOp(parentOp);
  if (cp > pp) return false;
  if (cp === pp) {
    if ((parentOp === '+' || parentOp === '-') && !isRight) return false;
    if (parentOp === '^') return true;
    return isRight && (parentOp === '-' || parentOp === '/');
  }
  return true;
}

function precOp(op) { return op === '+' || op === '-' ? 1 : op === '*' ? 2 : op === '/' ? 2 : 3; }
function prec(n) {
  switch (n.k) {
    case 'bin': return precOp(n.op);
    case 'neg': return 1;
    case 'rel': return 0;
    default: return 9;
  }
}

function node(n, aliasMap, varColors, atom) {
  switch (n.k) {
    case 'num': return el('span', 'mnum', fmtNum(n.v));
    case 'const': return el('span', 'mconst', n.name === 'pi' ? 'π' : n.name === 'tau' ? 'τ' : 'e');
    case 'var': {
      if (n.name === 'theta') return el('span', 'mvar', 'θ');
      return varSpan(n.name, aliasMap, varColors);
    }
    case 'neg': {
      const w = el('span', 'mgroup');
      w.append(el('span', 'mop', '−'));
      w.append(node(n.e, aliasMap, varColors, needsParens(n.e, '*', false) && n.e.k === 'bin'));
      return w;
    }
    case 'abs': {
      const w = el('span', 'mabs');
      w.append(el('span', 'mbar', '|'));
      w.append(node(n.e, aliasMap, varColors, false));
      w.append(el('span', 'mbar', '|'));
      return w;
    }
    case 'deriv': {
      const w = el('span', 'mderiv');
      const frac = el('span', 'mfrac');
      const num = el('span', 'mnum-part', 'd');
      const den = el('span', 'mden-part', 'd');
      den.append(el('span', 'mvar', 'x'));
      frac.append(num, den);
      w.append(frac);
      w.append(node(n.e, aliasMap, varColors, n.e.k === 'bin' && n.e.op !== '^' ? false : true));
      return w;
    }
    case 'point': {
      const w = el('span', 'mgroup');
      w.append(el('span', 'mparen', '('));
      w.append(node(n.x, aliasMap, varColors, false));
      w.append(el('span', 'mop', ', '));
      w.append(node(n.y, aliasMap, varColors, false));
      w.append(el('span', 'mparen', ')'));
      return w;
    }
    case 'rel': {
      const w = el('span', 'mgroup');
      const opMap = { '<=': '≤', '>=': '≥', '=': '=', '<': '<', '>': '>' };
      w.append(node(n.l, aliasMap, varColors, false));
      w.append(el('span', 'mop', ` ${opMap[n.op]} `));
      w.append(node(n.r, aliasMap, varColors, false));
      return w;
    }
    case 'call': {
      const w = el('span', 'mcall');
      if (n.name === 'sqrt') {
        w.append(el('span', 'mradical', '√'));
        const body = el('span', 'msqrt-body');
        body.append(node(n.args[0], aliasMap, varColors, false));
        w.append(body);
        return w;
      }
      const names = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', log10: 'log' };
      w.append(el('span', 'mfname', names[n.name] || n.name));
      w.append(el('span', 'mparen', '('));
      n.args.forEach((a, i) => {
        if (i > 0) w.append(el('span', 'mop', ', '));
        w.append(node(a, aliasMap, varColors, false));
      });
      w.append(el('span', 'mparen', ')'));
      return w;
    }
    case 'bin': {
      if (n.op === '/') {
        const frac = el('span', 'mfrac');
        const num = el('span', 'mnum-part');
        const den = el('span', 'mden-part');
        num.append(node(n.l, aliasMap, varColors, false));
        den.append(node(n.r, aliasMap, varColors, false));
        frac.append(num, den);
        const w = el('span', atom ? 'mgroup minline' : 'mgroup');
        w.append(frac);
        return w;
      }
      if (n.op === '^') {
        const w = el('span', 'mgroup');
        const baseNeeds = n.l.k === 'num' ? false : prec(n.l) < 9 && n.l.k !== 'var' && n.l.k !== 'num' && n.l.k !== 'const' && n.l.k !== 'call' && n.l.k !== 'point';
        if (n.l.k === 'bin' || n.l.k === 'neg') {
          const p = el('span', 'mparen', '(');
          const p2 = el('span', 'mparen', ')');
          w.append(p, node(n.l, aliasMap, varColors, false), p2);
        } else {
          w.append(node(n.l, aliasMap, varColors, true));
        }
        void baseNeeds;
        const sup = el('sup', 'msup');
        sup.append(node(n.r, aliasMap, varColors, true));
        w.append(sup);
        return w;
      }
      const w = el('span', 'mgroup');
      const opSym = n.op === '*' ? mulSym(n.l, n.r) : ` ${n.op} `;
      w.append(node(n.l, aliasMap, varColors, false));
      if (opSym) w.append(el('span', 'mop', opSym));
      w.append(node(n.r, aliasMap, varColors, false));
      return w;
    }
    default: return el('span', 'merr', '?');
  }
}

function mulSym(l, r) {
  // 2·3 など数×数は点、それ以外は省略
  if (l.k === 'num' && r.k === 'num') return '·';
  if (r.k === 'num') return '';
  if (l.k === 'num' || l.k === 'var' || l.k === 'const') return '';
  return '';
}
