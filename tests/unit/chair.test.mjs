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

// six carbons in a ring at the given points
function ringDoc(pts, order = 1){
  const d = newDoc(); let id = 1;
  pts.forEach(p => d.atoms.push({ id: id++, x: p.x, y: p.y, el: 'C' }));
  for (let i = 0; i < 6; i++) d.bonds.push({ id: id++, a: i + 1, b: (i + 1) % 6 + 1, order: i === 0 ? order : 1, stereo: 'none' });
  d.nid = id; return d;
}
const findChairs = get('findChairs');
const turn = (p, t) => ({ x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) });
const near = (u, v, m) => assert.ok(Math.abs(u.x - v.x) < 1e-6 && Math.abs(u.y - v.y) < 1e-6, `${m}: (${u.x}, ${u.y}) vs (${v.x}, ${v.y})`);

test('chairs are recognised at any rotation, either way round and mirrored, and so are other programs’ chairs; a hexagon is not', () => {
  const c = chairFragment(false).atoms;
  for (const [name, pts] of [['chair', c], ['flipped', chairFragment(true).atoms], ['turned 70°', c.map(p => turn(p, 1.22))], ['numbered the other way', [...c].reverse()],
    // Ketcher's Chair1 template (molfile y up)
    ['Ketcher', [[4.9944, 2.4555], [6.7388, 3.0777], [9.2777, 2.1666], [10.4055, 4.161], [8.5333, 3.5388], [6.1166, 4.4555]].map(([x, y]) => ({ x: x * 8, y: -y * 8 }))]]){
    const d = ringDoc(pts); assert.equal(findChairs(d, buildIndex(d)).size, 6, name);
  }
  const hex = [...Array(6)].map((_, k) => ({ x: L * Math.cos(k * Math.PI / 3), y: L * Math.sin(k * Math.PI / 3) }));
  let d = ringDoc(hex); assert.equal(findChairs(d, buildIndex(d)).size, 0, 'a regular hexagon is not a chair');
  d = ringDoc(c, 2); assert.equal(findChairs(d, buildIndex(d)).size, 0, 'a ring with a double bond is not a chair');
});

test('axial bonds point straight up at the raised corners and down at the others; equatorial bonds run parallel to the next-but-one ring bonds, outwards', () => {
  for (const flip of [false, true]) for (const t of [0, 0.6]){
    const d = ringDoc(chairFragment(flip).atoms.map(p => turn(p, t))), m = findChairs(d, buildIndex(d)), up = turn({ x: 0, y: -1 }, t);
    const A = d.atoms, c = { x: A.reduce((s, p) => s + p.x, 0) / 6, y: A.reduce((s, p) => s + p.y, 0) / 6 };
    const ups = A.map((a, i) => { const s = m.get(a.id), raised = ((a.x - (A[(i + 5) % 6].x + A[(i + 1) % 6].x) / 2) * up.x + (a.y - (A[(i + 5) % 6].y + A[(i + 1) % 6].y) / 2) * up.y) > 0;
      near(s.ax, raised ? up : { x: -up.x, y: -up.y }, `axial at ${i}`);
      const b = { x: A[(i + 2) % 6].x - A[(i + 1) % 6].x, y: A[(i + 2) % 6].y - A[(i + 1) % 6].y };
      assert.ok(Math.abs(cross(s.eq, b)) < 1e-6, `equatorial at ${i} is parallel to a ring bond`);
      assert.ok(s.eq.x * (a.x - c.x) + s.eq.y * (a.y - c.y) > 0, `equatorial at ${i} points out`);
      assert.ok(s.eq.x * s.ax.x + s.eq.y * s.ax.y < 0, `equatorial at ${i} leans away from the axial bond`);
      return raised; });
    assert.deepEqual([...ups].map((u, i) => u !== ups[(i + 1) % 6]), [true, true, true, true, true, true], 'up and down corners alternate');
  }
});
