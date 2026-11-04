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

// ---------- FR-005: brackets are saved as ChemDraw writes them ----------
import { docFromSmiles } from './load.mjs';
function bracketDoc(){
  const d = docFromSmiles(get, 'C[N+](C)(C)C');
  const xs = d.atoms.map(a => a.x), ys = d.atoms.map(a => a.y), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  d.brackets = [
    { id: 900, type: 'square', x: cx, y: cy, w: 60, h: 56, sup: '2–' },
    { id: 901, type: 'curly', x: cx, y: cy, w: 90, h: 80, sub: 'n' },
    { id: 902, type: 'round', x: cx + 150, y: cy, w: 40, h: 30, sup: '‡' },
  ];
  d.nid = 903; return d;
}

test('FR-005 each bracket is written as two half-brackets and a bracketedgroup that links them', () => {
  const x = F.write('cdxml', bracketDoc()), tree = F._xmlParse(x);
  const all = []; (function walk(n){ all.push(n); n.children.forEach(walk); })(tree);
  const halves = all.filter(n => n.name === 'graphic' && n.attrs.GraphicType === 'Bracket');
  same(halves.map(n => n.attrs.BracketType), ['Square', 'Square', 'Curly', 'Curly', 'Round', 'Round']);
  for (const h of halves){ const b = h.attrs.BoundingBox.split(' ').map(Number); assert.equal(b[0], b[2], 'a half is a vertical line'); }
  const groups = all.filter(n => n.name === 'bracketedgroup');
  assert.equal(groups.length, 3);
  const ids = new Set(halves.map(h => h.attrs.id));
  for (const g of groups){ const at = g.children.filter(c => c.name === 'bracketattachment').map(c => c.attrs.GraphicID); assert.equal(at.length, 2); assert.ok(at.every(i => ids.has(i))); }
  // the square bracket encloses the whole ion: its group lists the ion's nodes and bonds
  const enclosed = groups[0].attrs.BracketedObjectIDs.split(' ');
  const nodes = all.filter(n => n.name === 'n').map(n => n.attrs.id), bonds = all.filter(n => n.name === 'b').map(n => n.attrs.id);
  assert.equal(enclosed.length, nodes.length + bonds.length);
  // right half drawn top to bottom, left half bottom to top, as ChemDraw does
  const [r, l] = halves.slice(0, 2).map(h => h.attrs.BoundingBox.split(' ').map(Number));
  assert.ok(r[0] > l[0] && r[1] < r[3] && l[1] > l[3]);
});

test('FR-005 brackets, nested ones included, come back the same through CDXML and CDX', () => {
  const d = bracketDoc();
  for (const f of ['cdxml', 'cdx']){
    const back = F.read(f, F.write(f, d));
    assert.equal(back.skipped, undefined, f);
    same(back.brackets.map(q => q.type), ['square', 'curly', 'round'], f);
    const k = back.brackets[0].w / 60; // the reader rescales; proportions stay
    for (const [i, q] of d.brackets.entries()){ near(back.brackets[i].w / k, q.w, `${f} w ${i}`); near(back.brackets[i].h / k, q.h, `${f} h ${i}`); }
    if (f === 'cdxml') same(back.brackets.map(q => [q.sup || '', q.sub || '']), [['2–', ''], ['', 'n'], ['‡', '']], f);
  }
});

// ---------- FR-006 … FR-008, CON-004: dashed and hashed bond styles ----------
const sanitizeDoc = get('sanitizeDoc'), renderDoc = get('renderDoc'), buildIndex = get('buildIndex'), toOCL = get('toOCL'), MS = get('MS');
const styled = st => { const d = docFromSmiles(get, 'CC(C)CO'); d.bonds[1].stereo = st; return d; };

test('CON-004 the sanitizer keeps dashed and hashed; an unknown style still falls back to none', () => {
  same(sanitizeDoc(styled('dashed')).bonds[1].stereo, 'dashed');
  same(sanitizeDoc(styled('hashed')).bonds[1].stereo, 'hashed');
  same(sanitizeDoc(styled('zigzag')).bonds[1].stereo, 'none');
});

test('FR-008 dashed draws a dashed line, distinct from a hydrogen bond; hashed draws even hash marks', () => {
  const svgOf = d => renderDoc(d, buildIndex(d)).svg;
  const dashed = svgOf(styled('dashed')), hb = (() => { const d = styled('none'); d.bonds[1].kind = 'hbond'; return svgOf(d); })();
  const dash = s => [...s.matchAll(/stroke-dasharray="([\d.]+) ([\d.]+)"/g)].map(m => [+m[1], +m[2]]);
  assert.equal(dash(dashed).length, 1);
  assert.ok(dash(dashed)[0][0] > dash(hb)[0][0] * 1.5, 'longer dashes than a hydrogen bond');
  const hashed = svgOf(styled('hashed')), plain = svgOf(styled('none')), wedge = svgOf(styled('hash'));
  assert.notEqual(hashed, plain); assert.notEqual(hashed, wedge);
  const marks = s => { const m = [...s.matchAll(/<path d="((?:M[-\d.]+ [-\d.]+L[-\d.]+ [-\d.]+)+)"/g)].map(x => x[1]); return m.length ? [...m[0].matchAll(/M([-\d.]+) ([-\d.]+)L([-\d.]+) ([-\d.]+)/g)].map(q => Math.hypot(q[3] - q[1], q[4] - q[2])) : []; };
  const hm = marks(hashed), wm = marks(wedge);
  assert.ok(hm.length >= 3, 'several marks');
  assert.ok(Math.max(...hm) - Math.min(...hm) < 0.05, 'all marks the same length');
  assert.ok(Math.max(...wm) - Math.min(...wm) > 0.5, 'a hashed wedge widens (the fixture is right)');
});

test('FR-006, FR-008 dashed and hashed bonds are single bonds for formula, SMILES and molfile', () => {
  const plain = styled('none'), smi = d => { const m = toOCL(d, buildIndex(d)).mol; return [m.toIsomericSmiles(), MS.hill(MS.composition(m).counts), m.toMolfile().split('\n').slice(4).join('\n')]; };
  for (const st of ['dashed', 'hashed']) same(smi(styled(st)), smi(plain), st);
});

test('FR-007 ChemDraw Dash and Hash bonds open as the styles and are written back, in CDXML and CDX', () => {
  const x = cdxml(`<fragment id="1"><n id="2" p="0 0"/><n id="3" p="14.4 0"/><n id="4" p="21.6 12.47"/><b id="5" B="2" E="3" Display="Dash"/><b id="6" B="3" E="4" Display="Hash"/></fragment>`);
  same(F.read('cdxml', x).bonds.map(b => b.stereo), ['dashed', 'hashed']);
  for (const f of ['cdxml', 'cdx']){
    const d = { ...get('newDoc')(), ...F.read('cdxml', x) };
    same(F.read(f, F.write(f, d)).bonds.map(b => b.stereo), ['dashed', 'hashed'], f);
  }
  assert.match(F.write('cdxml', { ...get('newDoc')(), ...F.read('cdxml', x) }), /Display="Dash"[\s\S]*Display="Hash"/);
});
