import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load.mjs';
const get = loadModules();
const G = get('NMRG');
const j = o => JSON.parse(JSON.stringify(o));

test('formula parser handles groups and subscripts', () => {
  assert.deepEqual(j(G.parseFormula('C9H8O4')), { C: 9, H: 8, O: 4 });
  assert.deepEqual(j(G.parseFormula('CH3(CH2)2OH')), { C: 3, H: 8, O: 1 });
  assert.deepEqual(j(G.parseFormula('C₂H₅Br')), { C: 2, H: 5, Br: 1 });
  assert.throws(() => G.parseFormula('C9(H8'));
});

test('degree of unsaturation', () => {
  const d = f => G.dbe(G.parseFormula(f));
  assert.equal(d('C6H6'), 4);        // benzene: ring + 3 C=C
  assert.equal(d('C9H8O4'), 6);      // aspirin
  assert.equal(d('C2H3Cl'), 1);      // vinyl chloride: halogen counts as H
  assert.equal(d('C5H5N'), 4);       // pyridine
  assert.equal(d('C8H10N4O2'), 6);   // caffeine
  assert.equal(d('C2H6O'), 0);       // ethanol: O drops out
});

test('rule of 13', () => {
  const r = G.rule13(78); assert.equal(G.hill(r.formula), 'C6H6'); assert.equal(r.dbe, 4);   // benzene
  const e = G.rule13(88, { O: 2 }); assert.equal(G.hill(e.formula), 'C4H8O2'); assert.equal(e.dbe, 1); // ethyl acetate
  const n = G.rule13(79, { N: 1 }); assert.equal(G.hill(n.formula), 'C5H5N'); assert.ok(n.nitrogenRuleOk); // pyridine, odd M with one N
  assert.equal(G.rule13(94).nitrogenRuleOk, true);
});

test('integrals scale to whole H counts that sum to the formula', () => {
  assert.deepEqual(G.scaleIntegrals([2.0, 3.1], 10).map(x => x.h), [4, 6]);
  assert.deepEqual(G.scaleIntegrals([1.02, 1.98, 3.0], 12).map(x => x.h), [2, 4, 6]);
  assert.deepEqual(G.scaleIntegrals([5, 2, 3], 0).map(x => +x.h.toFixed(2)), [2.5, 1, 1.5]);
});
