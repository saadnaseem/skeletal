// PDF/EPS text uses the 14 standard fonts: characters they lack are spelled another way where possible, and reported.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadModules } from './load.mjs';
const get = loadModules();
get(readFileSync(new URL('../../src/pdf.js', import.meta.url), 'utf8'));
const PDF = get('PDF');
const text = s => PDF.segments(s).map(g => (g.sym ? '[sym]' : '') + String.fromCharCode(...g.bytes)).join('');

test('the Mac ∆ (Option-J) prints as the Symbol-font Delta, like Δ', () => {
  assert.equal(text('∆H'), '[sym]DH'); assert.equal(text('ΔH'), '[sym]DH');
  assert.deepEqual([...PDF.takeMissing()], []);
});

test('superscript signs and ligatures use their plain forms instead of "?"', () => {
  assert.equal(text('cm⁻¹'), 'cm\x96¹'); // − (WinAnsi 0x96), then ¹ from Latin-1
  assert.equal(text('10⁴'), '104');
  assert.equal(text('ﬁnal'), 'final');
  assert.equal(text('Erdős'), 'Erdos');
  assert.equal(PDF.takeMissing().length, 0);
});

test('characters with no stand-in become "?" and are reported once', () => {
  assert.equal(text('溶媒 A'), '?? A');
  assert.equal(PDF.takeMissing().join(''), '溶媒');
  assert.equal(PDF.takeMissing().length, 0, 'reading the list clears it');
});
