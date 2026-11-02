// An atom label's own size (set from the Text panel): drawing, saving and ChemDraw files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), buildIndex = get('buildIndex'), layoutLabel = get('layoutLabel'), sanitizeDoc = get('sanitizeDoc'), renderDoc = get('renderDoc'), S = get('S');
const amine = () => docFromSmiles(get, 'NC1CCCCC1');
const N = d => d.atoms.find(a => a.el === 'N');

test('a label with its own size is drawn at that size, its subscript and box in proportion; the others keep the drawing’s', () => {
  const d = amine(), ix = buildIndex(d), n = N(d), base = layoutLabel(d, ix, n), fs = S(d).fontSize;
  n.size = 2 * fs; const big = layoutLabel(d, buildIndex(d), n);
  assert.equal(big.items[0].size, 2 * fs); assert.equal(base.items[0].size, fs);
  const sub = it => it.items.find(i => i.t === '2').size;
  assert.ok(Math.abs(sub(big) / sub(base) - 2) < 1e-9, 'the H₂ subscript scales too');
  assert.ok(big.box.x1 - big.box.x0 > 1.8 * (base.box.x1 - base.box.x0));
  const { svg } = renderDoc(d, buildIndex(d));
  assert.match(svg, new RegExp(`font-size="${2 * fs}"`));
});

test('saved files keep a label size between 4 and 72 pt and drop anything else', () => {
  const d = amine(); N(d).size = 14; d.atoms[1].size = 500; d.atoms[2].size = 'big'; d.atoms[3].size = 0;
  const s = sanitizeDoc(JSON.parse(JSON.stringify(d)));
  assert.equal(s.atoms.find(a => a.el === 'N').size, 14);
  assert.deepEqual([...s.atoms.slice(1, 4)].map(a => a.size), [undefined, undefined, undefined]);
});

test('ChemDraw CDXML and CDX keep a label’s own size, and leave the other labels without one', () => {
  const d = amine(); N(d).size = 14; d.atoms.push({ id: 99, x: 40, y: 0, el: 'O', charge: 0, lp: 0, rad: 0 }); d.nid = 100;
  const x = F.write('cdxml', d);
  assert.match(x, /size="14"[^>]*>NH2?</);
  for (const f of ['cdxml', 'cdx']){
    const r = F.read(f, F.write(f, d));
    assert.equal(r.atoms.find(a => a.el === 'N').size, 14, f);
    assert.equal(r.atoms.find(a => a.el === 'O').size, undefined, f);
  }
});

test('CDX now carries the document label size (LabelSize, 0x081C, in twentieths of a point)', () => {
  const d = amine(); d.style = 'acs'; d.labelSize = 12;
  const r = F.read('cdx', F.write('cdx', d));
  assert.equal(r.labelSize, 12);
  assert.equal(r.atoms.find(a => a.el === 'N').size, undefined, 'a label at the document size has no size of its own');
});

test('a ChemDraw file without a document label size: the size most labels use is the reference', () => {
  const lab = (id, x, el, sz) => `<n id="${id}" p="${x} 0" Element="${el === 'N' ? 7 : 8}"><t><s font="3" size="${sz}" face="96">${el}</s></t></n>`;
  const xml = `<?xml version="1.0"?><CDXML BondLength="14.4"><page><fragment>${lab(1, 0, 'N', 10)}${lab(2, 14.4, 'O', 10)}${lab(3, 28.8, 'O', 18)}<b B="1" E="2"/><b B="2" E="3"/></fragment></page></CDXML>`;
  const r = F.read('cdxml', xml);
  assert.deepEqual([...r.atoms].map(a => a.size), [undefined, undefined, 18]);
});

test('a ChemDraw file without a document label size whose labels are mostly 12 pt: 12 pt becomes the drawing’s label size', () => {
  const lab = (id, x, sz) => `<n id="${id}" p="${x} 0" Element="8"><t><s font="3" size="${sz}" face="96">O</s></t></n>`;
  const r = F.read('cdxml', `<?xml version="1.0"?><CDXML BondLength="14.4"><page><fragment>${lab(1, 0, 12)}${lab(2, 14.4, 12)}${lab(3, 28.8, 18)}<b B="1" E="2"/><b B="2" E="3"/></fragment></page></CDXML>`);
  assert.equal(r.labelSize, 12);
  assert.deepEqual([...r.atoms].map(a => a.size), [undefined, undefined, 18]);
});
