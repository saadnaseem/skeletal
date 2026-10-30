// ChemDraw import keeps what the drawing means and looks like: hydrogen/dative bonds, isotopes, colours, the document
// style and mixed text styles; anything it can't represent is reported instead of dropped silently.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), buildIndex = get('buildIndex'), toOCL = get('toOCL'), newDoc = get('newDoc'), sanitizeDoc = get('sanitizeDoc');
const bondSum = get('bondSum'), implicitH = get('implicitH'), layoutLabel = get('layoutLabel'), useStyle = get('useStyle'), renderBond = get('renderBond');

const asDoc = part => ({ ...newDoc(), ...part });
const smiles = d => { const e = F.expandDoc(d), m = toOCL(e, buildIndex(e)).mol; m.ensureHelperArrays(get('OCL').Molecule.cHelperParities); return m.toIsomericSmiles(); };
const cdxml = (body, head = '') => `<?xml version="1.0"?><CDXML${head}>${body}</CDXML>`;
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); // values from the VM are another realm
const both = d => ['cdxml', 'cdx'].map(f => [f, F.read(f, F.write(f, d))]);

test('hydrogen and dative bonds stay what they are and add no valence', () => {
  // H2O...H-OH hydrogen bond, and H3N->BH3 dative bond, as ChemDraw writes them
  const x = cdxml(`<page><fragment>
    <n id="1" p="0 0" Element="8"/><n id="2" p="14.4 0" Element="1"/><n id="3" p="28.8 0" Element="8"/>
    <n id="4" p="0 40" Element="7"/><n id="5" p="14.4 40" Element="5"/>
    <b id="10" B="1" E="2"/><b id="11" B="2" E="3" Order="hydrogen"/><b id="12" B="4" E="5" Order="dative"/></fragment></page>`);
  const d = asDoc(F.read('cdxml', x)), ix = buildIndex(d);
  same(d.bonds.map(b => b.kind || 'normal'), ['normal', 'hbond', 'dative']);
  const atom = el => d.atoms.find(a => a.el === el);
  assert.equal(implicitH(atom('N'), bondSum(ix, atom('N').id)), 3, 'the dative bond does not take one of N\'s hydrogens');
  assert.equal(implicitH(atom('B'), bondSum(ix, atom('B').id)), 3);
  const second = d.atoms.filter(a => a.el === 'O')[1];
  assert.equal(implicitH(second, bondSum(ix, second.id)), 2, 'the water on the far side of the H-bond is still H2O');
  assert.equal(smiles(d), 'B.N.O.O'); // formula unchanged; the bonds that carry no valence are left out of SMILES
  for (const [f, back] of both(d)) same(back.bonds.map(b => b.kind || 'normal'), ['normal', 'hbond', 'dative'], f);
  assert.equal(F.write('chemfig', d).match(/\\chemfig\{/g).length, 4, 'chemfig has no such bonds: the pieces stay apart rather than joined by single bonds');
  // drawn as a dashed line and as an arrow, not as plain single bonds
  const out = []; const labels = new Map(d.atoms.map(a => [a.id, layoutLabel(d, ix, a)]));
  renderBond(d, ix, d.bonds[1], labels, out); assert.match(out.join(''), /stroke-dasharray/);
  out.length = 0; renderBond(d, ix, d.bonds[2], labels, out); assert.match(out.join(''), /<path [^>]*fill=/);
});

test('ionic bonds are reported rather than turned into single bonds', () => {
  const x = cdxml(`<page><fragment><n id="1" p="0 0" Element="11"/><n id="2" p="14.4 0" Element="17"/><b id="3" B="1" E="2" Order="ionic"/></fragment></page>`);
  const r = F.read('cdxml', x);
  assert.equal(r.bonds.length, 0); same(r.skipped, { 'ionic bond': 1 });
});

test('deuterium, tritium and other isotopes are kept', () => {
  const x = cdxml(`<page><fragment>
    <n id="1" p="0 0"/><n id="2" p="14.4 0" Element="1" Isotope="2"><t><s>D</s></t></n>
    <n id="3" p="0 14.4" Element="1"><t><s>T</s></t></n><n id="4" p="-14.4 0" Isotope="13"/>
    <b id="10" B="1" E="2"/><b id="11" B="1" E="3"/><b id="12" B="1" E="4"/></fragment></page>`);
  const d = asDoc(F.read('cdxml', x));
  same(d.atoms.map(a => [a.el, a.iso || 0]), [['C', 0], ['H', 2], ['H', 3], ['C', 13]]);
  assert.equal(smiles(d), '[2H]C([3H])[13CH3]');
  for (const [f, back] of both(d)) assert.equal(smiles(asDoc(back)), '[2H]C([3H])[13CH3]', f);
  // the labels read D, T and 13C (mass number raised before the symbol)
  const ix = buildIndex(d), text = a => layoutLabel(d, ix, a).items.map(i => i.t).join('');
  assert.equal(text(d.atoms[1]), 'D'); assert.equal(text(d.atoms[2]), 'T');
  const c13 = layoutLabel(d, ix, d.atoms[3]);
  assert.ok(c13.visible, 'an isotope-labelled carbon shows its label');
  const k = c13.items.findIndex(i => i.t === '13');
  assert.equal(c13.items[k + 1].t, 'C', 'mass number comes right before the symbol'); assert.ok(c13.items[k].y < c13.items[k + 1].y, 'and is raised');
  // the file sanitizer keeps them and drops nonsense
  const s = sanitizeDoc({ atoms: [{ id: 1, el: 'H', iso: 2 }, { id: 2, el: 'C', iso: 'x' }, { id: 3, el: 'C', iso: 999 }], bonds: [{ id: 4, a: 1, b: 2, kind: 'hbond' }, { id: 5, a: 2, b: 3, kind: 'zap' }] });
  same(s.atoms.map(a => a.iso), [2, undefined, undefined]);
  same(s.bonds.map(b => b.kind), ['hbond', undefined]);
});

test('colours of atoms, bonds, text, arrows and pluses survive ChemDraw files', () => {
  const d = docFromSmiles(get, 'CCO');
  d.atoms[2].color = '#d1231f'; d.bonds[0].color = '#2f4fd6';
  d.texts.push({ id: 50, x: 0, y: 40, text: 'step 1', color: '#1f8f3a' });
  d.arrows.push({ id: 51, type: 'reaction', x1: 40, y1: 0, x2: 80, y2: 0, color: '#6a1fa0' });
  d.pluses.push({ id: 52, x: 100, y: 0, color: '#b38a00' });
  for (const [f, back] of both(d)) {
    assert.equal(back.atoms.find(a => a.el === 'O').color, '#d1231f', f);
    assert.equal(back.bonds.filter(b => b.color).map(b => b.color).join(), '#2f4fd6', f);
    assert.equal(back.texts[0].color, '#1f8f3a', f);
    assert.equal(back.arrows[0].color, '#6a1fa0', f);
    assert.equal(back.pluses[0].color, '#b38a00', f);
    assert.ok(!back.atoms.some(a => a.el === 'C' && a.color), `${f}: black stays the default`);
  }
});

test('the document style comes back: journal preset, overrides and label size', () => {
  try {
    const d = { ...docFromSmiles(get, 'CCO'), style: 'rsc', styleOv: { lineWidth: 0.8 } };
    useStyle(d);
    for (const [f, back] of both(d)) {
      assert.equal(back.style, 'rsc', f); same(back.styleOv, { lineWidth: 0.8 }, f);
      const b = back.bonds[0], A = back.atoms.find(a => a.id === b.a), B = back.atoms.find(a => a.id === b.b);
      assert.ok(Math.abs(Math.hypot(A.x - B.x, A.y - B.y) - 12.2) < 0.01, `${f}: coordinates use the RSC bond length`);
    }
    const n = { ...docFromSmiles(get, 'CC'), style: 'nature' }; useStyle(n);
    assert.equal(F.read('cdxml', F.write('cdxml', n)).style, 'nature');
    // ChemDraw's own ACS 1996 settings
    assert.equal(F.read('cdxml', cdxml('<page/>', ' BondLength="14.4" LineWidth="0.6" BoldWidth="2" BondSpacing="18" HashSpacing="2.5" MarginWidth="1.6" LabelSize="10"')).style, 'acs');
    assert.equal(F.read('cdxml', cdxml('<page/>')).style, undefined, 'no settings in the file: the drawing keeps its own');
  } finally { useStyle(newDoc()); }
});

test('mixed text styles: italic only when the whole text is italic', () => {
  const t = runs => F.read('cdxml', cdxml(`<page><t p="0 0">${runs}</t></page>`)).texts[0];
  assert.equal(t('<s face="2">n</s><s face="0">-BuLi, THF</s>').italic, undefined, 'one italic letter does not italicize the line');
  assert.equal(t('<s face="2">n</s><s face="0">-BuLi, THF</s>').text, 'n-BuLi, THF');
  assert.equal(t('<s face="2">in vacuo</s>').italic, true);
  assert.equal(t('<s face="3">bold </s><s face="1">text</s>').bold, true);
});

test('shapes, brackets and other objects with no equivalent are counted, not silently lost', () => {
  const x = cdxml(`<page><fragment><n id="1" p="0 0"/><n id="2" p="14.4 0"/><b id="3" B="1" E="2"/></fragment>
    <graphic id="4" BoundingBox="0 0 10 10" GraphicType="Bracket"/><graphic id="5" BoundingBox="20 0 10 10" GraphicType="Bracket"/>
    <graphic id="6" BoundingBox="0 0 30 30" GraphicType="Oval"/><graphic id="7" BoundingBox="0 0 30 30" GraphicType="Orbital"/>
    <graphic id="8" BoundingBox="0 0 3 3" GraphicType="Symbol" SymbolType="CirclePlus"/>
    <graphic id="9" BoundingBox="0 0 40 0" GraphicType="Line" ArrowType="FullHead" SupersededBy="10"/>
    <curve id="11"/></page>`);
  const r = F.read('cdxml', x);
  same(r.skipped, { bracket: 2, shape: 2, orbital: 1 });
  assert.equal(F.read('cdxml', F.write('cdxml', docFromSmiles(get, 'CCO'))).skipped, undefined, 'our own files lose nothing');
});
