// Hydrogens on atom labels: carbons shown as CH3, CH2, CH (per atom or for the whole drawing), labels typed with a count the bonds don't allow, and files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), buildIndex = get('buildIndex'), layoutLabel = get('layoutLabel'), sanitizeDoc = get('sanitizeDoc');
const typedH = get('typedH'), labelH = get('labelH'), valenceError = get('valenceError'), renderDoc = get('renderDoc');

const shown = (d, i) => { const ix = buildIndex(d), l = layoutLabel(d, ix, d.atoms[i]); return l.visible ? l.items.map(x => x.t).join('') : ''; };

test('carbons are bare vertices unless set to show their hydrogens', () => {
  const d = docFromSmiles(get, 'CCC=O'); // CH3-CH2-CH=O
  assert.deepEqual([0, 1, 2].map(i => shown(d, i)), ['', '', '']);
  d.atoms[1].hs = true;
  assert.equal(shown(d, 1), 'CH2');
  delete d.atoms[1].hs; d.showCH = 'end';
  assert.deepEqual([0, 1, 2].map(i => shown(d, i)), ['CH3', '', '']);
  d.showCH = 'all';
  assert.deepEqual([0, 1, 2].map(i => shown(d, i)), ['CH3', 'CH2', 'CH']);
});

test('a typed count is drawn as typed, flagged, and only for its element', () => {
  const d = docFromSmiles(get, 'CCC'), ix = buildIndex(d), mid = d.atoms[1];
  mid.hl = 'CH3';
  assert.equal(typedH(mid), 3); assert.equal(labelH(mid, ix), 3);
  assert.equal(shown(d, 1), 'CH3');
  const e = valenceError(mid, ix);
  assert.ok(e && /CH3 was typed/.test(e.why) && /takes 2 H/.test(e.why), JSON.stringify(e));
  mid.el = 'N'; // the atom changed: the typed carbon label no longer applies
  assert.equal(typedH(mid), null); assert.equal(valenceError(mid, ix), null);
});

test('the formula follows the bonds, not a mistyped label', () => {
  const d = docFromSmiles(get, 'CCC'); d.atoms[1].hl = 'CH3';
  const ix = buildIndex(d), { mol } = get('toOCL')(d, ix, d.atoms.map(a => a.id));
  assert.equal(mol.getMolecularFormula().formula, 'C3H8');
});

test('saved and opened again: the flags survive, junk does not', () => {
  const d = docFromSmiles(get, 'CC'); d.atoms[0].hs = true; d.atoms[1].hl = 'CH2'; d.showCH = 'end';
  const s = sanitizeDoc(JSON.parse(JSON.stringify(d)));
  assert.equal(s.atoms[0].hs, true); assert.equal(s.atoms[1].hl, 'CH2'); assert.equal(s.showCH, 'end');
  const bad = sanitizeDoc({ ...d, showCH: 'x', atoms: d.atoms.map(a => ({ ...a, hl: '<svg>', hs: 'yes' })) });
  assert.equal(bad.showCH, undefined); assert.ok(bad.atoms.every(a => a.hl === undefined && a.hs === true));
});

test('ChemDraw files keep carbon labels both ways', () => {
  const d = docFromSmiles(get, 'CCO'); d.atoms[0].hs = true;
  const cdxml = F.write('cdxml', d);
  assert.ok(/NumHydrogens="3"/.test(cdxml) && />CH3</.test(cdxml), 'written as a CH3 label');
  const back = F.read('cdxml', cdxml), c = back.atoms.find(a => a.el === 'C' && a.hs);
  assert.ok(c, 'opened again, the carbon still shows CH3');
});

test('the drawing shows the label, not markup', () => {
  const d = docFromSmiles(get, 'CC'), bare = renderDoc(d, buildIndex(d)).svg;
  assert.ok(!/<text/.test(bare), 'ethane alone: no labels');
  d.showCH = 'all';
  const { svg } = renderDoc(d, buildIndex(d)), texts = [...svg.matchAll(/<text[^>]*>([^<]*)</g)].map(m => m[1]).join(' ');
  assert.equal((texts.match(/C/g) || []).length, 2, texts); assert.equal((texts.match(/H/g) || []).length, 2, texts);
  assert.equal((texts.match(/3/g) || []).length, 2, texts); assert.ok(!/[\\^_{]/.test(texts), 'no markup');
});

test('ChemDraw H3C (a methyl read leftward) and CH2+ open as carbons, and NumHydrogens is the bonds\' count', () => {
  const d = docFromSmiles(get, 'CCC'); d.atoms[1].hl = 'CH3';
  const cdxml = F.write('cdxml', d);
  assert.ok(/NumHydrogens="2"/.test(cdxml) && />CH3</.test(cdxml), 'drawn as typed, counted from the bonds');
  for (const lab of ['H3C', 'CH2+']){
    const x = cdxml.replace(/>CH3</, `>${lab}<`), back = F.read('cdxml', x);
    assert.ok(back.atoms.every(a => a.el === 'C'), `${lab}: ${JSON.stringify(back.atoms.map(a => a.el))}`);
    assert.ok(back.atoms.some(a => a.hs), lab);
  }
});
