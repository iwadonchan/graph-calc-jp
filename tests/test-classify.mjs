// 式分類(classify)の単体テスト
// 実行: node tests/test-classify.mjs

import assert from 'node:assert/strict';
import { parse } from '../app/js/parser.js';
import { classify } from '../app/js/classify.js';

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; failures.push({ name, error: String(e) }); }
}

function makeCtx(sliderValues = {}) {
  const ctx = {
    angleMode: 'radian',
    sliderValue: (v) => sliderValues[v],
    ensureSlider: (v) => { if (!(v in sliderValues)) sliderValues[v] = 1; },
    setSliderValue: (v, val) => { sliderValues[v] = val; },
  };
  return ctx;
}

function kindOf(src, sliderValues) {
  const r = classify(parse(src), makeCtx(sliderValues));
  return r;
}

test('y=f(x) は explicit', () => {
  const r = kindOf('y=x^2');
  assert.equal(r.kind, 'item');
  assert.equal(r.item.kind, 'explicit');
  assert.ok(Math.abs(r.item.f({ x: 3 }) - 9) < 1e-12);
});

test('f(x)=y の逆順も explicit', () => {
  const r = kindOf('x^2=y');
  assert.equal(r.item.kind, 'explicit');
});

test('x=g(y) は explicitY', () => {
  const r = kindOf('x=2y+1');
  assert.equal(r.item.kind, 'explicitY');
  assert.ok(Math.abs(r.item.f({ y: 2 }) - 5) < 1e-12);
});

test('円は implicit', () => {
  const r = kindOf('x^2+y^2=25');
  assert.equal(r.item.kind, 'implicit');
  assert.ok(Math.abs(r.item.F({ x: 3, y: 4 })) < 1e-12);
  assert.ok(r.item.F({ x: 0, y: 0 }) < 0);
});

test('放物線 y^2=4x も implicit', () => {
  const r = kindOf('y^2=4x');
  assert.equal(r.item.kind, 'implicit');
  assert.ok(Math.abs(r.item.F({ x: 1, y: 2 })) < 1e-12);
});

test('不等式は inequality(領域)', () => {
  const r = kindOf('y>x^2');
  assert.equal(r.item.kind, 'inequality');
  assert.equal(r.item.op, '>');
  assert.ok(r.item.F({ x: 0, y: 5 }) > 0);
  const r2 = kindOf('x^2+y^2<=9');
  assert.equal(r2.item.op, '<=');
  assert.ok(r2.item.F({ x: 1, y: 1 }) < 0);
});

test('点の分類と自由移動の判定', () => {
  const fixed = kindOf('(1,2)');
  assert.equal(fixed.item.kind, 'point');
  assert.equal(fixed.item.free, true);
  assert.ok(Math.abs(fixed.item.fx({}) - 1) < 1e-12);
  const moving = kindOf('(a, a^2)', { a: 2 });
  assert.equal(moving.item.kind, 'point');
  assert.equal(moving.item.free, false);
  assert.ok(Math.abs(moving.item.fy({ a: 2 }) - 4) < 1e-12);
});

test('スライダー定義 a=2.5', () => {
  const sv = {};
  const r = kindOf('a=2.5', sv);
  assert.equal(r.kind, 'sliderdef');
  assert.equal(r.v, 'a');
  assert.equal(sv.a, 2.5);
});

test('式内の未定義 a/b でスライダーが自動作成される', () => {
  const sv = {};
  const r = kindOf('y=a x+b', sv);
  assert.equal(r.item.kind, 'explicit');
  assert.ok('a' in sv && 'b' in sv);
  assert.ok(Math.abs(r.item.f({ x: 1, a: 2, b: 3 }) - 5) < 1e-12);
});

test('y=a x^2+b はスライダー連動の2次関数', () => {
  const r = kindOf('y=a(x-1)^2+2', { a: 1 });
  assert.equal(r.item.kind, 'explicit');
  assert.ok(Math.abs(r.item.f({ x: 1, a: 1 }) - 2) < 1e-12);
});

test('a だけの行は needsvar', () => {
  const r = kindOf('a', {});
  assert.equal(r.kind, 'needsvar');
});

test('導関数 y=d/dx(x^3)', () => {
  const r = kindOf('y=d/dx(x^3)');
  assert.equal(r.item.kind, 'explicit');
  assert.ok(Math.abs(r.item.f({ x: 2 }) - 12) < 1e-3);
});

test('x=3 は explicitY(垂直線)', () => {
  const r = kindOf('x=3');
  assert.equal(r.item.kind, 'explicitY');
  assert.ok(Math.abs(r.item.f({ y: 100 }) - 3) < 1e-12);
});

test('単独の式 x^2 は y=x^2 として描く', () => {
  const r = kindOf('x^2');
  assert.equal(r.item.kind, 'explicit');
});

test('sin(x) 単独も explicit', () => {
  const r = kindOf('sin(x)');
  assert.equal(r.item.kind, 'explicit');
  assert.ok(Math.abs(r.item.f({ x: Math.PI / 2 }) - 1) < 1e-12);
});

console.log(`\n結果: ${pass} 成功 / ${fail} 失敗`);
if (fail > 0) {
  for (const f of failures) console.log(`- ${f.name}: ${f.error}`);
  process.exit(1);
}
