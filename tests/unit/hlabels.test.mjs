// Labels with hydrogens and charges read as real atoms (H3C, NH3+, O-, Fe2+), nicknames written leftward, deuterated groups,
// and explicit hydrogens in SMILES: none of these may silently drop out of the formula.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const parseLabel = get('parseLabel'), normalizeLabel = get('normalizeLabel'), kindOf = get('kindOf'), buildIndex = get('buildIndex'), toOCL = get('toOCL');
const smilesMol = get('smilesMol'), fromOCL = get('fromOCL');
const P = t => { const p = parseLabel(t); return p && JSON.parse(JSON.stringify(p)); };

test('a typed label is an element with its hydrogens and charge, however it is written', () => {
  const cases = {
    CH3: { el: 'C', h: 3 }, H3C: { el: 'C', h: 3 }, CH2: { el: 'C', h: 2 }, CH: { el: 'C', h: 1 }, CH4: { el: 'C', h: 4 },
    NH2: { el: 'N', h: 2 }, H2N: { el: 'N', h: 2 }, OH: { el: 'O', h: 1 }, HO: { el: 'O', h: 1 }, SH: { el: 'S', h: 1 },
    'CH3+': { el: 'C', h: 3, charge: 1 }, 'CH2+': { el: 'C', h: 2, charge: 1 }, 'CH3-': { el: 'C', h: 3, charge: -1 },
    'NH3+': { el: 'N', h: 3, charge: 1 }, 'NH4+': { el: 'N', h: 4, charge: 1 }, 'H3N+': { el: 'N', h: 3, charge: 1 },
    'O-': { el: 'O', h: null, charge: -1 }, 'OH-': { el: 'O', h: 1, charge: -1 }, 'O−': { el: 'O', h: null, charge: -1 },
    'O2-': { el: 'O', h: null, charge: -2 }, 'Fe+3': { el: 'Fe', h: null, charge: 3 }, 'Mg2+': { el: 'Mg', h: null, charge: 2 }, 'Fe2+': { el: 'Fe', h: null, charge: 2 }, 'Fe3+': { el: 'Fe', h: null, charge: 3 }, 'N+': { el: 'N', h: null, charge: 1 },
    'NH3^{+}': { el: 'N', h: 3, charge: 1 }, 'O^{-}': { el: 'O', h: null, charge: -1 }, N: { el: 'N', h: null }, Ho: { el: 'Ho', h: null },
  };
  for (const [t, want] of Object.entries(cases)) assert.deepEqual(P(t), want, t);
  for (const t of ['Me', 'R1', 'OMe', 'CO', 'NO', 'H2', 'CH5', 'NaH', 'FeH2', '+', '2+', 'Xx', 'CO2H', 'HH']) assert.equal(P(t), null, t);
  // a digit that counts atoms is not a charge: diazonium, azide, triiodide, H2+ stay labels
  for (const t of ['N2+', 'N3-', 'C2-', 'I3-', 'H2+', 'N+2', 'O3-']) assert.equal(P(t), null, t);
});

test('labels are not mistaken for other elements, and nicknames written leftward are the nickname', () => {
  const cases = { HO: 'O', H2N: 'N', H3C: 'C', 'NH3+': 'N', 'Fe2+': 'Fe', NaH: 'Na', OH: 'O', cl: 'Cl', CL: 'Cl', BR: 'Br', CU: 'Cu', SI: 'Si', ZN: 'Zn', NI: 'Ni', SN: 'Sn', OS: 'Os', Co: 'Co', CO: 'CO', NO: 'NO', SO: 'SO', HF: 'F',
    MeO: 'OMe', F3C: 'CF3', Me2N: 'NMe2', OHC: 'CHO', HO2C: 'CO2H', D3C: 'CD3', R1: 'R1', Ph: 'Ph', phenyl: 'Ph' };
  for (const [t, want] of Object.entries(cases)) assert.equal(normalizeLabel(t), want, t);
  assert.equal(kindOf('CO'), 'generic', 'CO is a group the app does not know: generic, not cobalt');
});

const formula = d => toOCL(d, buildIndex(d)).mol.getMolecularFormula().formula;
test('deuterated groups count their deuterium', () => {
  const d = docFromSmiles(get, 'CCO'); d.atoms[0].el = 'CD3';
  assert.equal(kindOf('CD3'), 'abbr');
  const f = toOCL(d, buildIndex(d)).mol.getMolecularFormula();
  assert.ok(Math.abs(f.relativeWeight - 49.09) < 0.05, `CD3CH2OH weighs 49.09, got ${f.relativeWeight} (${f.formula})`); // OpenChemLib writes D as H in the formula string
  const e = docFromSmiles(get, 'CCO'); e.atoms[2].el = 'OD';
  assert.ok(Math.abs(toOCL(e, buildIndex(e)).mol.getMolecularFormula().relativeWeight - 47.08) < 0.05);
});

test('SMILES with explicit hydrogens keeps them as atoms; isotopes and stereo H are kept too', () => {
  const atoms = s => { const m = smilesMol(s); m.inventCoordinates(); return [...fromOCL(m).atoms].map(a => a.el + (a.iso ? a.iso : '')); };
  assert.deepEqual(atoms('[H]C([H])([H])CO').sort(), ['C', 'C', 'H', 'H', 'H', 'O'].sort());
  assert.ok(atoms('[2H]C([2H])([2H])CO').filter(x => x === 'H2').length === 3, 'deuterium keeps its mass number');
  assert.equal(atoms('[H][C@@]1(C)CCCC1').filter(x => x === 'H').length, 1);
  assert.equal(atoms('CCO').length, 3, 'no explicit H: none added');
  const m = smilesMol('[H]C([H])([H])CO'); assert.equal(m.getMolecularFormula().formula, 'C2H6O');
});

test('deuterated nicknames keep their D in molfiles and ChemDraw files', () => {
  const F = get('FORMATS'), d = docFromSmiles(get, 'CCO'); d.atoms[0].el = 'CD3';
  const mol = F.write('mol', d);
  assert.match(mol, /M {2}ISO/, 'the molfile marks the D');
  assert.match(F.write('cdxml', d), /Isotope="2"/);
});
