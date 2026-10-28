import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles, OCL } from './load.mjs';
const get = loadModules();

test('normalizeLabel turns typed hydride labels into bare elements and fixes case', () => {
  const n = get('normalizeLabel');
  assert.equal(n('OH'), 'O'); assert.equal(n('NH2'), 'N'); assert.equal(n('cl'), 'Cl');
  assert.equal(n('br'), 'Br'); assert.equal(n('OMe'), 'OMe'); assert.equal(n('Nd'), 'Nd'); assert.equal(n('  '), null);
});

test('kindOf classifies elements, nicknames and generic labels', () => {
  const k = get('kindOf');
  assert.equal(k('C'), 'element'); assert.equal(k('Nd'), 'element'); assert.equal(k('OMe'), 'abbr');
  assert.equal(k('Boc'), 'abbr'); assert.equal(k('R1'), 'generic'); assert.equal(k('Ar'), 'generic'); assert.equal(k('Enzyme'), 'generic');
});

test('implicit hydrogens follow valence and charge', () => {
  const h = get('implicitH');
  assert.equal(h({ el: 'C', charge: 0 }, 1), 3);
  assert.equal(h({ el: 'N', charge: 1 }, 4), 0);
  assert.equal(h({ el: 'N', charge: 1 }, 1), 3);
  assert.equal(h({ el: 'O', charge: -1 }, 1), 0);
  assert.equal(h({ el: 'S', charge: 0 }, 3), 1, 'S expands to valence 4');
  assert.equal(h({ el: 'C', charge: 0, rad: 1 }, 2), 1, 'radical removes one H');
  assert.equal(h({ el: 'Nd', charge: 0 }, 1), 0, 'metals get no implicit H');
});

test('chemical text formatting: digits after letters are subscripts, ^ makes superscripts', () => {
  const runs = s => JSON.parse(JSON.stringify(get('textRuns')(s))); // copy out of the VM realm
  const r = runs('H2SO4, 80 °C');
  assert.deepEqual(r.filter(x => x.m === 'sub').map(x => x.t), ['2', '4']);
  assert.ok(r.some(x => x.m === 'n' && x.t.includes('80')), '80 °C stays normal');
  assert.deepEqual(runs('Fe^3+').filter(x => x.m === 'sup').map(x => x.t), ['3+']);
  assert.deepEqual(JSON.parse(JSON.stringify(get('chemRuns')('CO2H').map(x => x.sub))), [false, true, false]);
});

test('buildIndex drops dangling and self bonds', () => {
  const d = get('newDoc')();
  d.atoms.push({ id: 1, x: 0, y: 0, el: 'C' }, { id: 2, x: 14.4, y: 0, el: 'C' });
  d.bonds.push({ id: 3, a: 1, b: 2, order: 1 }, { id: 4, a: 1, b: 99, order: 1 }, { id: 5, a: 2, b: 2, order: 1 });
  const ix = get('buildIndex')(d);
  assert.equal(d.bonds.length, 1); assert.equal(ix.adj.get(1).length, 1);
});

test('components and ringPath find fragments and rings', () => {
  const d = docFromSmiles(get, 'c1ccccc1.CCO');
  const ix = get('buildIndex')(d);
  assert.equal(get('components')(d, ix).length, 2);
  const ringBond = d.bonds.find(b => ix.atom.get(b.a).el === 'C' && get('ringPath')(ix, b));
  assert.equal(get('ringPath')(ix, ringBond).length, 6);
});

test('SMILES round trip through the drawing model keeps stereochemistry', () => {
  for (const smi of ['C[C@@H](C(=O)O)N', 'C[C@H](C(=O)O)N', 'OC[C@H]1O[C@@H](O)[C@H](O)[C@@H](O)[C@@H]1O', 'c1ccc2[nH]ccc2c1']) {
    const d = docFromSmiles(get, smi); const ix = get('buildIndex')(d);
    const { mol } = get('toOCL')(d, ix);
    const expected = OCL.Molecule.fromSmiles(smi).getIDCode();
    assert.equal(mol.getIDCode(), expected, smi);
  }
});

test('nicknames expand for formula and mass', () => {
  const d = get('newDoc')();
  d.atoms.push({ id: 1, x: 0, y: 0, el: 'C' }, { id: 2, x: 14.4, y: 0, el: 'OMe' });
  d.bonds.push({ id: 3, a: 1, b: 2, order: 1 });
  const ix = get('buildIndex')(d);
  const { mol, generic } = get('toOCL')(d, ix);
  assert.equal(mol.getMolecularFormula().formula, 'C2H6O'); assert.equal(generic, false);
  d.atoms[1].el = 'R1';
  assert.equal(get('toOCL')(d, get('buildIndex')(d)).generic, true);
});

test('renderDoc produces valid markup with heteroatom labels and no NaN', () => {
  const d = docFromSmiles(get, 'CC(=O)Oc1ccccc1C(=O)O');
  d.arrows.push({ id: 900, type: 'curly', x1: 0, y1: 0, x2: 40, y2: 0, cx: 20, cy: -30 });
  d.texts.push({ id: 901, x: 0, y: 40, text: 'H2O <script>' });
  const { svg } = get('renderDoc')(d);
  assert.ok(!svg.includes('NaN'));
  assert.ok(svg.includes('>O<') || svg.includes('>OH<'));
  assert.ok(!svg.includes('<script>'), 'text is escaped');
  assert.ok(svg.includes('&lt;script&gt;'));
});

test('sanitizeDoc removes markup injection from loaded files', () => {
  const bad = { atoms: [{ id: 1, x: '0"/><img src=x onerror=alert(1)>', y: 0, el: 'C', color: '"/><script>alert(1)</script>' }],
    bonds: [{ id: 2, a: 1, b: 1, order: 9, stereo: 'evil' }], texts: [{ id: 3, x: 0, y: 0, text: 'ok', color: 'red;" onload="x' }],
    arrows: [{ id: 4, type: 'bomb', x1: 0, y1: 0, x2: 1, y2: 1 }], style: '__proto__' };
  const s = get('sanitizeDoc')(bad);
  assert.equal(s.atoms[0].x, 0); assert.equal(s.atoms[0].color, undefined);
  assert.equal(s.bonds[0].order, 3); assert.equal(s.bonds[0].stereo, 'none');
  assert.equal(s.texts[0].color, undefined); assert.equal(s.arrows[0].type, 'reaction'); assert.equal(s.style, 'acs');
  assert.equal(get('sanitizeDoc')({ atoms: [{ id: 1, x: 1, y: 2, el: 'N', color: '#2f4fd6' }] }).atoms[0].color, '#2f4fd6');
});

test('sanitizeDoc clamps drawing settings and keeps only positive integer group ids', () => {
  const s = get('sanitizeDoc');
  const d = s({ styleOv: { lineWidth: 99, boldWidth: '1.5', spacing: -1, wedge: '"/><script>', evil: 3 },
    atoms: [{ id: 1, x: 0, y: 0, el: 'C', g: 2 }, { id: 2, x: 0, y: 0, el: 'C', g: '"><b>' }, { id: 3, x: 0, y: 0, el: 'C', g: -4 }],
    texts: [{ id: 4, x: 0, y: 0, text: '1', g: 2.4 }] });
  assert.equal(JSON.stringify(d.styleOv), JSON.stringify({ lineWidth: 6, boldWidth: 1.5, spacing: 0.08 }));
  assert.equal(JSON.stringify(d.atoms.map(a => a.g ?? null)), '[2,null,null]');
  assert.equal(d.texts[0].g, 2);
  assert.equal(s({ styleOv: { evil: 1 } }).styleOv, undefined);
});

test('valence check counts drawn lone pairs against the octet', () => {
  const ve = get('valenceError'), bi = get('buildIndex');
  const why = (smi, pick, set) => { const d = docFromSmiles(get, smi); const a = d.atoms.find(pick(bi(d))); Object.assign(a, set); const e = ve(a, bi(d)); return e ? e.why : null; };
  const mid = ix => a => ix.adj.get(a.id).length === 2;
  assert.match(why('N(N)N', mid, { lp: 2 }), /10 electrons .*octet/);      // the reported case: NH(NH2)2 with two lone pairs
  assert.equal(why('N(N)N', mid, { lp: 1 }), null);
  assert.equal(why('O', () => a => a.el === 'O', { lp: 2 }), null);        // water
  assert.match(why('O', () => a => a.el === 'O', { lp: 3 }), /10 electrons/);
  assert.equal(why('[OH-]', () => a => a.el === 'O', { lp: 3 }), null);   // hydroxide really has three pairs
  assert.equal(why('C[CH-]C', () => a => a.charge === -1, { lp: 1 }), null); // carbanion
  assert.equal(why('FS(F)(F)F', () => a => a.el === 'S', { lp: 1 }), null);  // SF4: S may expand its octet
  assert.match(why('[NH4+]', () => a => a.el === 'N', { lp: 1 }), /10 electrons/);
});
