// A V2000 molfile's wedges mean what they show. RDKit (and many other programs) write chiral flag 0 in every file, which
// strictly means "racemic"; RDKit, Indigo and ChemDraw still read the wedges as one enantiomer, and so does Lone Pair.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, OCL } from './load.mjs';
const get = loadModules();
const molfileMol = get('molfileMol');

// L-alanine and beta-D-glucopyranose as RDKit 2026.09 writes them: wedges, chiral flag 0
const ALA = `
     RDKit          2D

  6  5  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    2.2500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981   -0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981   -1.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.8971    0.7500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  2  1  1  6
  2  3  1  0
  2  4  1  0
  4  5  2  0
  4  6  1  0
M  END
`;
const GLUCOSE = `
     RDKit          2D

 12 12  0  0  0  0  0  0  0  0999 V2000
    3.7500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500    1.2990    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500    1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000    2.5981    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -3.0000    0.0000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
   -0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
   -1.5000   -2.5981    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    0.7500   -1.2990    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.5000   -2.5981    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  1  2  1  0
  3  2  1  6
  3  4  1  0
  4  5  1  0
  5  6  1  0
  5  7  1  0
  7  8  1  1
  7  9  1  0
  9 10  1  6
  9 11  1  0
 11 12  1  1
 11  3  1  0
M  END
`;
const same = (mol, smiles) => assert.equal(mol.getIDCode(), OCL.Molecule.fromSmiles(smiles).getIDCode(), mol.toIsomericSmiles());
const flag = (molfile, f) => molfile.replace(/^( {2}\d {2}\d(?: {2}\d){2}) {2}0/m, `$1  ${f}`);

test('wedges in a chiral-flag-0 V2000 file are read as drawn, and the caller is told', () => {
  const r = molfileMol(ALA);
  assert.equal(r.asDrawn, true);
  same(r.mol, 'C[C@H](N)C(=O)O'); // L-alanine, not racemic
  const g = molfileMol(GLUCOSE);
  assert.equal(g.asDrawn, true);
  same(g.mol, 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O');
});

test('a file that already says chiral, or has no wedges, is read unchanged and not reported', () => {
  const chiral = flag(ALA, 1);
  assert.match(chiral.split('\n')[3], /^ {2}6 {2}5 {2}0 {2}0 {2}1/);
  const r = molfileMol(chiral);
  assert.equal(r.asDrawn, false);
  same(r.mol, 'C[C@H](N)C(=O)O');
  const flat = molfileMol(ALA.replace('  2  1  1  6', '  2  1  1  0'));
  assert.equal(flat.asDrawn, false);
  same(flat.mol, 'CC(N)C(=O)O');
});

test('a wavy ("either") bond is not a stereo claim, so the file is left alone', () => {
  const r = molfileMol(ALA.replace('  2  1  1  6', '  2  1  1  4'));
  assert.equal(r.asDrawn, false);
});

test('a molfile whose blank name line was trimmed off (paste, file open) still reads', () => {
  // RDKit leaves line 1 empty; trimming the text drops it and the leading spaces, so the counts line moves up
  for (const t of [ALA.trim(), ALA.replace(/^\n/, ''), ALA.trimStart()]) {
    const r = molfileMol(t);
    assert.equal(r.mol.getAllAtoms(), 6);
    assert.equal(r.asDrawn, true);
    same(r.mol, 'C[C@H](N)C(=O)O');
  }
  const v3 = OCL.Molecule.fromSmiles('CCO'); v3.inventCoordinates();
  assert.equal(molfileMol(v3.toMolfileV3().trim()).mol.getAllAtoms(), 3);
});

test('V3000 files are read as before', () => {
  const v3 = OCL.Molecule.fromSmiles('C[C@H](N)C(=O)O'); v3.inventCoordinates();
  const r = molfileMol(v3.toMolfileV3());
  assert.equal(r.asDrawn, false);
  same(r.mol, 'C[C@H](N)C(=O)O');
});
