// Formulas in Hill order (C, then H, then the rest alphabetically; with no carbon, everything alphabetically), with isotopes kept:
// a labelled atom is counted on its own (¹³C, D, T) next to its element, and masses use the isotope's own mass.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, molFromSmiles } from './load.mjs';
const get = loadModules();
const MS = get('MS');
const hillOf = s => MS.hill(MS.composition(molFromSmiles(s)).counts);

test('Hill order, with and without carbon', () => {
  for (const [s, f] of [['CCO', 'C2H6O'], ['CN1C=NC2=C1C(=O)N(C(=O)N2C)C', 'C8H10N4O2'], ['[NH4+].[Cl-]', 'ClH4N'], ['[Na+].[O-]C(=O)C', 'C2H3NaO2'],
    ['O', 'H2O'], ['OS(=O)(=O)O', 'H2O4S'], ['ClCCl', 'CH2Cl2'], ['C[Si](C)(C)Cl', 'C3H9ClSi'], ['[Na+].[Cl-]', 'ClNa'], ['BrC(Br)Br', 'CHBr3']])
    assert.equal(hillOf(s), f, s);
});

test('isotopes are kept, each next to its own element', () => {
  for (const [s, f] of [['[13CH4]', '¹³CH4'], ['[2H]C([2H])([2H])O', 'CHD3O'], ['[3H]C', 'CH3T'], ['C[13CH2]O', 'C¹³CH6O'],
    ['[2H]O[2H]', 'D2O'], ['[15NH3]', 'H3¹⁵N'], ['[1H]C([1H])([1H])O', 'CH4O']])
    assert.equal(hillOf(s), f, s);
});

test('a labelled compound has its own mass and isotope pattern', () => {
  const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-3, `${m}: ${a} vs ${b}`);
  const mh = s => MS.adducts(molFromSmiles(s)).rows.find(r => r.id === 'M+H');
  near(mh('C').mz, 17.0386, 'CH4 [M+H]+');
  near(mh('[13CH4]').mz, 18.0419, '13CH4 [M+H]+');
  near(mh('[2H]C([2H])([2H])O').mz, 36.0523, 'CD3OH [M+H]+');
  assert.equal(mh('[13CH4]').formula, '¹³CH5+');
  // the pattern's first peak is the labelled molecule; a fully labelled carbon can't add a 13C satellite
  const iso = MS.isotopes(MS.composition(molFromSmiles('[13CH4]')).counts, 0);
  near(iso[0].mz, 17.0347 + 0.000549 * 0, '13CH4 M');
  assert.ok(iso.every(p => p.mz < 18.05), 'no M+2 from a second 13C');
});

test('elemental analysis lists labelled atoms with their own mass', () => {
  const e = MS.elemental(MS.composition(molFromSmiles('[13CH4]')).counts);
  assert.equal(JSON.stringify(e.rows.map(r => r.el)), '["¹³C","H"]'); // values from the VM are another realm
  near2(e.mw, 13.003 + 4 * 1.008);
  function near2(a, b) { assert.ok(Math.abs(a - b) < 0.01, `${a} vs ${b}`); }
});
