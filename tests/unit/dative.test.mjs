// A ligand's lone pair donated to a metal or boron is a dative bond: it doesn't take one of the donor's hydrogens.
// SMILES writes these either as an explicit H count ([NH3] on Pt) or as a dative bond (N->B); both come in as dative bonds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const toOCL = get('toOCL'), buildIndex = get('buildIndex');

const read = smiles => { const d = docFromSmiles(get, smiles), ix = buildIndex(d); return { d, ix, formula: toOCL(d, ix).mol.getMolecularFormula().formula }; };
const datives = ({ d }) => { const el = id => d.atoms.find(a => a.id === id).el; return d.bonds.filter(b => b.kind === 'dative').map(b => el(b.a) + '>' + el(b.b)).sort().join(' '); };

test('ammine and aqua ligands keep their hydrogens', () => {
  const cis = read('Cl[Pt](Cl)([NH3])[NH3]');
  assert.equal(cis.formula, 'H6N2Cl2Pt');
  assert.equal(datives(cis), 'N>Pt N>Pt');
  const aqua = read('[OH2][Cu+2]([OH2])([OH2])[OH2]');
  assert.equal(aqua.formula, 'H8O4Cu');
  assert.equal(datives(aqua), 'O>Cu O>Cu O>Cu O>Cu');
});

test('a dative bond written in the SMILES (N->B) comes in as one', () => {
  const ab = read('N->[BH3]');
  assert.equal(ab.formula, 'H6NB');
  assert.equal(datives(ab), 'N>B');
  assert.equal(ab.d.bonds.length, 1);
});

test('ligands whose hydrogens already add up keep ordinary bonds', () => {
  for (const [s, f] of [['[Pd](P(c1ccccc1)(c1ccccc1)c1ccccc1)P(c1ccccc1)(c1ccccc1)c1ccccc1', 'C36H32P2Pd'], ['C[Mg]Br', 'CH3BrMg'],
    ['C[N+](C)(C)C', 'C4H12N'], ['[Fe](C#O)(C#O)(C#O)(C#O)C#O', 'C5O5Fe'], ['NCC(=O)O', 'C2H5NO2']]) {
    const r = read(s);
    assert.equal(r.formula, f, s);
    assert.equal(datives(r), '', s);
  }
});
