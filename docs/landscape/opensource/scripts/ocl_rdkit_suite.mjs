// ocl_rdkit_suite.mjs
// Runs Lone Pair's edge-case suite (docs/landscape/test-suite.md, section A plus
// C7, D1, D2, D3) against OpenChemLib JS and RDKit.js (MinimalLib) in Node.
//
// Setup (in any folder):
//   npm init -y && npm install openchemlib @rdkit/rdkit
//   ENGINES_DIR=$PWD node ocl_rdkit_suite.mjs [--json out.json]
// ENGINES_DIR defaults to the current directory; it must contain node_modules.
// Tested with openchemlib 9.25.2 and @rdkit/rdkit 2026.9.1 on Node 20 and 22.

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

const ENGINES_DIR = process.env.ENGINES_DIR || process.cwd();
const req = createRequire(ENGINES_DIR + '/package.json');
const OCL = (await import(pathToFileURL(req.resolve('openchemlib')).href)).default;
const RDKit = await req('@rdkit/rdkit')();
const { Molecule } = OCL;

// ---------- cases ----------
function buildPeptide() {
  // L-residues written N[C@@H](R)C(=O); 40 residues, about 300 heavy atoms.
  const side = { G: null, A: 'C', S: 'CO', F: 'Cc1ccccc1', K: 'CCCCN', E: 'CCC(=O)O', V: 'C(C)C', L: 'CC(C)C' };
  const seq = 'GASFKEVLAFKESVLGAFKEVLSAFKEGVLSAFKEVLAGF';
  let s = '';
  for (const r of seq) s += side[r] ? `N[C@@H](${side[r]})C(=O)` : 'NCC(=O)';
  return { smiles: s + 'O', seq };
}
const pep = buildPeptide();
const CAFFEINE = 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C';
const cases = [
  ['A1', 'CCO'], ['A2', 'c1ccccc1'], ['A3', 'C1=CC=CC=C1'], ['A4', 'c1ccc2ccccc2c1'],
  ['A5', 'c1cc[nH]c1'], ['A6', 'C[C@H](N)C(=O)O'], ['A7a', 'F/C=C/F'], ['A7b', 'F/C=C\\F'],
  ['A8', '[NH4+].[Cl-]'], ['A9', 'C[N+](=O)[O-]'], ['A10', 'CS(=O)(=O)C'], ['A11', '[13CH4]'],
  ['A12', '[CH3]'], ['A13-3', 'C1CC1'], ['A13-12', 'C1CCCCCCCCCCC1'],
  ['A14', 'C12C3C4C1C5C2C3C45'], ['A15', '[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1'],
  ['A16', 'CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O', 'rxn'],
  ['A17a', 'CC1=CC=CC=C1'], ['A17b', 'Cc1ccccc1'],
  ['A18', 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'],
  ['A19a', 'xyz'], ['A19b', 'C1CC'],
  ['A20', pep.smiles],
  ['D1-3', CAFFEINE],
];

// ---------- helpers ----------
const ms = (t0) => +(performance.now() - t0).toFixed(1);
const ELEM = ['', 'H', 'He', 'Li', 'Be', 'B', 'C', 'N', 'O', 'F', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'P', 'S', 'Cl', 'Ar', 'K', 'Ca',
  'Sc', 'Ti', 'V', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge', 'As', 'Se', 'Br', 'Kr'];
ELEM[53] = 'I';
function hill(counts) {
  const keys = Object.keys(counts);
  const order = counts.C ? ['C', 'H', ...keys.filter((k) => k !== 'C' && k !== 'H').sort()] : keys.sort();
  return order.filter((k) => counts[k]).map((k) => k + (counts[k] > 1 ? counts[k] : '')).join('');
}
// Layout quality from 2D coords: smallest non-bonded atom distance / median bond length.
function layoutScore(xy, bonds) {
  if (xy.length < 3 || !bonds.length) return null;
  const bl = bonds.map(([a, b]) => Math.hypot(xy[a][0] - xy[b][0], xy[a][1] - xy[b][1])).sort((p, q) => p - q);
  const med = bl[bl.length >> 1];
  const bonded = new Set(bonds.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`));
  let min = Infinity;
  for (let i = 0; i < xy.length; i++)
    for (let j = i + 1; j < xy.length; j++) {
      if (bonded.has(`${i}-${j}`)) continue;
      min = Math.min(min, Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]));
    }
  return Number.isFinite(min) ? +(min / med).toFixed(2) : null;
}
function parseMolblockXY(mb) {
  const L = mb.split('\n');
  const [na, nb] = [parseInt(L[3].slice(0, 3)), parseInt(L[3].slice(3, 6))]; // fixed-width V2000 counts
  const xy = [], bonds = [];
  for (let i = 0; i < na; i++) xy.push([parseFloat(L[4 + i].slice(0, 10)), parseFloat(L[4 + i].slice(10, 20))]);
  for (let i = 0; i < nb; i++) { const l = L[4 + na + i]; bonds.push([parseInt(l.slice(0, 3)) - 1, parseInt(l.slice(3, 6)) - 1]); }
  return { xy, bonds };
}

// ---------- OpenChemLib ----------
function oclCanon(m) { return m.toIsomericSmiles(); }
function runOCL(id, smi, kind) {
  const r = { engine: 'OCL' };
  const t0 = performance.now();
  try {
    if (kind === 'rxn') {
      const rx = OCL.Reaction.fromSmiles(smi);
      r.ok = true; r.smiles = rx.toSmiles();
      r.note = `reactants=${rx.getReactants()} products=${rx.getProducts()}`;
      r.ms = ms(t0); return r;
    }
    const m = Molecule.fromSmiles(smi); // throws on bad input; invents 2D coords
    r.parseMs = ms(t0);
    r.ok = true;
    r.smiles = oclCanon(m);
    r.idcode = m.getIDCode();
    const f = m.getMolecularFormula();
    r.formula = f.formula; r.mw = +f.relativeWeight.toFixed(2); r.exact = +f.absoluteWeight.toFixed(4);
    r.getMolweight = m.getMolweight();
    m.ensureHelperArrays(Molecule.cHelperCIP);
    const cip = [], ez = [];
    for (let i = 0; i < m.getAtoms(); i++) {
      const p = m.getAtomCIPParity(i);
      if (p === Molecule.cAtomCIPParityRorM) cip.push(`${i}R`);
      else if (p === Molecule.cAtomCIPParitySorP) cip.push(`${i}S`);
      else if (p === Molecule.cAtomCIPParityProblem) cip.push(`${i}?`);
    }
    for (let b = 0; b < m.getBonds(); b++) {
      const p = m.getBondCIPParity(b);
      if (p === Molecule.cBondCIPParityEorP) ez.push('E');
      else if (p === Molecule.cBondCIPParityZorM) ez.push('Z');
    }
    r.cip = cip.join(' '); r.ez = ez.join(' ');
    r.cipS = cip.filter((c) => c.endsWith('S')).length; r.cipR = cip.filter((c) => c.endsWith('R')).length;
    r.arom = Array.from({ length: m.getAtoms() }, (_, i) => m.isAromaticAtom(i)).filter(Boolean).length;
    r.frags = m.getFragments().length;
    r.rad = Array.from({ length: m.getAllAtoms() }, (_, i) => m.getAtomRadical(i)).filter(Boolean).length;
    // molfile round trip
    const t1 = performance.now();
    const mb = m.toMolfile();
    const m2 = Molecule.fromMolfile(mb);
    r.molRT = oclCanon(m2) === r.smiles ? 'same' : `DIFF ${oclCanon(m2)}`;
    r.molfile = mb;
    // layout quality from OCL's own coordinates
    const xy = [], bonds = [];
    for (let i = 0; i < m.getAllAtoms(); i++) xy.push([m.getAtomX(i), m.getAtomY(i)]);
    for (let b = 0; b < m.getAllBonds(); b++) bonds.push([m.getBondAtom(0, b), m.getBondAtom(1, b)]);
    r.layout = layoutScore(xy, bonds);
    const t2 = performance.now();
    const svg = m.toSVG(400, 300);
    r.svgMs = ms(t2); r.svgBytes = svg.length; r.svgText = /<text/.test(svg);
    r.ms = ms(t0);
    r.inchikey = 'n/a (no InChI in OCL)';
  } catch (e) { r.ok = false; r.error = String(e.message || e).slice(0, 80); r.ms = ms(t0); }
  return r;
}

// ---------- RDKit ----------
function rdFormula(mol) {
  const j = JSON.parse(mol.get_json());
  const d = j.defaults.atom, counts = {};
  for (const a of j.molecules[0].atoms) {
    const z = a.z ?? d.z, iso = a.isotope ?? d.isotope;
    const sym = (iso ? `[${iso}${ELEM[z]}]` : ELEM[z]);
    counts[sym] = (counts[sym] || 0) + 1;
    counts.H = (counts.H || 0) + (a.impHs ?? d.impHs);
  }
  const rad = j.molecules[0].atoms.filter((a) => (a.nRad ?? d.nRad) > 0).length;
  return { formula: hill(counts), rad };
}
function rdMol(s) { const m = RDKit.get_mol(s); if (!m) return null; if (m.is_valid && !m.is_valid()) { m.delete(); return null; } return m; }
function runRD(id, smi, kind) {
  const r = { engine: 'RDKit' };
  const t0 = performance.now();
  try {
    if (kind === 'rxn') {
      const rx = RDKit.get_rxn(smi);
      r.ok = !!rx; r.smiles = smi; r.note = rx ? `svg ${rx.get_svg().length} B` : 'null';
      rx && rx.delete(); r.ms = ms(t0); return r;
    }
    const m = rdMol(smi);
    r.parseMs = ms(t0);
    if (!m) { r.ok = false; r.error = 'get_mol returned null'; r.ms = ms(t0); return r; }
    r.ok = true;
    r.smiles = m.get_smiles();
    const desc = JSON.parse(m.get_descriptors());
    r.mw = +desc.amw.toFixed(2); r.exact = +desc.exactmw.toFixed(4);
    const f = rdFormula(m); r.formula = f.formula; r.rad = f.rad;
    const st = JSON.parse(m.get_stereo_tags());
    r.cip = st.CIP_atoms.map(([i, c]) => `${i}${c.replace(/[()]/g, '')}`).join(' ');
    r.ez = st.CIP_bonds.map((b) => b[2].replace(/[()]/g, '')).join(' ');
    r.cipS = st.CIP_atoms.filter((c) => c[1] === '(S)').length; r.cipR = st.CIP_atoms.filter((c) => c[1] === '(R)').length;
    r.arom = (r.smiles.match(/(?<![A-Z])[cnosp](?![a-z])|\[(?:\d*)(?:c|n|o|s|p|se)[^\]]*\]/g) || []).length;
    r.frags = r.smiles.split('.').length;
    const ik = (() => { try { const inchi = m.get_inchi(); return RDKit.get_inchikey_for_inchi(inchi); } catch { return 'error'; } })();
    r.inchikey = ik;
    const t1 = performance.now();
    const mb = m.get_molblock(); // computes 2D coords if the mol has none
    const m2 = rdMol(mb);
    r.molRT = m2 ? (m2.get_smiles() === r.smiles ? 'same' : `DIFF ${m2.get_smiles()}`) : 'reparse failed';
    m2 && m2.delete();
    r.molfile = mb;
    const { xy, bonds } = parseMolblockXY(mb);
    r.layout = layoutScore(xy, bonds);
    const t2 = performance.now();
    const svg = m.get_svg(400, 300);
    r.svgMs = ms(t2); r.svgBytes = svg.length; r.svgText = /<text/.test(svg);
    r.ms = ms(t0);
    m.delete();
  } catch (e) { r.ok = false; r.error = String(e.message || e).slice(0, 80); r.ms = ms(t0); }
  return r;
}

// ---------- cross checks: each engine reads the other's molfile ----------
function crossCheck(o, d) {
  const out = {};
  if (o.molfile) { const m = rdMol(o.molfile); out.oclMolInRDKit = m ? m.get_smiles() : 'fail'; m && m.delete(); }
  if (d.molfile) { try { out.rdMolInOCL = Molecule.fromMolfile(d.molfile).toIsomericSmiles(); } catch { out.rdMolInOCL = 'fail'; } }
  // canonicalise everything through RDKit so the strings are comparable
  const canon = (s) => { const m = s && rdMol(s); const c = m ? m.get_smiles() : null; m && m.delete(); return c; };
  out.oclSmilesViaRDKit = canon(o.smiles);
  out.rdMolInOCLViaRDKit = canon(out.rdMolInOCL);
  out.agree = !!o.ok === !!d.ok && (!o.ok || (out.oclSmilesViaRDKit === d.smiles && out.oclMolInRDKit === d.smiles && out.rdMolInOCLViaRDKit === d.smiles));
  return out;
}

// ---------- y-axis probe (REVIEW.md item 14) ----------
function yAxisProbe() {
  const m = Molecule.fromSmiles('C[C@H](N)C(=O)O');
  const internalY = m.getAtomY(2); // N
  const mbY = parseFloat(m.toMolfile().split('\n')[4 + 2].slice(10, 20));
  return { oclInternalY_N: +internalY.toFixed(3), oclMolfileY_N: mbY, flipped: Math.sign(internalY) === -Math.sign(mbY) };
}

// ---------- run ----------
const results = [];
for (const [id, smi, kind] of cases) {
  const o = runOCL(id, smi, kind), d = runRD(id, smi, kind);
  const x = kind === 'rxn' ? {} : crossCheck(o, d);
  results.push({ id, smi: id === 'A20' ? `(peptide ${pep.seq}, ${smi.length} chars)` : smi, ocl: o, rd: d, x });
}
const yProbe = yAxisProbe();

const strip = (r) => { const { molfile, ...rest } = r; return rest; };
const jsonIdx = process.argv.indexOf('--json');
if (jsonIdx > 0) writeFileSync(process.argv[jsonIdx + 1], JSON.stringify({ versions: { ocl: '9.25.2', rdkit: RDKit.version() }, yProbe, results: results.map((r) => ({ ...r, ocl: strip(r.ocl), rd: strip(r.rd) })) }, null, 2));

console.log(`RDKit ${RDKit.version()} | node ${process.version}`);
console.log('y-axis probe:', JSON.stringify(yProbe));
const cell = (v) => (v === undefined || v === null || v === '' ? '-' : String(v)).replace(/\|/g, '\\|');
console.log('\n| ID | Engine | OK | Canonical SMILES | Mol RT | Formula | MW | Exact | CIP | E/Z | Rad | Layout | ms | Error/Note |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const { id, ocl, rd } of results)
  for (const r of [ocl, rd]) {
    const smi = id === 'A20' && r.smiles ? `(${r.smiles.length} chars)` : r.smiles;
    const cip = id === 'A20' ? `${r.cipS ?? 0}S/${r.cipR ?? 0}R` : r.cip;
    console.log(`| ${id} | ${r.engine} | ${r.ok ? 'yes' : 'no'} | ${cell(smi)} | ${cell(r.molRT)} | ${cell(r.formula)} | ${cell(r.mw)} | ${cell(r.exact)} | ${cell(cip)} | ${cell(r.ez)} | ${cell(r.rad)} | ${cell(r.layout)} | ${cell(r.ms)} | ${cell(r.error || r.note)} |`);
  }
console.log('\nCross-engine (RDKit canonical form of each path):');
for (const { id, x } of results) if (x && 'agree' in x) console.log(`${id.padEnd(7)} agree=${x.agree} oclSmi->RD=${x.oclSmilesViaRDKit} oclMol->RD=${x.oclMolInRDKit} rdMol->OCL->RD=${x.rdMolInOCLViaRDKit}`);
const a6 = results.find((r) => r.id === 'A6'); const a20 = results.find((r) => r.id === 'A20');
console.log(`\nC7 InChIKey A6 (RDKit): ${a6.rd.inchikey}  expected QNAYBMKLOCPYGJ-REOHCLBHSA-N  OCL: ${a6.ocl.inchikey}`);
console.log(`A20 heavy-atom formula: OCL ${a20.ocl.formula} / RDKit ${a20.rd.formula}`);
for (const r of [a20.ocl, a20.rd]) console.log(`A20 ${r.engine}: parse+coords ${r.parseMs} ms, svg ${r.svgMs} ms, total ${r.ms} ms, layout ${r.layout}, svg ${r.svgBytes} B, text-as-<text> ${r.svgText}`);
const a6s = [a6.ocl, a6.rd]; for (const r of a6s) console.log(`A6 SVG ${r.engine}: ${r.svgBytes} B, uses <text>: ${r.svgText}`);

// ---------- extras: findings that the main table does not show ----------
console.log('\n--- extras ---');
const closePairs = (mb, cut = 0.4) => {
  const { xy, bonds } = parseMolblockXY(mb); let n = 0;
  for (let i = 0; i < xy.length; i++) for (let j = i + 1; j < xy.length; j++) if (Math.hypot(xy[i][0] - xy[j][0], xy[i][1] - xy[j][1]) < cut) n++;
  return n;
};
// 1. A20 again: warm OCL, and RDKit native depictor vs CoordGen, coordinates computed once.
for (let k = 0; k < 2; k++) { const t = performance.now(); const p = Molecule.fromSmiles(pep.smiles); const a = ms(t); const t2 = performance.now(); p.toSVG(800, 600); console.log(`A20 OCL warm run ${k}: parse+coords ${a} ms, svg ${ms(t2)} ms, atom pairs < 0.4 A apart: ${closePairs(p.toMolfile())}`); }
for (const cg of [false, true]) {
  RDKit.prefer_coordgen(cg);
  const p = RDKit.get_mol(pep.smiles); const t = performance.now(); p.set_new_coords(cg); const a = ms(t);
  const t2 = performance.now(); p.get_svg(800, 600); const b = ms(t2);
  console.log(`A20 RDKit coordgen=${cg}: set_new_coords ${a} ms, svg ${b} ms, atom pairs < 0.4 A apart: ${closePairs(p.get_molblock())}`);
  p.delete();
}
RDKit.prefer_coordgen(false);
// 2. Chiral flag: RDKit writes V2000 chiral flag 0; OCL reads 0 as "racemic/relative" (ESR AND group).
{
  const mb = RDKit.get_mol('C[C@H](N)C(=O)O').get_molblock();
  const o = Molecule.fromMolfile(mb);
  const flagged = Molecule.fromMolfile(mb.replace(/^(.{12})  0(.*V2000)$/m, '$1  1$2'));
  console.log(`chiral flag: RDKit counts line "${mb.split('\n')[3]}" -> OCL SMILES ${o.toIsomericSmiles()} (ESR type ${o.getAtomESRType(1)}); with flag=1 -> ${flagged.toIsomericSmiles()}`);
}
// 3. Kekulization / valence strictness.
for (const smi of ['c1cccc1', 'n1cccc1', 'c1ccc[nH]c1', 'C[N](=O)=O', 'F[Cl](F)F', 'C[Si](C)(C)(C)(C)C']) {
  const r = rdMol(smi); let o; try { o = Molecule.fromSmiles(smi).toIsomericSmiles(); } catch (e) { o = 'ERROR ' + String(e.message).slice(0, 50); }
  console.log(`strictness ${smi.padEnd(20)} RDKit: ${r ? r.get_smiles() : 'rejected (null)'} | OCL: ${o}`); r && r.delete();
}
