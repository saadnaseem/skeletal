import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), buildIndex = get('buildIndex'), toOCL = get('toOCL'), sanitizeDoc = get('sanitizeDoc'), newDoc = get('newDoc'), OCL = get('OCL');

const smiles = d => { const e = F.expandDoc(d), m = toOCL(e, buildIndex(e)).mol; m.ensureHelperArrays(OCL.Molecule.cHelperParities); return m.toIsomericSmiles(); };
const asDoc = part => ({ ...newDoc(), ...part });
const withLabel = (smi, pick, el) => { const d = docFromSmiles(get, smi); pick(d).el = el; return d; };
function scheme() { // ethanol + acetic acid -> ethyl acetate, with conditions above the arrow
  const lay = (smi, x0) => { const p = docFromSmiles(get, smi), mx = Math.min(...p.atoms.map(a => a.x)), my = p.atoms.reduce((t, a) => t + a.y, 0) / p.atoms.length; p.atoms.forEach(a => { a.x += x0 - mx; a.y -= my; }); return p; };
  const parts = [lay('CCO', 0), lay('CC(=O)O', 60), lay('CCOC(C)=O', 200)];
  const d = newDoc(); let id = 1;
  for (const p of parts) { const m = new Map(); p.atoms.forEach(a => { m.set(a.id, id); d.atoms.push({ ...a, id: id++ }); }); p.bonds.forEach(b => d.bonds.push({ ...b, id: id++, a: m.get(b.a), b: m.get(b.b) })); }
  d.arrows.push({ id: id++, type: 'reaction', x1: 120, y1: 0, x2: 185, y2: 0 });
  d.texts.push({ id: id++, x: 152, y: -12, text: 'H2SO4' });
  d.pluses.push({ id: id++, x: 45, y: 0 }); d.nid = id;
  return d;
}
const READERS = F.list.filter(f => f.read).map(f => f.id);

test('format list covers the ChemDraw, MDL, CML, Marvin, JME, SMARTS and chemfig writers', () => {
  const ids = F.list.map(f => f.id);
  for (const id of ['cdxml', 'cdx', 'mol', 'molV3', 'sdf', 'rxn', 'rxnV3', 'cml', 'mrv', 'jme', 'smarts', 'chemfig']) assert.ok(ids.includes(id), id);
  assert.deepEqual([...READERS].sort(), ['cdx', 'cdxml', 'cml', 'mrv']);
});

test('every reader gives back the same structure, including stereo, charges and radicals', () => {
  for (const smi of ['CC(=O)Oc1ccccc1C(=O)O', 'C[C@H](N)C(=O)O', 'C/C=C/C', 'C[N+](C)(C)C', 'CC(=O)[O-]', 'C[CH2]', 'c1ccncc1']) {
    const d = docFromSmiles(get, smi), want = smiles(d);
    for (const f of READERS) assert.equal(smiles(asDoc(F.read(f, F.write(f, d)))), want, `${smi} via ${f}`);
  }
});

test('nicknames and generic labels survive ChemDraw files; CML expands nicknames into atoms', () => {
  const ome = withLabel('c1ccccc1C', d => d.atoms.find(a => d.bonds.filter(b => b.a === a.id || b.b === a.id).length === 1), 'OMe');
  for (const f of ['cdxml', 'cdx']) { const back = F.read(f, F.write(f, ome)); assert.ok(back.atoms.some(a => a.el === 'OMe'), f); assert.equal(smiles(asDoc(back)), smiles(ome)); }
  const cdxml = F.write('cdxml', ome);
  assert.match(cdxml, /NodeType="Nickname"/); assert.match(cdxml, /NodeType="ExternalConnectionPoint"/);
  assert.equal(smiles(asDoc(F.read('cml', F.write('cml', ome)))), 'COc1ccccc1');
  const r = withLabel('CCO', d => d.atoms[0], 'R1');
  const back = F.read('cdxml', F.write('cdxml', r));
  assert.match(F.write('cdxml', r), /GenericNickname="R1"/); assert.ok(back.atoms.some(a => a.el === 'R1'));
});

test('ChemDraw files keep arrows, pluses, reaction text and the reaction scheme', () => {
  const d = scheme();
  const x = F.write('cdxml', d);
  assert.match(x, /<scheme/); assert.match(x, /ReactionStepReactants="\d+ \d+"/); assert.match(x, /ReactionStepObjectsAboveArrow="\d+"/);
  for (const f of ['cdxml', 'cdx']) {
    const back = F.read(f, F.write(f, d));
    assert.equal(back.arrows.length, 1, f); assert.equal(back.pluses.length, 1, f);
    assert.equal(back.texts[0].text, 'H2SO4', f);
    const a = back.arrows[0]; assert.ok(a.x2 > a.x1, `${f}: head stays on the right`);
  }
});

test('every arrow type round-trips through CDXML and CDX', () => {
  const types = ['reaction', 'equilibrium', 'retro', 'resonance', 'dashed', 'nogo', 'curly', 'fishhook'];
  const d = docFromSmiles(get, 'CC');
  types.forEach((type, i) => d.arrows.push({ id: 100 + i, type, x1: 0, y1: 30 * i, x2: 50, y2: 30 * i, ...(type === 'curly' || type === 'fishhook' ? { cx: 25, cy: 30 * i - 20 } : {}) }));
  for (const f of ['cdxml', 'cdx']) {
    const back = F.read(f, F.write(f, d));
    assert.equal(back.arrows.map(r => r.type).join(), types.join(), f);
    const c = back.arrows[6]; assert.ok(Math.abs(c.cx - 25) < 1 && Math.abs(c.cy - (180 - 20)) < 1, `${f}: symmetric curve keeps its bend`);
  }
});

test('CDX output has the ChemDraw header and matches the CDXML tree', () => {
  const d = docFromSmiles(get, 'CC(=O)Oc1ccccc1C(=O)O'), b = F.write('cdx', d);
  assert.equal(b.constructor.name, 'Uint8Array');
  assert.equal(String.fromCharCode(...b.subarray(0, 8)), 'VjCD0100');
  assert.equal([...b.subarray(8, 22)].join(), '4,3,2,1,0,0,0,0,0,0,0,0,0,0');
  assert.equal([...b.subarray(22, 24)].join(), '0,128', 'document object comes first');
  const fromX = F.read('cdxml', F.write('cdxml', d)), fromB = F.read('cdx', b);
  assert.equal(fromB.atoms.length, fromX.atoms.length); assert.equal(fromB.bonds.length, fromX.bonds.length);
  for (let i = 0; i < fromX.atoms.length; i++) { assert.ok(Math.abs(fromB.atoms[i].x - fromX.atoms[i].x) < 1e-3); assert.equal(fromB.atoms[i].el, fromX.atoms[i].el); }
});

test('CDXML records the drawing settings in the document style', () => {
  const d = { ...docFromSmiles(get, 'CCO'), styleOv: { lineWidth: 1.5, boldWidth: 3, spacing: 0.25 } };
  const x = F.write('cdxml', d);
  assert.match(x, /LineWidth="1.5"/); assert.match(x, /BoldWidth="3"/); assert.match(x, /BondSpacing="25"/); assert.match(x, /BondLength="14.4"/);
});

test('reading ChemDraw nicknames with two attachment points uses BondOrdering and ConnectionOrder', () => {
  // HO-[C3H6 nickname]-OH: the outer bonds must land on the two different ends of the inner chain
  const x = `<?xml version="1.0"?><CDXML><page id="1"><fragment id="2">
    <n id="3" p="0 0" Element="8"/>
    <n id="4" p="30 0" NodeType="Nickname" BondOrdering="10 11"><fragment id="5" ConnectionOrder="9 8">
      <n id="6" p="30 0"/><n id="7" p="45 0"/><n id="12" p="60 0"/>
      <n id="8" p="75 0" NodeType="ExternalConnectionPoint"/><n id="9" p="15 0" NodeType="ExternalConnectionPoint"/>
      <b id="13" B="6" E="7"/><b id="14" B="7" E="12"/><b id="15" B="9" E="6"/><b id="16" B="8" E="12"/></fragment>
      <t><s>C3H6</s></t></n>
    <n id="17" p="90 0" Element="8"/>
    <b id="10" B="3" E="4"/><b id="11" B="4" E="17"/></fragment></page></CDXML>`;
  assert.equal(smiles(asDoc(F.read('cdxml', x))), 'OCCCO');
});

test('aromatic (1.5) bonds from other programs are kekulized', () => {
  const x = `<CDXML><page><fragment>${[0, 1, 2, 3, 4, 5].map(i => `<n id="${i + 1}" p="${Math.cos(i * Math.PI / 3) * 14.4} ${Math.sin(i * Math.PI / 3) * 14.4}"${i === 0 ? ' Element="7"' : ''}/>`).join('')}
    ${[0, 1, 2, 3, 4, 5].map(i => `<b id="${i + 10}" B="${i + 1}" E="${(i + 1) % 6 + 1}" Order="1.5"/>`).join('')}</fragment></page></CDXML>`;
  const d = asDoc(F.read('cdxml', x));
  assert.equal(smiles(d), 'c1ccncc1');
  assert.equal(d.bonds.filter(b => b.order === 2).length, 3);
});

test('text with markup characters is escaped and comes back intact', () => {
  const d = { ...docFromSmiles(get, 'C'), texts: [{ id: 50, x: 0, y: 30, text: 'a < b & "c"' }] };
  for (const f of ['cdxml', 'cdx']) assert.equal(F.read(f, F.write(f, d)).texts[0].text, 'a < b & "c"', f);
});

test('read output passes the file sanitizer unchanged in substance', () => {
  const back = F.read('cdxml', F.write('cdxml', scheme()));
  const s = sanitizeDoc({ ...newDoc(), ...back });
  assert.equal(s.atoms.length, back.atoms.length); assert.equal(s.bonds.length, back.bonds.length);
  assert.equal(s.arrows.length, 1); assert.equal(s.texts.length, 1);
});

test('molfile, SDF, RXN, SMARTS, JME and chemfig writers', () => {
  const d = docFromSmiles(get, 'CC(=O)O');
  assert.match(F.write('mol', d), /V2000/); assert.match(F.write('molV3', d), /V3000/);
  const two = scheme();
  assert.equal((F.write('sdf', two).match(/\$\$\$\$/g) || []).length, 3);
  const rxn = F.write('rxn', two); assert.match(rxn, /^\$RXN/); assert.match(rxn, /^\s*2\s+1/m);
  assert.match(F.write('rxnV3', two), /\$RXN V3000/);
  assert.throws(() => F.write('rxn', d), /reaction arrow/);
  assert.equal(OCL.Molecule.fromSmiles(F.write('smarts', d).replace(/\[([A-Z][a-z]?)\]/g, '$1')).getMolecularFormula().formula, 'C2H4O2');
  assert.match(F.write('jme', d), /^4 3 C /);
  const cf = F.write('chemfig', d); assert.match(cf, /\\chemfig\{/); assert.match(cf, /=\[:\d+\]/);
  assert.match(F.write('chemfig', two), /\\schemestart[\s\S]*\\arrow\{->\[H2SO4\]\}[\s\S]*\\schemestop/);
});
