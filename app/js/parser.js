// mamolii graph-calc-jp — 数式パーサ
// 入力文字列 → AST。対応: 四則/べき乗/暗黙の乗算/括弧/絶対値|..|/
// 関数(sin cos tan log ln sqrt abs floor ceil round max min)/定数(pi, e)/
// 変数(x, y, a, b)/比較(= < > <= >= ≦ ≧)/導関数 d/dx(...)
// 変数は x, y とスライダー用の a, b のみ。他の文字は別名表示(エイリアス)で扱う。

'use strict';

// ---------- トークン ----------

const FUNCS = new Set([
  'sin', 'cos', 'tan',
  'arcsin', 'arccos', 'arctan',
  'asin', 'acos', 'atan',
  'log', 'ln', 'log10',
  'abs', 'sqrt', 'cbrt',
  'floor', 'ceil', 'round',
  'max', 'min', 'mod', 'sign',
]);

const CONSTS = new Set(['pi', 'e', 'tau']);

// 複数文字で来うる単文字変数の並びを分解するための文字集合
const VAR_LETTERS = new Set(['x', 'y', 'a', 'b']);

const SYMBOL_MAP = {
  '≤': '<=', '≦': '<=', '≥': '>=', '≧': '>=',
  '×': '*', '·': '*', '÷': '/', '−': '-',
  '²': '^2', '³': '^3', '４': '4', '　': ' ',
};

function isDigit(ch) { return ch >= '0' && ch <= '9'; }
function isAlpha(ch) { return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'); }

export function tokenize(src) {
  const toks = [];
  let i = 0;
  const s = String(src);
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t' || ch === '\n') { i++; continue; }
    if (isDigit(ch) || (ch === '.' && isDigit(s[i + 1] || ''))) {
      let j = i;
      while (j < s.length && (isDigit(s[j]) || s[j] === '.')) j++;
      toks.push({ type: 'num', value: parseFloat(s.slice(i, j)), raw: s.slice(i, j), pos: i });
      i = j; continue;
    }
    if (ch === 'π') { toks.push({ type: 'const', name: 'pi', raw: 'π', pos: i }); i++; continue; }
    if (ch === 'θ') { toks.push({ type: 'var', name: 'theta', raw: 'θ', pos: i }); i++; continue; }
    if (ch === '√') { toks.push({ type: 'func', name: 'sqrt', raw: '√', pos: i }); i++; continue; }
    if (ch in SYMBOL_MAP) {
      const rep = SYMBOL_MAP[ch];
      if (rep === '<=' || rep === '>=' || rep === '==' ) {
        toks.push({ type: 'op', value: rep, pos: i });
      } else {
        for (const r of rep) {
          if (r === ' ') { /* 空白に置換 */ }
          else if (isDigit(r)) toks.push({ type: 'num', value: Number(r), raw: r, pos: i });
          else toks.push({ type: 'op', value: r, pos: i });
        }
      }
      i++; continue;
    }
    if (isAlpha(ch)) {
      // まず既知の関数名・定数名を最長一致で試す
      let matched = null;
      for (let len = 8; len >= 2; len--) {
        const sub = s.slice(i, i + len);
        const lower = sub.toLowerCase();
        if (FUNCS.has(lower)) { matched = { type: 'func', name: lower === 'log10' ? 'log' : lower, raw: sub, pos: i }; break; }
        if (CONSTS.has(lower)) { matched = { type: 'const', name: lower, raw: sub, pos: i }; break; }
      }
      if (matched) { toks.push(matched); i += matched.raw.length; continue; }
      // 単文字ずつ: 変数または1文字関数名の余地なし(関数は2文字以上)
      const c = ch.toLowerCase();
      if (VAR_LETTERS.has(c)) { toks.push({ type: 'var', name: c, raw: ch, pos: i }); i++; continue; }
      if (CONSTS.has(c)) { toks.push({ type: 'const', name: c, raw: ch, pos: i }); i++; continue; }
      if (c === 'd') {
        // d/dx 導関数の検出はパーサ側で行うため 'd' はそのまま出す
        toks.push({ type: 'var', name: 'd_reserved', raw: ch, pos: i }); i++; continue;
      }
      throw new ParseError(`使えない文字「${ch}」です。変数は x, y, a, b だけが使えます。`, i);
    }
    if ('+-*/^(),<>!=|'.includes(ch)) {
      if ((ch === '<' || ch === '>') && s[i + 1] === '=') {
        toks.push({ type: 'op', value: ch + '=', pos: i }); i += 2; continue;
      }
      if (ch === '=' && s[i + 1] === '=') { toks.push({ type: 'op', value: '=', pos: i }); i += 2; continue; }
      toks.push({ type: 'op', value: ch, pos: i }); i++; continue;
    }
    throw new ParseError(`読み取れない文字「${ch}」があります。`, i);
  }
  return toks;
}

export class ParseError extends Error {
  constructor(message, pos) { super(message); this.pos = pos; }
}

// ---------- AST ----------
// ノード: {k:'num',v} {k:'const',name} {k:'var',name} {k:'bin',op,l,r}
// {k:'neg',e} {k:'call',name,args} {k:'abs',e} {k:'deriv',e} {k:'rel',op,l,r}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  let absDepth = 0; // |...| の内側では閉じ | を暗黙乗算の開始記号にしない
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expectOp = (v) => {
    const t = peek();
    if (!t || t.type !== 'op' || t.value !== v) throw new ParseError(`「${v}」が必要です。`, t ? t.pos : src.length);
    return next();
  };

  function parseExpr() { return parseRel(); }

  function parseRel() {
    const l = parseSum();
    const t = peek();
    if (t && t.type === 'op' && ['=', '<', '>', '<=', '>='].includes(t.value)) {
      next();
      const r = parseSum();
      return { k: 'rel', op: t.value, l, r };
    }
    return l;
  }

  function parseSum() {
    let l = parseProduct();
    for (;;) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        next();
        l = { k: 'bin', op: t.value, l, r: parseProduct() };
      } else return l;
    }
  }

  function startsAtom(t) {
    if (!t) return false;
    if (t.type === 'num' || t.type === 'var' || t.type === 'const' || t.type === 'func') return true;
    if (t.type === 'op' && t.value === '(') return true;
    if (t.type === 'op' && t.value === '|' && absDepth === 0) return true;
    return false;
  }

  function parseProduct() {
    let l = parseUnary();
    for (;;) {
      const t = peek();
      if (t && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        next();
        l = { k: 'bin', op: t.value, l, r: parseUnary() };
      } else if (startsAtom(t)) {
        // 暗黙の乗算: 2x, 3sin(x), (x+1)(x-2), ax, x|y| など
        // ただし「2 3」のような数の連続は 2·3 と解釈せずエラーにしない(暗黙乗算として扱う)
        l = { k: 'bin', op: '*', l, r: parsePostfix() };
      } else return l;
    }
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === 'op' && t.value === '-') { next(); return { k: 'neg', e: parseUnary() }; }
    if (t && t.type === 'op' && t.value === '+') { next(); return parseUnary(); }
    return parsePostfix();
  }

  function parsePostfix() {
    const base = parsePower();
    // 階乗などの後置演算は未対応(範囲外)
    return base;
  }

  function parsePower() {
    const base = parseAtom();
    const t = peek();
    if (t && t.type === 'op' && t.value === '^') {
      next();
      const exp = parseUnary(); // 右結合 / 2^-3 を許す
      return { k: 'bin', op: '^', l: base, r: exp };
    }
    return base;
  }

  function parseAtom() {
    const t = next();
    if (!t) throw new ParseError('式が途中で終わっています。', src.length);
    if (t.type === 'num') return { k: 'num', v: t.value };
    if (t.type === 'const') return { k: 'const', name: t.name };
    if (t.type === 'var') {
      if (t.name === 'd_reserved') {
        // d/dx(...) の形: 'd' '/' の後に 'dx' または 'd' 'x' が並んだら導関数
        const sl = peek();
        if (sl && sl.type === 'op' && sl.value === '/') {
          const a1 = toks[p + 1], a2 = toks[p + 2];
          if (a1 && a1.type === 'var' && a1.name === 'x') {
            next(); next(); // '/' と 'x'
            const arg = parseAtom();
            return { k: 'deriv', e: arg };
          }
          if (a1 && a1.type === 'var' && a1.name === 'd_reserved' && a2 && a2.type === 'var' && a2.name === 'x') {
            next(); next(); next(); // '/' と 'd' と 'x'
            const arg = parseAtom();
            return { k: 'deriv', e: arg };
          }
        }
        throw new ParseError('「d」は d/dx(...) の形でのみ使えます。', t.pos);
      }
      return { k: 'var', name: t.name };
    }
    if (t.type === 'func') {
      const args = [];
      // √2 のような括弧なし適用を許す(√ と sqrt のみ)
      if ((t.name === 'sqrt') && !(peek() && peek().type === 'op' && peek().value === '(')) {
        return { k: 'call', name: 'sqrt', args: [parsePostfix()] };
      }
      expectOp('(');
      if (!(peek() && peek().type === 'op' && peek().value === ')')) {
        args.push(parseSum());
        while (peek() && peek().type === 'op' && peek().value === ',') { next(); args.push(parseSum()); }
      }
      expectOp(')');
      if (t.name === 'sqrt') {
        // sqrt は引数1個。2個目が来たらエラー
        if (args.length !== 1) throw new ParseError('sqrt( ) の引数は1個です。', t.pos);
      }
      return { k: 'call', name: t.name, args };
    }
    if (t.type === 'op' && t.value === '(') {
      const inner = parseSum();
      // 点 (a, b) の検出
      if (peek() && peek().type === 'op' && peek().value === ',') {
        next();
        const second = parseSum();
        expectOp(')');
        return { k: 'point', x: inner, y: second };
      }
      expectOp(')');
      return inner;
    }
    if (t.type === 'op' && t.value === '|') {
      absDepth++;
      const inner = parseSum();
      absDepth--;
      expectOp('|');
      return { k: 'abs', e: inner };
    }
    throw new ParseError(`ここに「${t.raw || t.value}」は置けません。`, t.pos);
  }

  const ast = parseExpr();
  if (p < toks.length) {
    const t = toks[p];
    throw new ParseError(`「${t.raw || t.value}」の使い方を確認してください。`, t.pos || 0);
  }
  return ast;
}

// ---------- 集合ユーティリティ ----------

export function collectVars(ast, set = new Set()) {
  if (!ast || typeof ast !== 'object') return set;
  if (ast.k === 'var') set.add(ast.name);
  if (ast.k === 'point') { collectVars(ast.x, set); collectVars(ast.y, set); }
  if (ast.k === 'rel') { collectVars(ast.l, set); collectVars(ast.r, set); }
  if (ast.k === 'bin') { collectVars(ast.l, set); collectVars(ast.r, set); }
  if (ast.k === 'neg' || ast.k === 'abs' || ast.k === 'deriv') collectVars(ast.e, set);
  if (ast.k === 'call') ast.args.forEach((a) => collectVars(a, set));
  return set;
}

// ---------- 整形出力（ pretty print ） ----------
// aliasMap: { a: '表示名', b: '表示名' } — スライダー変数の別名表示

const PRETTY_FUNC_JP = { sqrt: '√', abs: '|…|' };

function fmtNum(v) {
  if (Number.isInteger(v)) return String(v);
  const s = String(Math.round(v * 1e6) / 1e6);
  return s;
}

function prec(node) {
  switch (node.k) {
    case 'rel': return 0;
    case 'bin':
      if (node.op === '+' || node.op === '-') return 1;
      if (node.op === '*' || node.op === '/') return 2;
      if (node.op === '^') return 3;
      return 2;
    case 'neg': return 1;
    default: return 4;
  }
}

function wrap(node, min, s) { return prec(node) < min ? `(${s})` : s; }

export function pretty(ast, aliasMap = {}) {
  function name(n) { return (aliasMap && aliasMap[n]) ? aliasMap[n] : n; }
  switch (ast.k) {
    case 'num': return fmtNum(ast.v);
    case 'const': return ast.name === 'pi' ? 'π' : ast.name;
    case 'var': return name(ast.name);
    case 'neg': return '−' + wrap(ast.e, 3, pretty(ast.e, aliasMap));
    case 'abs': return '|' + pretty(ast.e, aliasMap) + '|';
    case 'deriv': return 'd/dx ' + wrap(ast.e, 3, pretty(ast.e, aliasMap));
    case 'point': return `(${pretty(ast.x, aliasMap)}, ${pretty(ast.y, aliasMap)})`;
    case 'rel': {
      const opMap = { '<=': '≤', '>=': '≥', '=': '=', '<': '<', '>': '>' };
      return `${pretty(ast.l, aliasMap)} ${opMap[ast.op]} ${pretty(ast.r, aliasMap)}`;
    }
    case 'call': {
      const a = ast.args.map((x) => pretty(x, aliasMap));
      if (ast.name === 'sqrt') return `√(${a[0]})`;
      return `${ast.name}(${a.join(', ')})`;
    }
    case 'bin': {
      const l = pretty(ast.l, aliasMap), r = pretty(ast.r, aliasMap);
      switch (ast.op) {
        case '+': return `${wrap(ast.l, 1, l)} + ${wrap(ast.r, 1, r)}`;
        case '-': return `${wrap(ast.l, 1, l)} − ${wrap(ast.r, 2, r)}`;
        case '*': {
          // 数×変数などは記号を省略して自然に
          const ls = wrap(ast.l, 2, l), rs = wrap(ast.r, 3, r);
          const glue = (ast.r.k === 'num' && ast.l.k === 'num') ? '·' : '';
          return `${ls}${glue}${rs}`;
        }
        case '/': return `${wrap(ast.l, 2, l)} / ${wrap(ast.r, 3, r)}`;
        case '^': return `${wrap(ast.l, 4, l)}^${wrap(ast.r, 4, r)}`;
        default: return `${wrap(ast.l, 2, l)} ${ast.op} ${wrap(ast.r, 2, r)}`;
      }
    }
    default: return '?';
  }
}
