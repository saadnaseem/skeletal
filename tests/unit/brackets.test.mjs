// Brackets: square, curly and round pairs with IUPAC corner labels, kept through saved files and ChemDraw files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), newDoc = get('newDoc'), sanitizeDoc = get('sanitizeDoc'), renderDoc = get('renderDoc'), buildIndex = get('buildIndex');
const bracketBBox = get('bracketBBox'), rescaleDoc = get('rescaleDoc');
const same = (a, b, m) => assert.equal(JSON.stringify(a), JSON.stringify(b), m); // values from the VM are another realm
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.05, `${m}: ${a} vs ${b}`);
const cdxml = body => `<?xml version="1.0"?><CDXML>${body}</CDXML>`;

// an ammonium ion in square brackets with its charge, inside a curly brace with a count, and a round pair with a dagger
function scheme(){
  const d = docFromSmiles(get, 'C[N+](C)(C)C');
  d.brackets = [
    { id: 900, type: 'square', x: 0, y: 0, w: 40, h: 36, sup: '+' },
    { id: 901, type: 'curly', x: 0, y: 0, w: 60, h: 50, sub: 'n' },
    { id: 902, type: 'round', x: 120, y: 0, w: 40, h: 30, sup: '‡' },
  ];
  d.nid = 903;
  return d;
}

test('saved files keep brackets; bad values are cleaned up', () => {
  const s = sanitizeDoc({ brackets: [
    { id: 1, type: 'square', x: 1, y: 2, w: 30, h: 40, sup: '2-', sub: 'n', color: '#d1231f', g: 3 },
    { id: 2, type: 'zigzag', x: 'a', y: 0, w: -5, h: 1e9, sup: 'x'.repeat(50), color: 'red;' },
  ] });
  same(s.brackets[0], { id: 1, x: 1, y: 2, w: 30, h: 40, type: 'square', sup: '2-', sub: 'n', color: '#d1231f', g: 3 });
  const b = s.brackets[1];
  assert.equal(b.type, 'square', 'an unknown type falls back to square brackets');
  assert.equal(b.x, 0); assert.equal(b.w, 2); assert.equal(b.h, 5000); assert.equal(b.sup.length, 20); assert.equal(b.color, undefined);
  same(newDoc().brackets, []);
});

test('each type draws a pair at the bond line width, with labels at the top and bottom right', () => {
  const d = scheme(), { svg } = renderDoc(d, buildIndex(d));
  const paths = [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="#000" stroke-width="([\d.]+)" stroke-linejoin="(\w+)"/g)];
  assert.equal(paths.length, 3);
  assert.equal(paths[0][1].match(/M/g).length, 2, 'two brackets per pair');
  assert.ok(!/C/.test(paths[0][1]), 'square brackets are straight lines');
  assert.ok(/C/.test(paths[1][1]) && /C/.test(paths[2][1]), 'curly and round brackets are curves');
  assert.equal(+paths[0][2], get('S')(d).lineWidth);
  assert.match(svg, />n<\/text>/); assert.match(svg, />‡<\/text>/);
  // the labels are outside the bracket on the right; the charge is near the top, the count near the bottom
  // (the ammonium's own + is drawn too, so look for one at the bracket corner)
  const pluses = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>\+<\/text>/g)], sub = /<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>n<\/text>/.exec(svg);
  assert.ok(pluses.some(m => +m[1] > 20 && +m[2] < -10), 'charge at the top right of the square brackets');
  assert.ok(+sub[1] > 30 && +sub[2] > 25, 'count at the bottom right of the braces');
  const bb = bracketBBox(d, d.brackets[0]);
  assert.ok(bb.x1 > 20 && bb.y0 < -18, 'the bounds take in the label');
});

test('a typed hyphen in a charge is drawn as a minus sign, and labels cannot inject markup', () => {
  const d = { ...newDoc(), brackets: [{ id: 1, type: 'square', x: 0, y: 0, w: 30, h: 30, sup: '2-', sub: '<b>n</b>' }] };
  const { svg } = renderDoc(d, buildIndex(d));
  assert.match(svg, />2−<\/text>/);
  assert.ok(!svg.includes('<b>'), svg);
});

test('brackets scale with the drawing when the style changes the bond length', () => {
  const d = scheme(); rescaleDoc(d, 0.5);
  const q = d.brackets[2];
  near(q.w, 20, 'width'); near(q.h, 15, 'height');
});

test('brackets and their labels round-trip through CDXML and CDX', () => {
  const d = scheme();
  for (const f of ['cdxml', 'cdx']){
    const back = F.read(f, F.write(f, d));
    assert.equal(back.skipped, undefined, `${f}: nothing left out`);
    same(back.brackets.map(q => q.type), ['square', 'curly', 'round'], f);
    if (f === 'cdxml'){ // labels travel as text next to the bracket and come back as its labels
      same(back.brackets.map(q => [q.sup || '', q.sub || '']), [['+', ''], ['', 'n'], ['‡', '']], 'each label goes back to its own bracket');
      assert.equal(back.texts.length, 0, 'no stray label text');
    }
    // same size, relative to the bonds
    const r = back.brackets[0].w / back.brackets[2].w; near(r, 1, `${f} proportions`);
  }
  assert.match(F.write('cdxml', d), /GraphicType="Bracket" BracketType="SquarePair"/);
});

test('ChemDraw brackets open with their repeat count; single brackets are reported', () => {
  const x = cdxml(`<page><fragment><n id="1" p="0 0"/><n id="2" p="14.4 0"/><b id="3" B="1" E="2"/></fragment>
    <graphic id="4" BoundingBox="-6 -10 20.4 10" GraphicType="Bracket" BracketType="SquarePair"/>
    <t id="5" p="22 14" BoundingBox="22 8 26 15"><s font="3" size="7.5" face="0">n</s></t>
    <graphic id="6" BoundingBox="40 -10 50 10" GraphicType="Bracket" BracketType="Square"/>
    <graphic id="7" BoundingBox="60 -10 80 10" GraphicType="Bracket"/></page>`);
  const r = F.read('cdxml', x);
  same(r.brackets.map(q => [q.type, q.sub || '']), [['square', 'n'], ['round', '']], 'no BracketType means a pair of parentheses');
  assert.equal(r.texts.length, 0);
  same(r.skipped, { bracket: 1 });
});
