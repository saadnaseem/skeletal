import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, molFromSmiles } from './load.mjs';
const NMR = loadModules()('NMR');

// Blanksby & Ellison, Acc. Chem. Res. 2003, 36, 255 (kcal/mol, 298 K)
const XH = [
  ['C', 0, 105.0, 0.1, 'methane'], ['CC', 0, 101.1, 0.5, 'ethane'], ['CC(C)C', 1, 96.5, 1.5, 'isobutane tertiary'],
  ['Cc1ccccc1', 0, 89.8, 1.0, 'toluene benzylic'], ['C=CC', 2, 88.8, 1.0, 'propene allylic'], ['CO', 0, 96.1, 1.0, 'methanol C–H'],
  ['CC#N', 0, 93.4, 1.0, 'acetonitrile'], ['C1CCCC1', 0, 93.0, 1.0, 'cyclopentane'], ['C1CC1', 0, 105.7, 1.0, 'cyclopropane'],
  ['C1=CCC=C1', 2, 79.9, 2.0, 'cyclopentadiene'], ['CC=O', 1, 89.4, 0.5, 'acetaldehyde C(O)–H'], ['c1ccccc1', 0, 112.9, 0.1, 'benzene'],
  ['C=C', 0, 110.7, 0.1, 'ethylene'], ['C#C', 0, 133.3, 0.1, 'acetylene'], ['CCO', 2, 104.7, 0.5, 'ethanol O–H'],
  ['CC(=O)O', 3, 112, 1.0, 'acetic acid O–H'], ['CS', 1, 87.4, 0.5, 'methanethiol S–H'], ['Oc1ccccc1', 0, 87.0, 3.0, 'phenol O–H'],
];
for (const [smi, idx, lit, tol, name] of XH) test(`BDE ${name}`, () => {
  const r = NMR.bdeAtom(molFromSmiles(smi), idx);
  assert.ok(r && Math.abs(r.v - lit) <= tol, `${name}: ${r && r.v} vs ${lit}`);
});

test('para-methoxy lowers and para-nitro raises the phenol O–H BDE', () => {
  const base = NMR.bdeAtom(molFromSmiles('Oc1ccccc1'), 0).v;
  const ome = NMR.bdeAtom(molFromSmiles('COc1ccc(O)cc1'), 6).v;
  const no2 = NMR.bdeAtom(molFromSmiles('Oc1ccc(cc1)[N+](=O)[O-]'), 0).v;
  assert.ok(ome < base - 3 && no2 > base + 3);
});

const BONDS = [
  ['CC', 0, 1, 90.1, 0.5, 'ethane C–C'], ['CCl', 0, 1, 83.7, 0.5, 'chloromethane C–Cl'], ['Cc1ccccc1', 0, 1, 103.5, 0.5, 'toluene Ph–CH3'],
  ['c1ccccc1Cl', 5, 6, 97.1, 0.5, 'chlorobenzene'], ['OO', 0, 1, 51, 1, 'hydrogen peroxide'],
];
for (const [smi, a, b, lit, tol, name] of BONDS) test(`BDE bond ${name}`, () => {
  const r = NMR.bdeBond(molFromSmiles(smi), a, b);
  assert.ok(r && Math.abs(r.v - lit) <= tol, `${name}: ${r && r.v} vs ${lit}`);
});
test('double bonds are labeled as average bond enthalpies', () => {
  const r = NMR.bdeBond(molFromSmiles('C=C'), 0, 1); assert.equal(r.avg, true); assert.equal(r.v, 146);
});
test('aromatic ring bonds have no BDE', () => {
  const r = NMR.bdeBond(molFromSmiles('c1ccccc1'), 0, 1); assert.equal(r.v, null);
});
