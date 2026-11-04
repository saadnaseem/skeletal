// Runs test-suite.md section A (SMILES) against Kekule.js in Node.
//
// Usage:  node kekule_suite.mjs /path/to/Kekule.js/dist  [--json out.json]
//
// Kekule.js has NO native SMILES reader (src/io/smiles/kekule.io.smiles.js only
// registers Kekule.IO.SmilesMolWriter). SMILES input goes through the OpenBabel
// WASM build in dist/extra/openbabel.{js,wasm,data}. That build is compiled for
// the web (file packager refuses to run under Node, onRuntimeInitialized is
// replaced by a DOM event dispatcher), so loadKekuleWithOB() below shims it.
//
// For each case three paths are recorded:
//   K    : Kekule.IO.loadFormatData(smi,'smi')  -- what the Composer does on paste/open
//          (OB reads SMILES, writes a 0D molfile, Kekule's MdlMolReader reads that)
//   K2D  : K + Kekule.OpenBabel.StructUtils.generate2DStructure  -- what the
//          displayer's "auto generate coords" step does
//   OB2D : OpenBabel reads SMILES and runs its own Gen2D op, writes a 2D molfile
//          with wedges, then Kekule's native MdlMolReader + SmilesMolWriter
//          (best case: tests Kekule's own stereo perception from wedges)
// Canonical SMILES, formula, molfile round trip all use Kekule's native writers.

import fs from 'fs';
import path from 'path';
import {loadKekuleWithOB, makeObCan} from './kekule_ob_loader.mjs';

const KDIST = path.resolve(process.argv[2] || './dist');
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;

const t0 = Date.now();
const Kekule = await loadKekuleWithOB(KDIST);
const loadMs = Date.now() - t0;
const OBM = Kekule.OpenBabel.getModule();
const obCan = makeObCan(Kekule);

const H = 1.00794;
function mw(mol) {
  // Kekule has no molecular-weight API; sum atom masses (isotope-aware) + implicit H.
  let m = 0;
  for (const a of mol.getFlattenedLeafNodes ? mol.getFlattenedLeafNodes() : mol.getNodes()) {
    if (!a.getAtomicMass) continue;
    m += a.getAtomicMass() || 0;
    m += (a.getImplicitHydrogenCount ? a.getImplicitHydrogenCount() : 0) * H;
  }
  return +m.toFixed(2);
}
const kSmiles = mol => new Kekule.IO.SmilesMolWriter().writeData(mol, Kekule.IO.ChemDataType.TEXT, 'smi');
const kMol = mol => new Kekule.IO.MdlMolWriter().writeData(mol, Kekule.IO.ChemDataType.TEXT, 'mol');
const kReadMol = s => new Kekule.IO.MdlMolReader().readData(s, Kekule.IO.ChemDataType.TEXT, 'mol');
const stereoMarks = s => (s && s.match(/@@|@|\/|\\/g)) || [];
// Independent check: canonicalise both the input and Kekule's output with OpenBabel's 'can' writer.
// Equal strings mean same constitution AND same stereo (OB is the referee, not Kekule).

function obTo2DMol(smi) {
  const conv = new OBM.ObConversionWrapper();
  try {
    conv.setInFormatId('smi');
    const mol = new OBM.OBMol();
    conv.readString(mol, smi);
    if (mol.NumAtoms() === 0) throw new Error('OB parsed 0 atoms');
    OBM.OBOp.FindType('Gen2D').Do(mol, '');
    conv.setOutFormatId('mol');
    const out = conv.writeString(mol, false);
    const can = (() => { conv.setOutFormatId('can'); return conv.writeString(mol, false).trim(); })();
    mol['delete']();
    return {molfile: out, obCan: can};
  } finally { conv['delete'](); }
}

function describeAtoms(mol) {
  const notes = [];
  for (const a of mol.getFlattenedLeafNodes ? mol.getFlattenedLeafNodes() : mol.getNodes()) {
    if (a.getCharge && a.getCharge()) notes.push(`${a.getSymbol()}${a.getCharge() > 0 ? '+' : ''}${a.getCharge()}`);
    if (a.getMassNumber && a.getMassNumber()) notes.push(`${a.getMassNumber()}${a.getSymbol()}`);
    if (a.getRadical && a.getRadical()) notes.push(`${a.getSymbol()}radical=${a.getRadical()}`);
  }
  return notes.join(' ');
}

function hasOverlap(mol) {
  const pts = mol.getNodes().map(n => n.getCoord2D ? n.getCoord2D() : {x: 0, y: 0});
  let min = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
    min = Math.min(min, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  return pts.length > 1 ? +min.toFixed(3) : null;
}

function peptide(n) {
  const res = ['N[C@@H](C)C(=O)', 'NCC(=O)', 'N[C@@H](CO)C(=O)', 'N[C@@H](CC(C)C)C(=O)', 'N[C@@H](Cc1ccccc1)C(=O)'];
  let s = '';
  for (let i = 0; i < n; i++) s += res[i % res.length];
  return s + 'O';
}

const cases = [
  ['A1', 'CCO'], ['A2', 'c1ccccc1'], ['A3', 'C1=CC=CC=C1'], ['A4', 'c1ccc2ccccc2c1'],
  ['A5', 'c1cc[nH]c1'], ['A6', 'C[C@H](N)C(=O)O'], ['A7a', 'F/C=C/F'], ['A7b', 'F/C=C\\F'],
  ['A8', '[NH4+].[Cl-]'], ['A9', 'C[N+](=O)[O-]'], ['A10', 'CS(=O)(=O)C'], ['A11', '[13CH4]'],
  ['A12', '[CH3]'], ['A13a', 'C1CC1'], ['A13b', 'C1CCCCCCCCCCC1'], ['A14', 'C12C3C4C1C5C2C3C45'],
  ['A15', '[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1'], ['A16', 'CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O'],
  ['A17a', 'CC1=CC=CC=C1'], ['A17b', 'Cc1ccccc1'],
  ['A18', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'], ['A19a', 'xyz'], ['A19b', 'C1CC'],
  ['A20', peptide(42)],
];

const rows = [];
for (const [id, smi] of cases) {
  const r = {id, input: smi.length > 60 ? smi.slice(0, 40) + `...(${smi.length} chars)` : smi};
  const t = Date.now();
  try {
    let tt = Date.now();
    const mol = Kekule.IO.loadFormatData(smi, 'smi');
    r.t_load = Date.now() - tt;
    if (!mol) throw new Error('loadFormatData returned null');
    r.cls = mol.getClassName();
    r.atoms = mol.getNodeCount();
    r.formula = mol.calcFormula ? mol.calcFormula().getText() : '';
    r.mw = mw(mol);
    r.atomNotes = describeAtoms(mol);
    tt = Date.now(); r.K_smiles = kSmiles(mol); r.t_smiles = Date.now() - tt;
    const mf = kMol(mol);
    r.K_molRT = kSmiles(kReadMol(mf));
    r.K_molRT_same = r.K_molRT === r.K_smiles;
    try {
      tt = Date.now();
      const m2 = Kekule.OpenBabel.StructUtils.generate2DStructure(mol, {});
      r.t_gen2d = Date.now() - tt;
      r.K2D_smiles = kSmiles(m2);
      r.K2D_minDist = hasOverlap(m2);
    } catch (e) { r.K2D_smiles = 'ERR ' + (e.message || e); }
  } catch (e) { r.K_error = String(e.message || e).slice(0, 120); }
  try {
    const {molfile, obCan} = obTo2DMol(smi);
    r.OB_can = obCan.split('\t')[0];
    const m3 = kReadMol(molfile);
    r.OB2D_smiles = kSmiles(m3);
    r.OB2D_molRT = kSmiles(kReadMol(kMol(m3)));
    r.OB2D_minDist = hasOverlap(m3);
    r.OB2D_wedges = (molfile.match(/^\s*\d+\s+\d+\s+\d\s+[16]\s*/mg) || []).length;
  } catch (e) { r.OB2D_error = String(e.message || e).slice(0, 120); }
  r.inCan = obCan(smi);
  const same = x => r.inCan == null ? null : obCan(x) === r.inCan;   // null: OB cannot parse the input either
  r.K_ok = same(r.K_smiles);
  r.K2D_ok = same(r.K2D_smiles);
  r.OB2D_ok = same(r.OB2D_smiles);
  r.stereo_in = stereoMarks(smi).length;
  r.stereo_K = stereoMarks(r.K_smiles).length;
  r.stereo_OB2D = stereoMarks(r.OB2D_smiles).length;
  r.ms = Date.now() - t;
  rows.push(r);
}

console.log(`Kekule ${Kekule.VERSION}; OpenBabel WASM loaded in ${loadMs} ms\n`);
for (const r of rows) {
  console.log(`[${r.id}] ${r.input}`);
  if (r.K_error) console.log(`   K     ERROR: ${r.K_error}`);
  else {
    console.log(`   K     ${r.cls} atoms=${r.atoms} formula=${r.formula} MW=${r.mw} ${r.atomNotes ? '(' + r.atomNotes + ')' : ''}`);
    console.log(`   K     smiles=${r.K_smiles}  molRT=${r.K_molRT_same ? 'same' : r.K_molRT}`);
    console.log(`   K2D   smiles=${r.K2D_smiles}  minAtomDist=${r.K2D_minDist}`);
  }
  if (r.OB2D_error) console.log(`   OB2D  ERROR: ${r.OB2D_error}`);
  else console.log(`   OB2D  smiles=${r.OB2D_smiles}  molRT=${r.OB2D_molRT === r.OB2D_smiles ? 'same' : r.OB2D_molRT}  wedgeBonds=${r.OB2D_wedges} minAtomDist=${r.OB2D_minDist}  (OB can: ${r.OB_can})`);
  console.log(`   stereo marks in/K/OB2D = ${r.stereo_in}/${r.stereo_K}/${r.stereo_OB2D}   identical to input by OB canonical: K=${r.K_ok} K2D=${r.K2D_ok} OB2D=${r.OB2D_ok}`);
  console.log(`   time ${r.ms} ms (load ${r.t_load}, smiles write ${r.t_smiles}, gen2D ${r.t_gen2d})`);
}
const same = (a, b) => { const x = rows.find(r => r.id === a), y = rows.find(r => r.id === b); return `K:${x.K_smiles === y.K_smiles} OB2D:${x.OB2D_smiles === y.OB2D_smiles}`; };
console.log(`\nA2==A3 canonical: ${same('A2', 'A3')}`);
console.log(`A17a==A17b canonical: ${same('A17a', 'A17b')}`);
console.log(`A7a!=A7b: K:${rows.find(r => r.id === 'A7a').K_smiles !== rows.find(r => r.id === 'A7b').K_smiles} OB2D:${rows.find(r => r.id === 'A7a').OB2D_smiles !== rows.find(r => r.id === 'A7b').OB2D_smiles}`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 2));
process.exit(0);
