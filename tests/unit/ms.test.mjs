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

test('MS/MS follows losses one after another and keeps reference base peaks', () => {
  const peak = (smi, mz, opts) => MS.msms(mol(smi), opts).peaks.find(p => Math.abs(p.mz - mz) < 0.003);
  const base = (smi, opts) => MS.msms(mol(smi), opts).peaks.reduce((a, b) => (b.rel > a.rel ? b : a)).mz;
  const NE = 'NCC(O)c1ccc(O)c(O)c1'; // noradrenaline [M+H]+ 170.0812
  near(base(NE), 152.0706, 0.003, 'noradrenaline base peak is -H2O');
  for (const mz of [135.0441, 107.0491]) assert.ok(peak(NE, mz)?.rel >= 10, `noradrenaline ${mz}`);
  // more energy, more of the later losses
  assert.ok(peak(NE, 135.0441, { energy: 'high' }).rel > peak(NE, 135.0441, { energy: 'low' }).rel * 2, 'energy moves intensity to 135');
  near(base('CC(=O)Nc1ccc(O)cc1'), 110.0600, 0.003, 'paracetamol base peak is -ketene');
  near(base('NC(Cc1ccccc1)C(=O)O'), 120.0808, 0.003, 'phenylalanine base peak is -HCOOH');
  near(base('Cn1cnc2c1c(=O)n(C)c(=O)n2C'), 138.0662, 0.003, 'caffeine base peak is -CH3NCO');
  near(base('NCCc1ccc(O)c(O)c1'), 137.0597, 0.003, 'dopamine base peak is -NH3');
});

test('MS/MS moves a hydrogen only when the other piece has one to give', () => {
  // [M+H-O]+ and [M+H-NH]+ would leave a bare O atom or NH as the neutral
  const r = MS.msms(mol('NCC(O)c1ccc(O)c(O)c1'), { energy: 'high' });
  for (const mz of [154.0863, 155.0703]) assert.ok(!r.peaks.some(p => Math.abs(p.mz - mz) < 0.003), `no impossible ion at ${mz}`);
  assert.ok(MS.msms(mol('CCO')).peaks.every(p => p.formula !== 'C2H6+'), 'ethanol gives no [M+H-O]+');
});

// Value: protects=[M-H]- loss chain, phenol CO gated on amine loss, ring-opening ions as [A+H]+; fails_when=CO2 score/sign,
//   ArOH from-step/gate or ring-opening H count regress; why_new=existing tests cover [M+H]+ bases only; seam=none;
//   no_claim=agreement with measured spectra beyond these reference ions (rule-based predictor; unit only)
test('MS/MS negative mode, gated phenol CO loss and ring-opening ions', () => {
  const r = (smi, opts) => MS.msms(mol(smi), opts);
  const base = (smi, opts) => r(smi, opts).peaks.reduce((a, b) => (b.rel > a.rel ? b : a));
  const has = (smi, mz, opts) => r(smi, opts).peaks.some(p => Math.abs(p.mz - mz) < 0.003);
  near(base('OC(=O)c1ccccc1', { mode: 'neg' }).mz, 77.0397, 0.003, 'benzoate [M-H]- base peak is -CO2');
  near(base('CC(=O)Oc1ccccc1C(=O)O', { mode: 'neg' }).mz, 137.0244, 0.003, 'aspirin [M-H]- base peak is -ketene');
  assert.ok(r('OC(=O)c1ccccc1', { mode: 'neg' }).peaks.every(p => p.formula.endsWith('-')), 'negative ions only');
  // tyramine: the phenol loses CO only after NH3 has gone, never straight from [M+H]+
  const TY = 'NCCc1ccc(O)cc1';
  assert.ok(has(TY, 93.0699), 'tyramine -NH3 then -CO');
  assert.ok(!has(TY, 110.0964), 'no direct [M+H-CO]+ from a phenol');
  // cyclohexanol ring opening: the piece plus the proton (C4H8O + H+), not with an extra or missing H2
  const ring = r('OC1CCCCC1').peaks.filter(p => p.how === 'ring opening').map(p => p.formula);
  assert.ok(ring.includes('C4H9O+'), `ring opening gives [C4H8O+H]+: ${ring}`);
  assert.ok(!ring.includes('C4H7O+') && !ring.includes('C4H11O+'), `no H-shifted ring ions: ${ring}`);
});

test('elemental analysis uses standard atomic weights', () => {
  const ea = MS.elemental(MS.composition(mol('CC(=O)Oc1ccccc1C(=O)O')).counts);
  assert.equal(ea.rows.map(r => `${r.el} ${r.pct.toFixed(2)}`).join(', '), 'C 60.00, H 4.48, O 35.52');
  near(ea.mw, 180.159, 0.002, 'MW');
  const caf = MS.elemental(MS.composition(mol('Cn1cnc2c1c(=O)n(C)c(=O)n2C')).counts);
  assert.equal(caf.rows.map(r => `${r.el} ${r.pct.toFixed(2)}`).join(', '), 'C 49.48, H 5.19, N 28.85, O 16.48');
});
