// Spec 003 (CDXML fidelity): ChemDraw's half-brackets open as bracket pairs and are saved the way ChemDraw writes them;
// plain Dash and Hash bonds have their own styles; arrow direction is pinned. Fixtures are hand-written with the same structure
// as real ChemDraw files (a half-bracket is a vertical line: right half drawn top to bottom, left half bottom to top).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load.mjs';
const get = loadModules();
const F = get('FORMATS');
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m);
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.05, `${m}: ${a} vs ${b}`);
const cdxml = body => `<?xml version="1.0"?><CDXML BondLength="14.4"><page>${body}</page></CDXML>`;
const frag = `<fragment id="1"><n id="2" p="80 300"/><n id="3" p="94.4 300"/><b id="4" B="2" E="3"/></fragment>`;
// a left and right half of kind k between x0 and x1, y0 to y1, ids a and b
const halves = (k, x0, x1, y0, y1, a = 20, b = 21) =>
  `<graphic id="${b}" BoundingBox="${x1} ${y0} ${x1} ${y1}" GraphicType="Bracket" BracketType="${k}" LipSize="60"/>` +
  `<graphic id="${a}" BoundingBox="${x0} ${y1} ${x0} ${y0}" GraphicType="Bracket" BracketType="${k}" LipSize="60"/>`;
const group = (a = 20, b = 21, id = 30) => `<bracketedgroup id="${id}" BracketedObjectIDs="2 3 4"><bracketattachment id="${id + 1}" GraphicID="${b}"/><bracketattachment id="${id + 2}" GraphicID="${a}"/></bracketedgroup>`;

test('FR-001 grouped half-brackets open as one pair of the same kind, spanning both halves', () => {
  for (const [k, type] of [['Square', 'square'], ['Curly', 'curly'], ['Round', 'round']]){
    const r = F.read('cdxml', cdxml(frag + halves(k, 62.4, 131.4, 257.4, 369.6) + group()));
    assert.equal(r.brackets.length, 1, k);
    const q = r.brackets[0];
    assert.equal(q.type, type, k);
    // read() scales the drawing to Lone Pair's bond length; compare in the file's units via the bond
    const s = 14.4 / Math.hypot(r.atoms[1].x - r.atoms[0].x, r.atoms[1].y - r.atoms[0].y);
    near(q.w * s, 69, `${k} width`); near(q.h * s, 112.2, `${k} height`);
    near((q.x - r.atoms[0].x) * s, (62.4 + 131.4) / 2 - 80, `${k} centre x`); near((q.y - r.atoms[0].y) * s, (257.4 + 369.6) / 2 - 300, `${k} centre y`);
    assert.equal(r.skipped, undefined, k);
  }
});

test('FR-001 the same file as CDX gives the same brackets', () => {
  const x = cdxml(frag + halves('Square', 62.4, 131.4, 257.4, 369.6) + group());
  const tree = F._xmlParse(x).children.find(c => c.name === 'CDXML'), a = F.read('cdxml', x), b = F.read('cdx', F._cdxEncode(tree));
  same(b.brackets.map(q => [q.type, +q.w.toFixed(2), +q.h.toFixed(2)]), a.brackets.map(q => [q.type, +q.w.toFixed(2), +q.h.toFixed(2)]));
  // the link itself survives the binary format (not just the geometry)
  const dec = F._cdxDecode(F._cdxEncode(tree)), find = (n, nm) => n.name === nm ? n : n.children.map(c => find(c, nm)).find(Boolean);
  const g = find(dec, 'bracketedgroup');
  assert.ok(g, 'bracketedgroup decoded');
  same(g.children.filter(c => c.name === 'bracketattachment').map(c => c.attrs.GraphicID), ['21', '20']);
  assert.equal(g.attrs.BracketedObjectIDs, '2 3 4');
});

test('FR-002 facing halves of the same kind and height pair up without a group', () => {
  const r = F.read('cdxml', cdxml(frag + halves('Square', 62.4, 131.4, 257.4, 369.6)));
  assert.equal(r.brackets.length, 1); assert.equal(r.skipped, undefined);
  const r2 = F.read('cdxml', cdxml(frag + halves('Curly', 62.4, 131.4, 257.4, 369.6).replace('257.4 131.4 369.6', '257.9 131.4 370.1')));
  assert.equal(r2.brackets.length, 1, 'within 1 pt');
});

test('FR-002, FR-003 halves of different kinds or heights are not paired, and are counted', () => {
  const mixed = `<graphic id="21" BoundingBox="131.4 257.4 131.4 369.6" GraphicType="Bracket" BracketType="Square"/><graphic id="20" BoundingBox="62.4 369.6 62.4 257.4" GraphicType="Bracket" BracketType="Curly"/>`;
  let r = F.read('cdxml', cdxml(frag + mixed)); assert.equal(r.brackets.length, 0); same(r.skipped, { bracket: 2 });
  const tall = `<graphic id="21" BoundingBox="131.4 257.4 131.4 369.6" GraphicType="Bracket" BracketType="Square"/><graphic id="20" BoundingBox="62.4 400 62.4 257.4" GraphicType="Bracket" BracketType="Square"/>`;
  r = F.read('cdxml', cdxml(frag + tall)); assert.equal(r.brackets.length, 0); same(r.skipped, { bracket: 2 });
  // a group of two different kinds is not trusted either
  r = F.read('cdxml', cdxml(frag + mixed + group())); assert.equal(r.brackets.length, 0); same(r.skipped, { bracket: 2 });
});

test('FR-003 a lone curly brace is counted and nothing else changes', () => {
  const lone = `<graphic id="22" BoundingBox="382.12 1229.14 382.70 1161.08" GraphicType="Bracket" BracketType="Curly" LipSize="60"/>`;
  const r = F.read('cdxml', cdxml(frag + halves('Square', 62.4, 131.4, 257.4, 369.6) + group() + lone));
  assert.equal(r.brackets.length, 1); same(r.skipped, { bracket: 1 });
  assert.equal(r.atoms.length, 2); assert.equal(r.bonds.length, 1);
});

test('FR-004 a charge at the top right and a count at the bottom right attach to the pair', () => {
  const t = (id, x, y, s) => `<t id="${id}" p="${x} ${y}" BoundingBox="${x} ${y - 6} ${x + 8} ${y + 1}"><s font="3" size="7.5" face="0">${s}</s></t>`;
  const r = F.read('cdxml', cdxml(frag + halves('Square', 62.4, 131.4, 257.4, 369.6) + group() + t(40, 133, 262, '2–') + t(41, 133, 374, 'n')));
  assert.equal(r.brackets.length, 1); assert.equal(r.texts.length, 0);
  assert.equal(r.brackets[0].sup, '2–'); assert.equal(r.brackets[0].sub, 'n');
});

test('CON-003 whole pairs from an older Lone Pair file open as before', () => {
  const r = F.read('cdxml', cdxml(frag + `<graphic id="9" BoundingBox="70 280 104 320" GraphicType="Bracket" BracketType="SquarePair"/>`));
  same(r.brackets.map(q => q.type), ['square']); assert.equal(r.skipped, undefined);
});
