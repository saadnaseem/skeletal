import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load.mjs';
const get = loadModules();
const H1 = get('SOLV_H1'), C13 = get('SOLV_C13'), COLS = get('SOLV_COLS'), RES = get('SOLV_RES'), ORDER = get('SOLV_ORDER');
const col = s => COLS.indexOf(s);

test('every impurity row has one value per solvent column', () => {
  for (const r of [...H1, ...C13]) { assert.equal(r[3].length, COLS.length, r[0]); for (const v of r[3]) assert.ok(v === null || typeof v === 'number' || /^\d+\.\d+-\d+\.\d+$/.test(v), `${r[0]} ${v}`); }
});
test('values are in sensible ranges', () => {
  for (const r of H1) for (const v of r[3]) if (typeof v === 'number') assert.ok(v > -1 && v < 13, `${r[0]} ${v}`);
  for (const r of C13) for (const v of r[3]) if (typeof v === 'number') assert.ok(v > -10 && v < 230, `${r[0]} ${v}`);
});
test('spot checks against Fulmer et al. 2010', () => {
  const find = (t, n, g) => t.find(r => r[0] === n && r[1] === g);
  assert.equal(find(H1, 'acetone', 'CH3')[3][col('CDCl3')], 2.17);
  assert.equal(find(H1, 'dichloromethane', 'CH2')[3][col('DMSO-d6')], 5.76);
  assert.equal(find(H1, 'water', 'OH')[3][col('CD3OD')], 4.87);
  assert.equal(find(H1, 'water', 'OH')[3][col('D2O')], null);
  assert.equal(find(C13, 'acetone', 'CO')[3][col('CDCl3')], 207.07);
  assert.equal(find(H1, 'pyrrolidine', 'CH2(2,5)')[3][col('acetone-d6')], null, 'pyrrolidine reacts with acetone-d6');
});
test('residual table covers every listed solvent', () => {
  for (const s of ORDER) assert.ok(RES[s] && RES[s].h.length, s);
  assert.equal(RES.CDCl3.h[0][0], '7.26'); assert.equal(RES['DMSO-d6'].c[0][0], '39.52');
});
