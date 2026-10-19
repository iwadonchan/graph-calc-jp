// パーサ・評価器の単体テスト
// 実行: node tests/test-parser.mjs

import assert from 'node:assert/strict';
import { parse, ParseError, collectVars, pretty } from '../app/js/parser.js';
import { compile, compileSides } from '../app/js/evaluator.js';

let pass = 0, fail = 0;
const failures = [];

function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, error: String(e) }); }
}

function evalAt(src, env, angleMode = 'radian') {
  return compile(parse(src), angleMode)(env);
}

// --- 基本演算 ---
test('数値と四則の優先順位', () => {
  assert.equal(evalAt('2+3*4', {}), 14);
  assert.equal(evalAt('10/4', {}), 2.5);
  assert.equal(evalAt('2-3-4', {}), -5);
  assert.equal(evalAt('2^3^2', {}), 512); // 右結合
  assert.equal(evalAt('-2^2', {}), -4);   // 累乗が先
});

test('暗黙の乗算', () => {
  assert.equal(evalAt('2x', { x: 3 }), 6);
  assert.equal(evalAt('3sin(x)', { x: Math.PI / 2 }), 3);
  assert.equal(evalAt('(x+1)(x-2)', { x: 2 }), 0);
  assert.equal(evalAt('ax', { a: 2, x: 3 }), 6);
  assert.equal(evalAt('ab', { a: 3, b: 4 }), 12);
  assert.equal(evalAt('2x^2', { x: 3 }), 18); // 2·(x²)
  assert.equal(evalAt('x^2y', { x: 3, y: 5 }), 45);
});

test('記号定数', () => {
  assert.equal(evalAt('pi', {}), Math.PI);
  assert.equal(evalAt('π', {}), Math.PI);
  assert.ok(Math.abs(evalAt('e', {}) - Math.E) < 1e-12);
});

test('関数', () => {
  assert.equal(evalAt('sqrt(9)', {}), 3);
  assert.ok(Math.abs(evalAt('√2', {}) - Math.SQRT2) < 1e-12);
  assert.equal(evalAt('abs(-5)', {}), 5);
  assert.equal(evalAt('|x|', { x: -3 }), 3);
  assert.equal(evalAt('|x|+|y|', { x: -3, y: 4 }), 7);
  assert.equal(evalAt('log(100)', {}), 2);
  assert.equal(evalAt('ln(e)', {}), 1);
  assert.ok(Math.abs(evalAt('floor(2.7)', {}) - 2) < 1e-12);
  assert.equal(evalAt('max(3,7)', {}), 7);
  assert.equal(evalAt('min(3,7)', {}), 3);
});

test('三角関数(ラジアン・度数法)', () => {
  assert.ok(Math.abs(evalAt('sin(x)', { x: Math.PI / 2 }) - 1) < 1e-12);
  assert.ok(Math.abs(evalAt('cos(0)', {}) - 1) < 1e-12);
  assert.ok(Math.abs(evalAt('tan(x)', { x: Math.PI / 4 }) - 1) < 1e-12);
  assert.ok(Math.abs(evalAt('sin(30)', {}, 'degree') - 0.5) < 1e-12);
  assert.ok(Math.abs(evalAt('arcsin(1)', {}) - Math.PI / 2) < 1e-12);
});

test('導関数 d/dx', () => {
  const d = compile(parse('d/dx(x^2)'));
  assert.ok(Math.abs(d({ x: 3 }) - 6) < 1e-4);
  const d2 = compile(parse('d/dx(sin(x))'));
  assert.ok(Math.abs(d2({ x: 0 }) - 1) < 1e-4);
});

test('不等式・関係の解析', () => {
  const rel1 = parse('y>x^2');
  assert.equal(rel1.k, 'rel');
  assert.equal(rel1.op, '>');
  const rel2 = parse('x^2+y^2<=25');
  assert.equal(rel2.op, '<=');
  const rel3 = parse('y ≦ 2x+1');
  assert.equal(rel3.op, '<=');
  const sides = compileSides(parse('x^2+y^2=25'));
  assert.ok(Math.abs((sides.l({ x: 3, y: 4 }) - sides.r({ x: 3, y: 4 }))) < 1e-12);
  assert.ok(Math.abs((sides.l({ x: 0, y: 0 }) - sides.r({ x: 0, y: 0 })) + 25) < 1e-12);
});

test('点の解析', () => {
  const p = parse('(1,2)');
  assert.equal(p.k, 'point');
  const p2 = parse('(a, a^2)');
  assert.equal(p2.k, 'point');
});

test('スライダー定義の解析(a=2.5)', () => {
  const s = parse('a=2.5');
  assert.equal(s.k, 'rel');
  assert.equal(s.op, '=');
  assert.equal(s.l.k, 'var');
  assert.equal(s.l.name, 'a');
  assert.equal(evalAt('2.5', {}), 2.5);
});

test('全角・unicode記号', () => {
  assert.equal(evalAt('x²+1', { x: 2 }), 5);
  assert.equal(evalAt('2×x', { x: 5 }), 10);
  assert.equal(evalAt('x³', { x: 2 }), 8);
});

test('変数の収集', () => {
  const v = collectVars(parse('a x + b'));
  assert.deepEqual([...v].sort(), ['a', 'b', 'x']);
});

test('整形出力に別名が反映される', () => {
  const s = pretty(parse('y=a x^2+b'), { a: 'k', b: 'm' });
  assert.ok(s.includes('k'), '別名 a→k が反映: ' + s);
  assert.ok(s.includes('m'), '別名 b→m が反映: ' + s);
  assert.ok(!/(^|[^a-z])a([^a-z]|$)/.test(s), '元の a が残っていない: ' + s);
});

// --- エラー系 ---
test('使えない文字は日本語エラー', () => {
  assert.throws(() => parse('y=z'), (e) => e instanceof ParseError && /x, y, a, b/.test(e.message));
  assert.throws(() => parse('sin'), ParseError);
  assert.throws(() => parse('d'), ParseError);
  assert.throws(() => parse('y='), ParseError);
  assert.throws(() => parse('(1,2'), ParseError);
});

console.log(`\n結果: ${pass} 成功 / ${fail} 失敗`);
if (fail > 0) {
  for (const f of failures) console.log(`- ${f.name}: ${f.error}`);
  process.exit(1);
}
