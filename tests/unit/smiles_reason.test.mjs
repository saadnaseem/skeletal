// B7: a SMILES OpenChemLib can't read is refused with the reason in plain words, not just "not a valid SMILES".
// Text that reads as a word (a compound name like caffeine or 2-butanol) gets no reason, so it can still be looked up as a name.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as OCL from 'openchemlib';
import { loadModules } from './load.mjs';
const get = loadModules();
const smilesReason = get('smilesReason');
const reason = s => { try { OCL.Molecule.fromSmiles(s); } catch (e) { return smilesReason(s, e); } assert.fail(`${s} was read`); };

test('a ring number that is opened but never closed is named', () => {
  assert.match(reason('C1CC'), /^Ring bond 1 is opened but never closed/);
  assert.match(reason('C%12CC'), /^Ring bond 12 /);
  assert.match(reason('C1CC1C1'), /^Ring bond 1 /);
  assert.match(reason('c1ccccc'), /^Ring bond 1 /);
});

test('unbalanced parentheses and brackets say where', () => {
  assert.match(reason('CC)C'), /“\)” at character 3 has no “\(”/);
  assert.match(reason('C]C'), /“\]” at character 2 has no “\[”/);
  assert.match(reason('C[NH4+'), /“\[” at character 2 is never closed/);
  assert.match(reason('[Na+].[Cl-'), /“\[” at character 7 is never closed/);
  // Value: protects=a closed bracket with a bad character inside is not called unclosed; fails_when=the "last [ after last ]" guard is dropped; why_new=only unclosed cases were listed; seam=none; no_claim=none beyond protects
  assert.equal(reason('[C H]'), '');
});

test('an element that does not exist, or one that needs brackets, is named', () => {
  assert.match(reason('C[Xx]'), /“\[Xx\]” is not an element/);
  assert.match(reason('NaCl'), /“Na” has to be written in brackets/);
  assert.match(reason('C[Mn]C'.replace(/[[\]]/g, '')), /“Mn” has to be written in brackets/);
  assert.match(reason('c1ccccc1X'), /“X” at character 9 is not an atom/);
});

test('a bond with nothing after it is named', () => {
  assert.match(reason('C=C='), /ends with “=”/);
  assert.match(reason('CC.'), /ends with “\.”/);
});

test('words get no reason, so they can still be looked up as compound names', () => {
  for (const s of ['caffeine', 'xyz', '2-butanol', 'aspirin', 'Benzene']) assert.equal(reason(s), '', s);
});

test('an error that is not from the SMILES parser gets no reason', () => {
  assert.equal(smilesReason('C', new Error('out of memory')), '');
  assert.equal(smilesReason('C', 0), '');
});

// Value: protects=an empty or element-less bracket (C[], C[13]) is never said to have no "[" before it; fails_when=OCL's "closing bracket" message is
// worded as a missing "[" without checking for one (it is, at this commit); why_new=only a real stray "]" (C]C) was tested; seam=none;
// no_claim=which sentence is right for an empty bracket; '' (the plain message) also passes
test('a "]" that has a "[" before it is not called unopened', () => {
  for (const s of ['C[]', 'C[13]', '[]']) assert.doesNotMatch(reason(s), /has no “\[”/, s);
  assert.match(reason('C[13]'), /brackets at character 2 have no element/);
});

test('H, K and other one-letter elements outside the organic set are told to go in brackets', () => {
  assert.match(reason('HCl'), /“H” has to be written in brackets, as in \[H\]/);
  assert.match(reason('CK'), /“K” has to be written in brackets/);
  assert.match(reason('CL'), /“L” at character 2 is not an atom/);
});

// Value: protects=positions and names count an explicit [H] as written; fails_when=OCL's position (in the [1H] text smilesMol parses) is used
// as is; why_new=no case had [H] before the fault; seam=none; no_claim=none beyond protects
test('an explicit [H] before the fault does not shift the position', () => {
  const smilesMol = get('smilesMol');
  const viaApp = s => { try { smilesMol(s); } catch (e) { return smilesReason(s, e); } assert.fail(`${s} was read`); };
  assert.match(viaApp('[H]CC)C'), /“\)” at character 6/);
  assert.match(viaApp('[H]C]C'), /“\]” at character 5/);
  assert.match(viaApp('[H]CNaCl'), /“Na” has to be written in brackets/);
  assert.match(viaApp('[H]C1CC'), /^Ring bond 1 /);
});
