import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, molFromSmiles } from './load.mjs';
const get = loadModules();
const NMR = get('NMR');

// Experimental shifts (CDCl3) from standard references; tolerances match the documented accuracy.
const CASES = [
  { smi: 'CCOC(C)=O', name: 'ethyl acetate', h: [4.12, 2.05, 1.26], c: [171.1, 60.5, 21.0, 14.2] },
  { smi: 'CCO', name: 'ethanol', h: [3.69, 1.22], c: [58.3, 18.4] },
  { smi: 'Cc1ccccc1', name: 'toluene', h: [2.36], c: [137.9, 129.1, 128.3, 125.4, 21.5] },
  { smi: 'CC(=O)c1ccccc1', name: 'acetophenone', h: [2.60], c: [198.1, 137.1, 133.1, 128.6, 128.3, 26.6] },
  { smi: 'c1ccncc1', name: 'pyridine', h: [8.60, 7.64, 7.25], c: [149.9, 135.9, 123.8] },
  { smi: 'C=Cc1ccccc1', name: 'styrene', h: [6.72, 5.75, 5.24], c: [136.9, 113.8] },
  { smi: 'c1ccc2ccccc2c1', name: 'naphthalene', h: [7.84, 7.47], c: [133.5, 127.9, 125.8] },
  // Regression: the conjugated-ketone bonus must not fire for plain dialkyl ketones.
  { smi: 'CC(C)=O', name: 'acetone', h: [2.17], c: [206.7, 30.8] },
  { smi: 'CCC(C)=O', name: 'butan-2-one', h: [2.44, 2.14, 1.06], c: [209.3, 36.9, 29.4, 7.9] },
];
const near = (list, v, tol) => list.some(x => Math.abs(x - v) <= tol);

for (const k of CASES) test(`NMR shifts for ${k.name} fall within tolerance`, () => {
  const r = NMR.predict(molFromSmiles(k.smi));
  const H = r.H1.filter(g => !g.exch).map(g => g.shift), C = r.C13.map(g => g.shift);
  for (const v of k.h) assert.ok(near(H, v, 0.35), `1H ${v} not matched in ${H}`);
  for (const v of k.c) assert.ok(near(C, v, 5.5), `13C ${v} not matched in ${C}`);
});

test('ethyl group gives a quartet and a triplet with correct integrals', () => {
  const r = NMR.predict(molFromSmiles('CCOC(C)=O'));
  const q = r.H1.find(g => g.mult === 'q'), t = r.H1.find(g => g.mult === 't'), s = r.H1.find(g => g.mult === 's');
  assert.ok(q && t && s); assert.equal(q.n, 2); assert.equal(t.n, 3); assert.equal(s.n, 3);
});

test('symmetry merges equivalent carbons and protons', () => {
  const r = NMR.predict(molFromSmiles('c1ccccc1'));
  assert.equal(r.C13.length, 1); assert.equal(r.H1.length, 1); assert.equal(r.H1[0].n, 6);
});

test('exchangeable protons are flagged', () => {
  const r = NMR.predict(molFromSmiles('CC(=O)O'));
  const oh = r.H1.find(g => g.exch); assert.ok(oh); assert.ok(oh.shift > 10);
});

test('journal text is formatted', () => {
  const t = NMR.journalText(NMR.predict(molFromSmiles('CCO')));
  assert.match(t, /^¹H NMR \(400 MHz, predicted\): δ /); assert.match(t, /¹³C NMR \(101 MHz, predicted\): δ /);
});
