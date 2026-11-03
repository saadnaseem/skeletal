// Hydrogens for teaching: condensed formulas typed as labels (CH2CH3, CH2OH) are real atoms, loose typing (CH₃, ch3, C H3) reads as meant,
// a label that still reads as nothing is flagged, carbenes keep both electrons, and H rows keep clear of nearby labels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const condensedGroup = get('condensedGroup'), normalizeLabel = get('normalizeLabel'), kindOf = get('kindOf'), tidyLabel = get('tidyLabel');
const unreadFormula = get('unreadFormula'), buildIndex = get('buildIndex'), toOCL = get('toOCL'), implicitH = get('implicitH');
const bondSum = get('bondSum'), layoutLabel = get('layoutLabel'), MS = get('MS'), F = get('FORMATS'), OCL = get('OCL');
const plain = v => v && JSON.parse(JSON.stringify(v));
const smilesOf = s => OCL.Molecule.fromSmiles(s).toIsomericSmiles();
// a group's SMILES as a molecule: its attachment atom (written first) takes back the H its bond replaces
const capped = s => s.replace(/^\[([A-Z][a-z]?)(?:H(\d*))?\]/, (m, el, h) => `[${el}H${(h === undefined ? 0 : h === '' ? 1 : +h) + 1}]`);

test('a condensed formula typed as a label is a group of real atoms, bonded at its one free atom', () => {
  const cases = { CH2CH3: 'CC', CH3CH2: 'CC', CH2OH: 'CO', OCH3: 'OC', CH2Cl: 'CCl', CHCl2: 'C(Cl)Cl', 'CH=CH2': 'C=C', 'C≡CH': 'C#C',
    'CH(CH3)2': 'C(C)C', '(CH3)2CH': 'C(C)C', 'C(CH3)3': 'C(C)(C)C', CH2CH2CH3: 'CCC', '(CH2)3CH3': 'CCCC', COCH3: 'C(=O)C', CH2OCH3: 'COC',
    CH2COCH3: 'CC(=O)C', CF2CF3: 'C(F)(F)C(F)(F)F', CH2NH2: 'CN', SCH3: 'SC' };
  for (const [t, want] of Object.entries(cases)){
    const g = condensedGroup(t); assert.ok(g, t);
    assert.equal(smilesOf(capped(g.s)), smilesOf(want), t);
    assert.equal(kindOf(t), 'abbr', t); assert.equal(normalizeLabel(t), t, t);
  }
  // not condensed formulas: groups of atoms with no single free bond, molecular formulas, single atoms, elements and nicknames
  for (const t of ['CO', 'NO', 'CS', 'C2H5', 'CH2CH2', 'CH3', 'NH2', 'Co', 'R1', 'Ph1', 'CH2(', 'C(C', 'CH3+']) assert.equal(condensedGroup(t), null, t);
  assert.equal(normalizeLabel('F3C'), 'CF3', 'a nickname written leftward stays the nickname');
  assert.equal(normalizeLabel('MeO'), 'OMe');
});

test('a condensed-formula label counts in the formula and reads the other way round when bonded from the other side', () => {
  const d = docFromSmiles(get, 'CCC'); d.atoms[0].el = 'CH2CH3'; // propane with an end written out as ethyl: butane
  const ix = buildIndex(d), m = toOCL(d, ix).mol;
  assert.equal(MS.hill(MS.composition(m).counts), 'C4H10');
  assert.deepEqual(plain(condensedGroup('CH2CH3')), { s: '[CH2][CH3]', l: 'H3CH2C' });
  assert.deepEqual(plain(condensedGroup('CH3CH2')), { s: '[CH2][CH3]', r: 'CH2CH3' });
  const sdf = F.write('sdf', d); assert.match(sdf, /V2000/); // files expand it into atoms
  assert.equal(OCL.Molecule.fromMolfile(sdf.split('$$$$')[0]).getAtoms(), 4);
});

test('loose typing reads as meant: subscript digits, spaces, one case', () => {
  const cases = { 'CH₃': 'CH3', 'C H3': 'CH3', ch3: 'CH3', nh2: 'NH2', oh: 'OH', 'CH₂CH₃': 'CH2CH3', 'CH_{3}': 'CH3', 'NH3+': 'NH3+', Me: 'Me', R1: 'R1', 'R 1': 'R 1', methyl: 'methyl', co: 'co' };
  for (const [t, want] of Object.entries(cases)) assert.equal(tidyLabel(t), want, t);
});

test('a label that looks like a formula but reads as nothing is flagged; real generic labels are not', () => {
  for (const t of ['CH2CH2', 'C2H5', 'ch3ch2', 'CH3C', 'H2', 'CH12']) assert.ok(unreadFormula(t), t);
  for (const t of ['R', 'R1', "R'", 'X', 'Ar', 'Nu', 'LG', 'Me', 'CH2CH3', 'OMe', 'C', 'Fe', 'Polymer', 'A']) assert.ok(!unreadFormula(t), t);
});

test('a carbene keeps both electrons: :CH2 has two H, not three, and stays a carbene through SMILES and files', () => {
  for (const [s, h] of [['[CH2]', 2], ['C[CH]C', 1], ['[CH3]', 3], ['CC[CH]', 1]]){
    const d = docFromSmiles(get, s), ix = buildIndex(d), i = d.atoms.findIndex(a => a.rad);
    assert.equal(implicitH(d.atoms[i], bondSum(ix, d.atoms[i].id)), h, s);
    assert.equal(toOCL(d, ix).mol.toIsomericSmiles(), OCL.Molecule.fromSmiles(s).toIsomericSmiles(), `${s} round trip`);
  }
  const d = docFromSmiles(get, '[CH2]'); assert.equal(d.atoms[0].rad, 2);
  assert.equal(docFromSmiles(get, '[CH3]').atoms[0].rad, 1, 'a methyl radical is still one electron');
  for (const f of ['cml', 'mrv', 'cdxml']) assert.equal(F.read(f, F.write(f, d)).atoms[0].rad, 2, f);
});

test('H rows on carbons keep clear of nearby labels in a crowded drawing', () => {
  // a quaternary carbon with three methyls around a CH2: the CH2's H go to its free side, not onto a methyl
  const d = docFromSmiles(get, 'CC(C)(C)CC'); d.showCH = 'all'; const ix = buildIndex(d);
  const boxes = d.atoms.map(a => { const it = layoutLabel(d, ix, a).items; return { x0: Math.min(...it.map(t => t.x)), x1: Math.max(...it.map(t => t.x + t.size * 0.6 * t.t.length)), y0: Math.min(...it.map(t => t.y - t.size * 0.7)), y1: Math.max(...it.map(t => t.y)) }; });
  let hits = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++){ const A = boxes[i], B = boxes[j]; if (A.x0 < B.x1 - 1 && B.x0 < A.x1 - 1 && A.y0 < B.y1 - 1 && B.y0 < A.y1 - 1) hits++; }
  assert.equal(hits, 0);
  // an uncrowded end carbon keeps its usual place: CH3 written to the right of a bond from the left
  const e = docFromSmiles(get, 'CC'); e.showCH = 'end'; const eix = buildIndex(e), right = e.atoms.find(a => a.x > Math.min(...e.atoms.map(q => q.x)));
  assert.deepEqual(plain(layoutLabel(e, eix, right).items.map(t => t.t)), ['C', 'H', '3']);
});
