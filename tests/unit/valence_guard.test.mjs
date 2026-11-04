// Spec 001 (valence guard): overValent(fragment) runs the same valenceError rule as the red warning on a fragment before it
// is inserted. Fragments are {atoms, bonds} with bonds pointing at atom indices, as fromOCL makes them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const smilesMol = get('smilesMol'), fromOCL = get('fromOCL'), scaleLayout = get('scaleLayout');
const overValent = get('typeof overValent==="function" ? overValent : null');
const valenceError = get('valenceError'), buildIndex = get('buildIndex');

const frag = s => { const m = smilesMol(s); m.inventCoordinates(); scaleLayout(m); return fromOCL(m); };
const flagged = s => [...overValent(frag(s))]; // copied into this realm, so deepEqual compares contents

const ACCEPT = {
  SF6: 'FS(F)(F)(F)(F)F', PCl5: 'ClP(Cl)(Cl)(Cl)Cl', IF7: 'FI(F)(F)(F)(F)(F)F', 'PhI(OAc)2': 'CC(=O)OI(OC(C)=O)c1ccccc1',
  'ClO4-': '[O-]Cl(=O)(=O)=O', DMSO: 'CS(C)=O', tetramethylammonium: 'C[N+](C)(C)C', cisplatin: 'Cl[Pt](Cl)([NH3])[NH3]',
  ferrocene: '[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1',
  wilkinson: 'Cl[Rh]([P](c1ccccc1)(c1ccccc1)c1ccccc1)([P](c1ccccc1)(c1ccccc1)c1ccccc1)[P](c1ccccc1)(c1ccccc1)c1ccccc1',
  grubbsII: 'CC1=CC(C)=C(N2CCN(C2=[Ru](Cl)(Cl)(=Cc2ccccc2)P(C2CCCCC2)(C2CCCCC2)C2CCCCC2)c2c(C)cc(C)cc2C)C(C)=C1',
};
const REFUSE = { 'C(C)(C)(C)(C)C': ['C', 5, 4], 'N(C)(C)(C)C': ['N', 4, 3], 'O(C)(C)C': ['O', 3, 2], 'F(C)C': ['F', 2, 1] };

test('TG-01 overValent exists in core.js', () => assert.equal(typeof overValent, 'function'));

test('FR-006 accepts hypervalent, charged and metal compounds', () => {
  for (const [name, s] of Object.entries(ACCEPT)) assert.deepEqual(flagged(s), [], name);
});

test('FR-002 flags a five-bond C, four-bond N, three-bond O and two-bond F, naming element and counts', () => {
  for (const [s, [el, have, max]] of Object.entries(REFUSE)){
    const r = flagged(s);
    assert.equal(r.length, 1, s);
    const f = frag(s);
    assert.equal(f.atoms[r[0].atomIndex].el, el, s);
    assert.equal(r[0].have, have, s); assert.equal(r[0].max, max, s);
    assert.match(r[0].why, new RegExp(`^${el} has ${have} bonds; at most ${max}$`), s);
  }
});

test('FR-002 reports every over-valent atom, in atom order', () => {
  const r = flagged('C(C)(C)(C)(C)CC(C)(C)(C)(C)C');
  assert.equal(r.length, 2);
  assert.ok(r[0].atomIndex < r[1].atomIndex);
});

test('overValent leaves the fragment unchanged (ids stay 0, bonds stay index-based)', () => {
  const f = frag('C(C)(C)(C)(C)C'), before = JSON.stringify(f);
  overValent(f);
  assert.equal(JSON.stringify(f), before);
});

test('CON-001 agrees with valenceError on the inserted drawing', () => {
  for (const s of [...Object.values(ACCEPT), ...Object.keys(REFUSE), 'C(C)(C)(C)(C)CC(C)(C)(C)(C)C']){
    const d = docFromSmiles(get, s), ix = buildIndex(d);
    const onDoc = d.atoms.map((a, i) => valenceError(a, ix) ? i : -1).filter(i => i >= 0);
    assert.deepEqual(flagged(s).map(r => r.atomIndex), [...onDoc], s);
  }
});

test('NFR-001 200-atom check under 20 ms (median of 20 runs)', () => {
  const f = frag('C'.repeat(200));
  assert.equal(f.atoms.length, 200);
  const t = [];
  for (let i = 0; i < 20; i++){ const t0 = performance.now(); overValent(f); t.push(performance.now() - t0); }
  t.sort((a, b) => a - b);
  assert.ok(t[10] < 20, `median ${t[10].toFixed(2)} ms`);
});
