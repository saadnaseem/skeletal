// Isotope labels drawn on atoms ([2H], [13C], …) carry through NMR, mass spectrometry and file formats.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles, molFromSmiles, OCL } from './load.mjs';
const get = loadModules();
const NMR = get('NMR'), MS = get('MS'), F = get('FORMATS');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const plain = v => JSON.parse(JSON.stringify(v)); // values from the VM are another realm

test('deuterium is a hydrogen, not a substituent: no ¹H signal and unchanged ¹³C shifts', () => {
  const h = NMR.predict(OCL.Molecule.fromSmiles('CC(=O)C'));
  const d6 = NMR.predict(OCL.Molecule.fromSmiles('[2H]C([2H])([2H])C(=O)C([2H])([2H])[2H]'));
  assert.equal(d6.H1.length, 0, 'acetone-d6 has no protons');
  assert.deepEqual(plain(d6.C13.map(c => c.shift)), plain(h.C13.map(c => c.shift)));
  const d3 = NMR.predict(OCL.Molecule.fromSmiles('[2H]C([2H])([2H])C(=O)C'));
  assert.deepEqual(plain(d3.H1.map(g => [g.shift, g.n, g.mult])), [[2.12, 3, 's']], 'acetone-d3 keeps one CH3 singlet');
  const meod = NMR.predict(OCL.Molecule.fromSmiles('[2H]C([2H])([2H])O[2H]'));
  assert.equal(meod.H1.length, 0, 'CD3OD: neither CD3 nor OD gives a ¹H signal');
  const d1 = NMR.predict(OCL.Molecule.fromSmiles('CC([2H])C'));
  assert.deepEqual(plain(d1.H1.map(g => [g.n, g.mult])), [[1, 'sept'], [6, 'd']], 'propane-2-d: one CH left, still coupled to six H');
});

test('isotope labels set the exact mass and appear in the formula', () => {
  const ad = s => MS.adducts(molFromSmiles(s));
  near(ad('[2H]C([2H])([2H])[2H]').M, 20.05641, 1e-4, 'CD4');
  near(ad('[13CH4]').M, 17.03465, 1e-4, '13CH4');
  near(ad('C[15NH2]').M, 32.03923, 1e-4, 'CH3-15NH2');
  const asp = ad('O=C([13CH3])Oc1ccccc1C(O)=O');
  near(asp.M, 181.04561, 1e-4, 'aspirin-13C');
  assert.equal(asp.rows.find(r => r.id === 'M+H').formula, 'C8¹³CH9O4+');
  assert.equal(MS.hill(MS.composition(molFromSmiles('[2H]C([2H])([2H])C(=O)O')).counts), 'C2HD3O2');
  assert.match(MS.hrmsLine(asp.rows[0]), /C8¹³CH9O4\+ 182\.0529/);
  const iso = MS.isotopes(MS.composition(molFromSmiles('[13CH4]')).counts, 0);
  near(iso[0].mz, 17.03465, 1e-4, 'a labelled atom has one isotope, not the natural pattern');
  assert.equal(iso.length, 1);
  const el = MS.elemental(MS.composition(molFromSmiles('[2H]C([2H])([2H])[2H]')).counts);
  assert.deepEqual(plain(el.rows.map(r => r.el)), ['C', 'D']);
  const mm = MS.msms(molFromSmiles('[2H]C([2H])([2H])C(=O)OCC'), 'pos');
  near(mm.precursor.mz, 92.0786, 1e-3, 'MS/MS precursor of ethyl acetate-d3');
  assert.ok(mm.peaks.every(p => Number.isFinite(p.mz)));
});

test('CML and Marvin files keep isotope labels', () => {
  for (const smi of ['C[13CH3]', '[2H]C([2H])([2H])O']) {
    const d = docFromSmiles(get, smi), want = plain(d.atoms.map(a => a.iso || 0));
    for (const f of ['cml', 'mrv']) assert.deepEqual(plain(F.read(f, F.write(f, d)).atoms.map(a => a.iso || 0)), want, `${smi} via ${f}`);
  }
  const back = F.read('cml', '<cml><molecule><atomArray><atom id="a1" elementType="C" isotopeNumber="999"/><atom id="a2" elementType="C" isotopeNumber="x"/></atomArray></molecule></cml>');
  assert.ok(back.atoms.every(a => !a.iso), 'out-of-range or non-numeric isotopes are ignored');
});
