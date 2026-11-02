// Cyclohexane chair templates: the textbook chair and its ring-flipped mirror image.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, OCL } from './load.mjs';
const get = loadModules();
const chairFragment = get('chairFragment'), newDoc = get('newDoc'), buildIndex = get('buildIndex'), toOCL = get('toOCL'), L = get('L');
const F = get('FORMATS'), scaleLayout = get('scaleLayout'), fromOCL = get('fromOCL');

function chairDoc(flip){
  const f = chairFragment(flip), d = newDoc(); let id = 1;
  f.atoms.forEach(a => { d.atoms.push({ ...a, id: id++ }); });
  f.bonds.forEach(b => d.bonds.push({ ...b, id: id++, a: b.a + 1, b: b.b + 1 }));
  d.nid = id; return d;
}
const P = (d, i) => d.atoms[i % 6];
const vec = (d, i) => ({ x: P(d, i + 1).x - P(d, i).x, y: P(d, i + 1).y - P(d, i).y });
const cross = (u, v) => u.x * v.y - u.y * v.x;
function crosses(a, b, c, e){ // do segments ab and ce cross?
  const s = (p, q, r) => Math.sign(cross({ x: q.x - p.x, y: q.y - p.y }, { x: r.x - p.x, y: r.y - p.y }));
  return s(a, b, c) * s(a, b, e) < 0 && s(c, e, a) * s(c, e, b) < 0;
}

for (const flip of [false, true]){
  test(`chair${flip ? ' (ring-flipped)' : ''}: six carbons in a ring, every bond one bond length, opposite bonds parallel`, () => {
    const d = chairDoc(flip);
    assert.equal(d.atoms.length, 6); assert.equal(d.bonds.length, 6);
    for (let i = 0; i < 6; i++){
      const v = vec(d, i); assert.ok(Math.abs(Math.hypot(v.x, v.y) - L) < 1e-9, `bond ${i}`);
      assert.ok(Math.abs(cross(v, vec(d, i + 3))) < 1e-9, `bond ${i} is parallel to bond ${i + 3}`);
    }
    // the outline never crosses itself
    for (let i = 0; i < 6; i++) for (let j = i + 2; j < 6; j++){ if ((j + 1) % 6 === i) continue;
      assert.ok(!crosses(P(d, i), P(d, i + 1), P(d, j), P(d, j + 1)), `bonds ${i} and ${j} cross`); }
    // the back edge (C2-C3) is drawn above the front edge (C5-C6); screen y points down
    assert.ok((P(d, 1).y + P(d, 2).y) / 2 < (P(d, 4).y + P(d, 5).y) / 2 - L * 0.3);
    // centred, and it is cyclohexane
    assert.ok(Math.abs(d.atoms.reduce((t, a) => t + a.x, 0)) < 1e-9 && Math.abs(d.atoms.reduce((t, a) => t + a.y, 0)) < 1e-9);
    assert.equal(toOCL(d, buildIndex(d)).mol.toSmiles(), 'C1CCCCC1');
  });
}

test('the first chair has its foot down on the left and its head up on the right; the ring flip mirrors it', () => {
  const a = chairDoc(false), b = chairDoc(true);
  const left = d => d.atoms.reduce((m, p) => p.x < m.x ? p : m), right = d => d.atoms.reduce((m, p) => p.x > m.x ? p : m);
  assert.ok(left(a).y > right(a).y + L * 0.3, 'chair 1: the left end is lower');
  assert.ok(left(b).y < right(b).y - L * 0.3, 'flipped: the left end is higher');
  for (let i = 0; i < 6; i++){ assert.ok(Math.abs(a.atoms[i].x + b.atoms[i].x) < 1e-9 && Math.abs(a.atoms[i].y - b.atoms[i].y) < 1e-9, 'mirror image'); }
});

test('a chair keeps its shape through ChemDraw and molfile export', () => {
  const d = chairDoc(false), key = ps => ps.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).sort().join(' ');
  const r = F.read('cdxml', F.write('cdxml', d));
  assert.equal(key(r.atoms), key(d.atoms), 'cdxml');
  // a molfile, opened the way the app opens one (its coordinates kept, scaled to one bond length)
  const mol = OCL.Molecule.fromMolfile(toOCL(d, buildIndex(d)).mol.toMolfile()); scaleLayout(mol);
  const m = fromOCL(mol).atoms, cx = m.reduce((t, p) => t + p.x, 0) / 6, cy = m.reduce((t, p) => t + p.y, 0) / 6;
  assert.equal(key(m.map(p => ({ x: p.x - cx, y: p.y - cy }))), key(d.atoms), 'molfile');
});
