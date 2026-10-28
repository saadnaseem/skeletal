import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, molFromSmiles } from './load.mjs';
const NMR = loadModules()('NMR');

// [SMILES, atom index of the acidic/basic atom, kind, solvent, literature value, tolerance]
// Literature: Evans–Ripin pKa table, Bordwell/Reich DMSO compilation, Williams water table.
const CASES = [
  ['CC(=O)O', 3, 'acid', 'w', 4.76, 0.3, 'acetic acid'],
  ['ClCC(=O)O', 4, 'acid', 'w', 2.86, 0.5, 'chloroacetic acid'],
  ['FC(F)(F)C(=O)O', 6, 'acid', 'w', 0.23, 1.0, 'trifluoroacetic acid'],
  ['NCC(=O)O', 4, 'acid', 'w', 2.34, 0.5, 'glycine (COOH)'],
  ['OC(=O)c1ccc(cc1)[N+](=O)[O-]', 0, 'acid', 'w', 3.44, 0.4, 'p-nitrobenzoic acid'],
  ['Oc1ccccc1', 0, 'acid', 'w', 9.99, 0.2, 'phenol'],
  ['Oc1ccc(cc1)[N+](=O)[O-]', 0, 'acid', 'w', 7.15, 0.5, 'p-nitrophenol'],
  ['OCC(F)(F)F', 0, 'acid', 'w', 12.4, 1.0, '2,2,2-trifluoroethanol'],
  ['CC(C)=O', 0, 'acid', 'd', 26.5, 0.5, 'acetone (DMSO)'],
  ['CC(=O)CC(C)=O', 3, 'acid', 'd', 13.3, 1.0, 'acetylacetone (DMSO)'],
  ['C[N+](=O)[O-]', 0, 'acid', 'd', 17.2, 0.5, 'nitromethane (DMSO)'],
  ['CC#N', 0, 'acid', 'd', 31.3, 0.5, 'acetonitrile (DMSO)'],
  ['N#CCC#N', 2, 'acid', 'd', 11.1, 1.0, 'malononitrile (DMSO)'],
  ['CC(N)=O', 2, 'acid', 'd', 25.5, 0.5, 'acetamide (DMSO)'],
  ['c1cc[nH]c1', 3, 'acid', 'd', 23.0, 0.5, 'pyrrole (DMSO)'],
  ['CS(N)(=O)=O', 2, 'acid', 'w', 10.1, 1.0, 'methanesulfonamide'],
  ['Sc1ccccc1', 0, 'acid', 'w', 6.6, 0.5, 'thiophenol'],
  ['CCN', 2, 'base', 'w', 10.7, 0.5, 'ethylamine'],
  ['C1COCCN1', 5, 'base', 'w', 8.4, 0.7, 'morpholine'],
  ['FC(F)(F)CN', 5, 'base', 'w', 5.7, 1.0, '2,2,2-trifluoroethylamine'],
  ['Nc1ccccc1', 0, 'base', 'w', 4.6, 0.3, 'aniline'],
  ['Nc1ccc(cc1)[N+](=O)[O-]', 0, 'base', 'w', 1.0, 0.7, 'p-nitroaniline'],
  ['c1ccncc1', 3, 'base', 'w', 5.25, 0.3, 'pyridine'],
  ['CN(C)c1ccncc1', 6, 'base', 'w', 9.6, 0.8, '4-DMAP'],
  ['Clc1ccccn1', 6, 'base', 'w', 0.72, 1.0, '2-chloropyridine'],
  ['c1c[nH]cn1', 4, 'base', 'w', 7.0, 0.3, 'imidazole'],
  ['NC(N)=N', 3, 'base', 'w', 13.6, 0.5, 'guanidine'],
];
for (const [smi, idx, kind, solv, lit, tol, name] of CASES) test(`pKa ${name}`, () => {
  const m = molFromSmiles(smi);
  assert.ok(idx < m.getAtoms(), 'atom index in range');
  const r = NMR.acidity(m, idx)[kind];
  assert.ok(r, `${kind} site found`);
  const v = solv === 'w' ? r.w : r.d;
  assert.ok(v != null, 'value present');
  assert.ok(Math.abs(v - lit) <= tol, `${name}: predicted ${v}, literature ${lit} (±${tol})`);
});

test('ammonium N–H is reported as an acid', () => {
  const r = NMR.acidity(molFromSmiles('C[NH3+]'), 1);
  assert.ok(Math.abs(r.acid.w - 10.6) < 0.5);
});
test('atoms with no acidic H or lone pair return nothing', () => {
  const r = NMR.acidity(molFromSmiles('CC(C)(C)C'), 1); // quaternary carbon
  assert.equal(r.acid, null); assert.equal(r.base, null);
});
