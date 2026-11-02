// Atom labels with subscripts and superscripts (R¹), substituent names typed as labels, and captions attached to bonds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), newDoc = get('newDoc'), buildIndex = get('buildIndex'), layoutLabel = get('layoutLabel'), normalizeLabel = get('normalizeLabel');
const sanitizeDoc = get('sanitizeDoc'), rescaleDoc = get('rescaleDoc'), renderDoc = get('renderDoc'), textMetrics = get('textMetrics');
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m}: ${a} vs ${b}`);

function ethanolWith(el){ const d = docFromSmiles(get, 'CCO'); d.atoms[2].el = el; return d; }

test('a label with ^{…} draws a smaller raised number (R¹); without markup digits are subscripts (CO2Me)', () => {
  const d = ethanolWith('R^{1}'), ix = buildIndex(d), a = d.atoms[2], info = layoutLabel(d, ix, a);
  const R = info.items.find(i => i.t === 'R'), one = info.items.find(i => i.t === '1');
  assert.ok(R && one, JSON.stringify(info.items));
  assert.ok(one.size < R.size && one.y < R.y, 'superscript: smaller and above the line');
  const d2 = ethanolWith('R1'), i2 = layoutLabel(d2, buildIndex(d2), d2.atoms[2]);
  const one2 = i2.items.find(i => i.t === '1'), R2 = i2.items.find(i => i.t === 'R');
  assert.ok(one2.y > R2.y, 'R1 keeps its subscript');
  const { svg } = renderDoc(d, buildIndex(d));
  assert.ok(!svg.includes('^{'), 'no markup in the drawing');
});

test('substituent names typed as labels become nicknames or elements', () => {
  assert.equal(normalizeLabel('phenyl'), 'Ph'); assert.equal(normalizeLabel('Phenyl'), 'Ph');
  assert.equal(normalizeLabel('tert-butyl'), 'tBu'); assert.equal(normalizeLabel('hydroxy'), 'O');
  assert.equal(normalizeLabel('methoxy'), 'OMe'); assert.equal(normalizeLabel('CH3'), 'C');
  assert.equal(normalizeLabel('R^{1}'), 'R^{1}'); assert.equal(normalizeLabel('constructor'), 'constructor');
});

test('a formatted label goes to ChemDraw as style runs and comes back; chemfig and molfiles get it too', () => {
  const d = ethanolWith('R^{1}');
  const x = F.write('cdxml', d);
  assert.match(x, /GenericNickname="R1"/); assert.match(x, /face="64"[^>]*>1</);
  for (const f of ['cdxml', 'cdx']) assert.equal(F.read(f, F.write(f, d)).atoms.find(a => /R/.test(a.el)).el, 'R^{1}', f);
  assert.equal(F.read('cdxml', F.write('cdxml', ethanolWith('R1'))).atoms.find(a => /R/.test(a.el)).el, 'R1', 'a plain R1 stays plain');
  assert.match(F.write('chemfig', d), /R\^\{1\}/);
  assert.match(F.write('mol', d), /V2000/);
});

// two carbons on the x axis with a caption under the bond
function bondDoc(){
  const d = newDoc();
  d.atoms.push({ id: 1, x: 0, y: 0, el: 'C' }, { id: 2, x: 14.4, y: 0, el: 'C' });
  d.bonds.push({ id: 3, a: 1, b: 2, order: 1 });
  d.texts.push({ id: 4, x: 0, y: 0, text: 'hν', on: { b: 3, u: 0, v: 7, s: 1 } });
  d.nid = 5; return d;
}

test('a caption on a bond keeps a gap from it to its near edge, and follows the bond when it moves or turns', () => {
  const d = bondDoc(); buildIndex(d); const t = d.texts[0], m = textMetrics(d, t);
  near(t.x, 7.2, 'beside the middle'); near(t.y, 7 + m.h / 2, 'the near edge is v below the bond');
  for (const a of d.atoms){ a.x += 10; a.y += 5; } buildIndex(d);
  near(t.x, 17.2, 'moved with the bond'); near(t.y, 12 + m.h / 2, 'moved with the bond');
  // turn the bond 90° about atom 1: the caption turns with it and now keeps the gap to its side edge
  d.atoms[1].x = d.atoms[0].x; d.atoms[1].y = d.atoms[0].y + 14.4; buildIndex(d);
  near(t.x, 10 - 7 - m.w / 2, 'turned'); near(t.y, 5 + 7.2, 'turned');
  // a longer caption grows away from the bond
  t.text = 'hν, 254 nm'; buildIndex(d);
  near(t.x, 10 - 7 - textMetrics(d, t).w / 2, 'longer');
});

test('moving the caption alone moves it relative to the bond; moving both together keeps it', () => {
  const d = bondDoc(); buildIndex(d); const t = d.texts[0];
  t.x += 3; t.y += 4; buildIndex(d);
  near(t.on.u, 3, 'along'); near(t.on.v, 11, 'gap'); assert.equal(t.on.s, 1);
  t.y -= 40; buildIndex(d); assert.equal(t.on.s, -1, 'dragged to the other side');
  t.y += 40; buildIndex(d);
  for (const o of [...d.atoms, t]){ o.x += 20; } buildIndex(d);
  near(t.on.u, 3, 'kept'); near(t.x, 7.2 + 3 + 20, 'moved once, not twice');
});

test('a caption goes with its bond, is kept in saved files and scales with the drawing', () => {
  const d = bondDoc(); buildIndex(d);
  const s = sanitizeDoc(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(JSON.parse(JSON.stringify(s.texts[0].on)), { b: 3, u: 0, v: 7, s: 1 });
  rescaleDoc(d, 2); buildIndex(d); near(d.texts[0].on.v, 14, 'offset scaled');
  d.bonds = []; buildIndex(d);
  assert.equal(d.texts.length, 0, 'deleting the bond deletes its caption');
});
