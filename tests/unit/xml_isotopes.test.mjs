// CML and Marvin MRV keep isotopes: CML writes isotopeNumber on the atom, MRV an isotope column in its atom array.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), newDoc = get('newDoc');

const masses = d => JSON.stringify(d.atoms.map(a => a.el + (a.iso ? '@' + a.iso : '')).sort());

for (const fmt of ['cml', 'mrv']) {
  test(`${fmt} keeps 13C and D through a round trip`, () => {
    for (const s of ['[13CH4]', '[2H]C([2H])([2H])O', 'C[13CH2]O', 'CCO']) {
      const d = docFromSmiles(get, s), back = F.read(fmt, F.write(fmt, d));
      assert.equal(masses({ ...newDoc(), ...back }), masses(d), s);
    }
  });
}

test('the attributes are the ones each format defines', () => {
  const d = docFromSmiles(get, 'C[13CH2]O');
  assert.match(F.write('cml', d), /<atom [^>]*elementType="C"[^>]*isotopeNumber="13"/);
  assert.match(F.write('mrv', d), /isotope="0 13 0"/);
  assert.doesNotMatch(F.write('cml', docFromSmiles(get, 'CCO')), /isotope/); // nothing written when nothing is labelled
  assert.doesNotMatch(F.write('mrv', docFromSmiles(get, 'CCO')), /isotope/);
});

test('isotopes in files written elsewhere are read', () => {
  const cml = `<cml xmlns="http://www.xml-cml.org/schema"><molecule id="m1"><atomArray><atom id="a1" elementType="C" isotopeNumber="13" x2="0" y2="0"/></atomArray></molecule></cml>`;
  assert.equal(F.read('cml', cml).atoms[0].iso, 13);
  const mrv = `<cml><MDocument><MChemicalStruct><molecule molID="m1"><atomArray atomID="a1 a2" elementType="C O" isotope="0 18" x2="0 1.54" y2="0 0"/>
    <bondArray><bond id="b1" atomRefs2="a1 a2" order="1"/></bondArray></molecule></MChemicalStruct></MDocument></cml>`;
  const r = F.read('mrv', mrv);
  assert.equal(JSON.stringify(r.atoms.map(a => a.iso || 0)), '[0,18]');
});
