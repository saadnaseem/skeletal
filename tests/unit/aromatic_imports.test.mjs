// Spec 002 (aromatic imports): molfiles that write aromatic bonds as bond type 4 (CDK, Open Babel, some ELN exports) are read
// as alternating single and double bonds with the same converter as ChemDraw files (kekulize in formats.js), and rings that
// can't alternate are reported. Test molfiles are made from SMILES by OpenChemLib, with the aromatic bonds rewritten as type 4.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, OCL } from './load.mjs';
const get = loadModules();
const molfileMol = get('molfileMol'), fromOCL = get('fromOCL'), scaleLayout = get('scaleLayout'), newDoc = get('newDoc');
const toOCL = get('toOCL'), buildIndex = get('buildIndex'), MS = get('MS'), F = get('FORMATS');
const kekulizeFragment = get('typeof kekulizeFragment==="function" ? kekulizeFragment : null');

const pad = (v, n) => String(v).padStart(n);
// opts: hcount {atomIndex: n} sets the V2000 hhh column (n+1) or V3000 HCOUNT; addH [atomIndex] draws an H atom on that atom
function type4(smi, { v3 = false, hcount = {}, addH = [] } = {}){
  const m = OCL.Molecule.fromSmiles(smi); m.inventCoordinates(); m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const arom = (a, b) => { const k = m.getBond(a - 1, b - 1); return k >= 0 && m.isAromaticBond(k); };
  if (!v3){
    const L = m.toMolfile().split('\n'), c = L[3], na = +c.slice(0, 3), nb = +c.slice(3, 6);
    for (let i = 0; i < na; i++) if (hcount[i] != null) L[4 + i] = L[4 + i].slice(0, 42) + pad(hcount[i] + 1, 3) + L[4 + i].slice(45);
    for (let k = 0; k < nb; k++){ const l = L[4 + na + k]; if (arom(+l.slice(0, 3), +l.slice(3, 6))) L[4 + na + k] = l.slice(0, 6) + '  4' + l.slice(9); }
    const hs = addH.map((i, j) => { const x = m.getAtomX(i) * 1.5 + 0.5, y = -m.getAtomY(i) * 1.5 + 0.5;
      return [`${pad(x.toFixed(4), 10)}${pad(y.toFixed(4), 10)}    0.0000 H   0  0  0  0  0  0  0  0  0  0  0  0`, `${pad(i + 1, 3)}${pad(na + j + 1, 3)}  1  0  0  0  0`]; });
    L[3] = pad(na + hs.length, 3) + pad(nb + hs.length, 3) + c.slice(6);
    L.splice(4 + na + nb, 0, ...hs.map(h => h[1])); L.splice(4 + na, 0, ...hs.map(h => h[0]));
    return L.join('\n');
  }
  let i = 0;
  return m.toMolfileV3().split('\n').map(l => {
    let r;
    if ((r = /^M {2}V30 (\d+) ([A-Z][a-z]?) /.exec(l)) && !/COUNTS/.test(l)){ const h = hcount[i++]; return h != null ? `${l} HCOUNT=${h || -1}` : l; }
    if ((r = /^M {2}V30 (\d+) (\d+) (\d+) (\d+)(.*)$/.exec(l)) && arom(+r[3], +r[4])) return `M  V30 ${r[1]} 4 ${r[3]} ${r[4]}${r[5]}`;
    return l;
  }).join('\n');
}
// the fragment the app inserts for a molfile (the molfile branch of tryLoadText), and how many rings couldn't alternate
function read(txt){
  const { mol, hcount } = molfileMol(txt); scaleLayout(mol);
  const f = fromOCL(mol), rings = kekulizeFragment(f, hcount);
  return { f, rings };
}
function asDoc(f){
  const d = newDoc(); let id = 1;
  f.atoms.forEach(a => { d.atoms.push({ ...a, id: id++ }); });
  f.bonds.forEach(b => d.bonds.push({ id: id++, a: b.a + 1, b: b.b + 1, order: b.order, stereo: b.stereo, ...(b.kind ? { kind: b.kind } : {}) }));
  d.nid = id; return d;
}
const oclOf = f => { const d = asDoc(f); const m = toOCL(d, buildIndex(d)).mol; m.ensureHelperArrays(OCL.Molecule.cHelperParities); return m; };
const formula = f => MS.hill(MS.composition(oclOf(f)).counts);
const smiFormula = s => MS.hill(MS.composition(OCL.Molecule.fromSmiles(s)).counts);
const canon = s => OCL.Molecule.fromSmiles(s).getCanonizedIDCode(0);

const GOOD = {
  benzene: ['c1ccccc1'], pyridine: ['c1ccncc1'], naphthalene: ['c1ccc2ccccc2c1'], furan: ['c1ccoc1'], thiophene: ['c1ccsc1'],
  pyrrole: ['c1cc[nH]c1', { 3: 1 }], indole: ['c1ccc2[nH]ccc2c1', { 4: 1 }], imidazole: ['c1cnc[nH]1', { 4: 1 }],
  pyridinium: ['C[n+]1ccccc1'], 'phenylboronic acid': ['OB(O)c1ccccc1'], 'N-methylpyrrole': ['Cn1cccc1'],
};

test('TG-01 kekulizeFragment exists, and kekulize is exported', () => {
  assert.equal(typeof kekulizeFragment, 'function');
  assert.equal(typeof F.kekulize, 'function');
});

test('FR-001 type-4 molfiles (V2000 and V3000) open as the same molecule as their SMILES', () => {
  for (const [name, [s, hcount = {}]] of Object.entries(GOOD)) for (const v3 of [false, true]){
    const tag = `${name} ${v3 ? 'V3000' : 'V2000'}`, { f, rings } = read(type4(s, { v3, hcount }));
    assert.equal(rings, 0, tag);
    assert.ok(f.bonds.every(b => b.order === 1 || b.order === 2 || b.order === 3), tag);
    assert.equal(formula(f), smiFormula(s), tag);
    assert.equal(oclOf(f).getCanonizedIDCode(0), canon(s), tag);
  }
});

test('FR-001 the type-4 molfile really has type-4 bonds (the test fixture is right)', () => {
  assert.match(type4('c1ccccc1'), /\n {2}\d {2}\d {2}4 /);
  assert.match(type4('c1ccccc1', { v3: true }), /M {2}V30 \d+ 4 /);
});

test('FR-001, FR-002 pyrrole with its N–H drawn as an H atom opens as pyrrole', () => {
  const { f, rings } = read(type4('c1cc[nH]c1', { addH: [3] }));
  assert.equal(rings, 0); assert.equal(formula(f), 'C4H5N');
  assert.equal(f.atoms.filter(a => a.el === 'H').length, 1);
});

test('FR-003 rings that cannot alternate are reported, one count per ring system', () => {
  for (const v3 of [false, true]){
    assert.equal(read(type4('c1cc[nH]c1', { v3 })).rings, 1, 'pyrrole, no H count');
    assert.equal(read(type4('c1ccc2[nH]ccc2c1', { v3 })).rings, 1, 'indole, no H count');
    assert.equal(read(type4('c1cc[nH]c1.c1cc[nH]c1', { v3 })).rings, 2, 'two pyrroles');
  }
  assert.equal(read(ringMol(5)).rings, 1, 'C5 ring');
  assert.equal(read(ringMol(6)).rings, 0, 'C6 ring');
});
// a hand-written V2000 ring of n carbons joined by type-4 bonds (OpenChemLib can't make c1cccc1 from SMILES)
function ringMol(n){
  const at = Array.from({ length: n }, (_, i) => `${pad(Math.cos(2 * Math.PI * i / n).toFixed(4), 10)}${pad(Math.sin(2 * Math.PI * i / n).toFixed(4), 10)}    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0`);
  const bo = Array.from({ length: n }, (_, i) => `${pad(i + 1, 3)}${pad((i + 1) % n + 1, 3)}  4  0  0  0  0`);
  return ['', '', '', `${pad(n, 3)}${pad(n, 3)}  0  0  0  0  0  0  0  0999 V2000`, ...at, ...bo, 'M  END'].join('\n');
}

test('FR-002 charges, isotopes, coordinates and wedges are kept', () => {
  const s = 'C[C@H](O)c1ccc([N+](=O)[O-])c([13CH3])c1', txt = type4(s), { mol } = molfileMol(txt);
  const { f, rings } = read(txt);
  assert.equal(rings, 0);
  assert.equal(f.bonds.filter(b => b.stereo === 'wedge' || b.stereo === 'hash').length, 1);
  assert.deepEqual([...f.atoms.map(a => a.charge)].filter(Boolean).sort(), [-1, 1]);
  assert.equal(f.atoms.filter(a => a.iso === 13).length, 1);
  assert.equal(formula(f), smiFormula(s));
  assert.equal(oclOf(f).getCanonizedIDCode(0), canon(s)); // same stereo too
  scaleLayout(mol); // coordinates: the fragment keeps the file's layout (same as fromOCL of the file)
  for (let i = 0; i < mol.getAllAtoms(); i++) assert.ok(Math.abs(f.atoms[i].x - fromOCL(mol).atoms[i].x) < 1e-9);
});

test('FR-005 Kekulé molfiles give exactly the fragment they gave before', () => {
  for (const s of ['c1ccccc1', 'c1cc[nH]c1', 'CC(=O)Oc1ccccc1C(=O)O', 'C[C@H](N)C(=O)O', 'c1ccc2ccccc2c1']){
    const txt = OCL.Molecule.fromSmiles(s).toMolfile(), { mol } = molfileMol(txt), m2 = OCL.Molecule.fromMolfile(txt);
    scaleLayout(mol); scaleLayout(m2);
    const { f, rings } = read(txt);
    assert.equal(rings, 0, s);
    assert.equal(JSON.stringify(f), JSON.stringify(fromOCL(m2)), s);
  }
});

test('FR-005 a Kekulé molfile with a hydrogen count column reads as before', () => {
  const txt = type4('c1cc[nH]c1', { hcount: { 3: 1 } }).replace(/ {2}4 {2}0/g, '  1  0'); // hhh set, no type-4 bonds
  const { hcount } = molfileMol(txt);
  assert.equal(hcount.size, 0); // only read when the file has aromatic bonds
});

test('CON-003 SMILES never gives a 1.5 bond (fromOCL only marks molfile delocalized bonds)', () => {
  // the ring templates of the app (src/app.js, not loaded here) and the NMR guide examples
  const TEMPLATES = ['c1ccccc1', 'c1ccncc1', 'c1ccc2[nH]ccc2c1', 'c1cnc[nH]1', 'c1ncc2nc[nH]c2n1', 'c1cncnc1', 'c1ccc2ccccc2c1', 'Nc1ncnc2[nH]cnc12'];
  const all = [...TEMPLATES, ...get('NMRG').EXAMPLES.map(e => e.smiles), 'c1cc[nH]c1', 'O=c1cccc[nH]1', 'OB(O)c1ccccc1', 'c1ccc2c(c1)ccc1ccccc12'];
  for (const s of all){ const m = get('smilesMol')(s); m.inventCoordinates(); assert.ok(fromOCL(m).bonds.every(b => b.order !== 1.5), s); }
});

test('kekulize returns the atoms it could not match', () => {
  const ring = (n, els) => ({ atoms: Array.from({ length: n }, (_, i) => ({ id: i + 1, el: els[i] || 'C', charge: 0 })),
    bonds: Array.from({ length: n }, (_, i) => ({ id: 100 + i, a: i + 1, b: (i + 1) % n + 1, order: 1.5 })) });
  const b = ring(6, []); assert.deepEqual([...F.kekulize(b.atoms, b.bonds)], []);
  const p = ring(5, ['N']); assert.equal(F.kekulize(p.atoms, p.bonds).length, 1);
  const c = ring(5, []); assert.equal(F.kekulize(c.atoms, c.bonds).length, 1);
});

test('a large fused aromatic system (coronene) converts in full', () => {
  const s = 'c1cc2ccc3ccc4ccc5ccc6ccc1c1c2c3c4c5c61', { f, rings } = read(type4(s));
  assert.equal(rings, 0); assert.equal(formula(f), 'C24H12');
});
