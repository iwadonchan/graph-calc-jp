// mamolii graph-calc-jp — 式の種類判定
// 入力式を「明示関数 / x=g(y) / 陰関数 / 不等式 / 点 / スライダー定義 / その他」に分類し、
// 描画アイテム(コンパイル済み関数を含む)を返す。UIに依存しない純関数群。

'use strict';

import { compile, compileSides } from './evaluator.js';
import { collectVars } from './parser.js';

export const SLIDER_VARS = ['a', 'b'];

// ctx: {
//   angleMode: 'radian'|'degree',
//   sliderValue: (v) => number|undefined,   // a/b の現在値
//   ensureSlider: (v) => void,              // 未定義スライダーの自動作成
// }
export function classify(ast, ctx) {
  const vlist = collectVars(ast);
  for (const v of SLIDER_VARS) {
    if (vlist.has(v)) ctx.ensureSlider(v);
  }
  const E = sliderEnv(ctx);

  if (ast.k === 'point') {
    const fx = compile(ast.x, ctx.angleMode), fy = compile(ast.y, ctx.angleMode);
    const free = ast.x.k === 'num' && ast.y.k === 'num';
    return { kind: 'item', item: { kind: 'point', fx, fy, env: E, free, ast } };
  }

  if (ast.k === 'rel') {
    const lOnly = collectVars(ast.l), rOnly = collectVars(ast.r);
    const hasLX = lOnly.has('x'), hasLY = lOnly.has('y');
    const hasRX = rOnly.has('x'), hasRY = rOnly.has('y');

    if (ast.op === '=') {
      // スライダー定義: a=2.5 など(左辺が単独の a/b、右辺は a/b と x/y を含まない定数式)
      if (ast.l.k === 'var' && SLIDER_VARS.includes(ast.l.name)
          && !rOnly.has('x') && !rOnly.has('y') && !rOnly.has(ast.l.name)) {
        try {
          const f = compile(ast.r, ctx.angleMode);
          const v = f({});
          if (Number.isFinite(v)) ctx.setSliderValue(ast.l.name, v);
        } catch (e) { /* 定数でないときは値を変えない */ }
        return { kind: 'sliderdef', v: ast.l.name };
      }
      if (ast.l.k === 'var' && ast.l.name === 'y' && !hasRY) {
        return item({ kind: 'explicit', f: compile(ast.r, ctx.angleMode), ast }, E);
      }
      if (ast.l.k === 'var' && ast.l.name === 'x' && !hasRX) {
        return item({ kind: 'explicitY', f: compile(ast.r, ctx.angleMode), ast }, E);
      }
      if (ast.r.k === 'var' && ast.r.name === 'y' && !hasLY) {
        return item({ kind: 'explicit', f: compile(ast.l, ctx.angleMode), ast }, E);
      }
      if (ast.r.k === 'var' && ast.r.name === 'x' && !hasLX) {
        return item({ kind: 'explicitY', f: compile(ast.l, ctx.angleMode), ast }, E);
      }
      const sides = compileSides(ast, ctx.angleMode);
      return item({ kind: 'implicit', F: (e) => sides.l(e) - sides.r(e), ast }, E);
    }

    const sides = compileSides(ast, ctx.angleMode);
    return item({ kind: 'inequality', F: (e) => sides.l(e) - sides.r(e), op: ast.op, ast }, E);
  }

  if (vlist.has('x')) return item({ kind: 'explicit', f: compile(ast, ctx.angleMode), ast }, E);
  if (vlist.has('y')) return item({ kind: 'explicitY', f: compile(ast, ctx.angleMode), ast }, E);
  if (vlist.has('a') || vlist.has('b')) {
    const vs = [...vlist].filter((v) => SLIDER_VARS.includes(v));
    return { kind: 'needsvar', message: `${vs.join(', ')} の値を決めてください。例: ${vs[0]}=1` };
  }
  return { kind: 'constant', value: compile(ast, ctx.angleMode)({}) };
}

function item(partial, E) {
  return { kind: 'item', item: Object.assign({ env: E }, partial) };
}

export function sliderEnv(ctx) {
  return {
    a: ctx.sliderValue('a'),
    b: ctx.sliderValue('b'),
  };
}
