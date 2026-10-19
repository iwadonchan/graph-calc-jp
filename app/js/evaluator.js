// mamolii graph-calc-jp — 評価器
// AST を JS クロージャへコンパイルし、env {x,y,a,b} で高速評価する。
// 角度単位(radian/degree)は三角関数にのみ影響する。

'use strict';

const TAU = Math.PI * 2;

export function makeTrig(angleMode) {
  // angleMode: 'radian' | 'degree'
  const k = angleMode === 'degree' ? Math.PI / 180 : 1;
  const ik = angleMode === 'degree' ? 180 / Math.PI : 1;
  return {
    sin: (v) => Math.sin(v * k),
    cos: (v) => Math.cos(v * k),
    tan: (v) => Math.tan(v * k),
    arcsin: (v) => ik * Math.asin(v),
    arccos: (v) => ik * Math.acos(v),
    arctan: (v) => ik * Math.atan(v),
  };
}

export function compile(ast, angleMode = 'radian') {
  const T = makeTrig(angleMode);
  const FN = {
    sin: T.sin, cos: T.cos, tan: T.tan,
    arcsin: T.arcsin, arccos: T.arccos, arctan: T.arctan,
    asin: T.arcsin, acos: T.arccos, atan: T.arctan,
    log: (v) => (v <= 0 ? NaN : Math.log10(v)),
    log10: (v) => (v <= 0 ? NaN : Math.log10(v)),
    ln: (v) => (v <= 0 ? NaN : Math.log(v)),
    abs: Math.abs,
    sqrt: (v) => (v < 0 ? NaN : Math.sqrt(v)),
    cbrt: Math.cbrt,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    sign: Math.sign,
    mod: (a, b) => a - b * Math.floor(a / b),
    max: (...a) => Math.max(...a),
    min: (...a) => Math.min(...a),
  };

  function build(n) {
    switch (n.k) {
      case 'num': { const v = n.v; return () => v; }
      case 'const': {
        if (n.name === 'pi') return () => Math.PI;
        if (n.name === 'tau') return () => TAU;
        return () => Math.E;
      }
      case 'var': {
        const name = n.name;
        return (env) => env[name];
      }
      case 'neg': {
        const f = build(n.e);
        return (env) => -f(env);
      }
      case 'abs': {
        const f = build(n.e);
        return (env) => Math.abs(f(env));
      }
      case 'deriv': {
        const f = build(n.e);
        return (env) => {
          const h = 1e-5 * Math.max(1, Math.abs(env.x || 0));
          const e1 = Object.assign({}, env, { x: env.x + h });
          const e2 = Object.assign({}, env, { x: env.x - h });
          return (f(e1) - f(e2)) / (2 * h);
        };
      }
      case 'bin': {
        const l = build(n.l), r = build(n.r);
        switch (n.op) {
          case '+': return (env) => l(env) + r(env);
          case '-': return (env) => l(env) - r(env);
          case '*': return (env) => l(env) * r(env);
          case '/': return (env) => l(env) / r(env);
          case '^': return (env) => Math.pow(l(env), r(env));
          default: throw new Error('unknown op ' + n.op);
        }
      }
      case 'call': {
        const args = n.args.map(build);
        const fn = FN[n.name];
        if (!fn) throw new Error('unknown func ' + n.name);
        if (args.length === 1) { const a0 = args[0]; return (env) => fn(a0(env)); }
        return (env) => fn(...args.map((a) => a(env)));
      }
      case 'point': {
        // 点は評価コンテキストでは通常使わない(x,yの組として別扱い)
        const fx = build(n.x), fy = build(n.y);
        return (env) => [fx(env), fy(env)];
      }
      case 'rel': {
        // 単体では真偽。グラフ処理は grapher 側で l/r を別々に扱う
        const l = build(n.l), r = build(n.r);
        return (env) => l(env) - r(env);
      }
      default:
        throw new Error('unknown node ' + n.k);
    }
  }
  return build(ast);
}

// rel の左右を別々にコンパイルする
export function compileSides(relAst, angleMode = 'radian') {
  if (relAst.k !== 'rel') return null;
  return {
    l: compile(relAst.l, angleMode),
    r: compile(relAst.r, angleMode),
  };
}
