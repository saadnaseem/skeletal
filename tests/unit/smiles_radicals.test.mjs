// SMILES atoms written outside brackets fill their valence with H, so they can't be radicals. OpenChemLib makes one anyway when it
// can't give an aromatic ring alternating double bonds (c1cccc1, or a ring N-H written n instead of [nH]); those are caught, real radicals are not.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules } from './load.mjs';
const get = loadModules();
const smilesMol = get('smilesMol'), inventedRadicals = get('inventedRadicals');
const invented = s => [...inventedRadicals(s, smilesMol(s))];

test('a radical OpenChemLib invents on an unbracketed aromatic atom is reported', () => {
  assert.equal(invented('c1cccc1').length, 1);
  assert.equal(invented('c1ccc[nH]c1').length, 1);
  assert.equal(invented('Cc1cccc1C').length, 1);
});

test('radicals written in brackets, and ordinary molecules, are not', () => {
  for (const s of ['[CH3]', '[c]1ccccc1', 'C[O]', '[CH2]C=C', 'c1ccccc1', 'c1cc[nH]c1', 'c1ccc2[nH]ccc2c1', 'n1ccccc1', 'c1cc[cH-]c1',
    'Cl[Pt](Cl)([NH3])[NH3]', 'OC(=O)c1ccc(Br)cc1', '[H]C([H])([H])O', 'C[C@H](N)C(=O)O', '*c1ccccc1'])
    assert.deepEqual(invented(s), [], s);
});
