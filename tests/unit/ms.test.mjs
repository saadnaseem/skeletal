import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, OCL } from './load.mjs';
const get = loadModules();
const MS = get('MS');
const mol = s => OCL.Molecule.fromSmiles(s);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('adduct m/z values match reference monoisotopic masses', () => {
  const a = MS.adducts(mol('CC(=O)Oc1ccccc1C(=O)O')); // aspirin C9H8O4
  near(a.M, 180.04226, 1e-4, 'M');
  const by = Object.fromEntries(a.rows.map(r => [r.id, r]));
  near(by['M+H'].mz, 181.04954, 1e-4, '[M+H]+'); near(by['M+Na'].mz, 203.03148, 1e-4, '[M+Na]+');
  near(by['M-H'].mz, 179.03498, 1e-4, '[M-H]-'); near(by['M+2H'].mz, 91.02841, 1e-4, '[M+2H]2+');
  assert.equal(by['M+H'].formula, 'C9H9O4+'); assert.equal(by['M+2H'].formula, 'C9H10O4 2+');
  near(MS.adducts(mol('Cn1cnc2c1c(=O)n(C)c(=O)n2C')).rows[0].mz, 195.08765, 1e-4, 'caffeine [M+H]+');
});

test('a drawn ion is reported as itself', () => {
  const a = MS.adducts(mol('C[N+](C)(C)C'));
  assert.equal(a.rows.length, 1); near(a.rows[0].mz, 74.09643, 1e-4, 'tetramethylammonium');
});

test('isotope patterns reproduce Cl, Br and carbon signatures', () => {
  const pat = s => MS.nominal(MS.isotopes(MS.composition(mol(s)).counts, 1)).map(p => p.rel);
  const dcm = pat('ClCCl'); near(dcm[2], 64.0, 1, 'CH2Cl2 M+2'); near(dcm[4], 10.2, 0.5, 'CH2Cl2 M+4');
  const phbr = pat('Brc1ccccc1'); near(phbr[2], 97.5, 1, 'PhBr M+2');
  const asp = pat('CC(=O)Oc1ccccc1C(=O)O'); near(asp[1], 10.0, 0.3, 'C9 M+1');
});

test('MS/MS gives known major fragments as even-electron ions', () => {
  const has = (smi, mz, mode = 'pos') => MS.msms(mol(smi), { mode }).peaks.some(p => Math.abs(p.mz - mz) < 0.003);
  assert.ok(has('CCOC(=O)c1ccccc1', 105.0335), 'benzoyl from ethyl benzoate');
  assert.ok(has('CC(=O)Nc1ccc(O)cc1', 110.0600), 'paracetamol loses ketene');
  assert.ok(has('NCCc1ccc(O)c(O)c1', 137.0597), 'dopamine loses NH3');
  assert.ok(has('CC(=O)Oc1ccccc1C(=O)O', 137.0244, 'neg'), 'aspirin [M-H]- loses ketene');
  const r = MS.msms(mol('CC(=O)Oc1ccccc1C(=O)O'));
  assert.ok(r.peaks.every(p => p.mz < r.precursor.mz), 'fragments are lighter than the precursor');
  assert.ok(r.peaks.every(p => !/^(CH3|HO|H2N|H4N)\+$/.test(p.formula)), 'no one-atom ions');
});
