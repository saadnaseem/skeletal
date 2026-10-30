// Project-file sanitizer, prototype-safe lookup tables and the XML reader's handling of broken input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const sanitizeProject = get('sanitizeProject'), sanitizeDoc = get('sanitizeDoc'), kindOf = get('kindOf'), toOCL = get('toOCL'), buildIndex = get('buildIndex'), F = get('FORMATS');

const XSS = '"><img src=x onerror=alert(1)>';

test('version ids that are not plain tokens are dropped (they end up in HTML attributes)', () => {
  const p = sanitizeProject({ versions: [
    { id: XSS, name: 'bad', time: '2026-10-01T00:00:00Z', pages: '[]' },
    { id: 'abc123', name: 'good', time: '2026-10-01T00:00:00Z', pages: '[]' },
    { id: 'ok', name: 'no pages', time: '', pages: { not: 'a string' } },
    null, 'junk',
  ] });
  assert.equal(p.versions.length, 1);
  assert.equal(p.versions[0].id, 'abc123');
  assert.equal(p.versions[0].name, 'good');
});

test('version names, times and sizes are coerced', () => {
  const [v] = sanitizeProject({ versions: [{ id: 'v1', name: { evil: 1 }, time: 'not a date', pages: '[]' }] }).versions;
  assert.equal(v.name, 'Version');
  assert.equal(v.time, new Date(0).toISOString());
  assert.equal(sanitizeProject({ versions: [{ id: 'big', pages: 'x'.repeat(20e6 + 1) }] }).versions.length, 0);
});

test('uid, name, cur and nextPage are coerced so saving and page switching keep working', () => {
  const p = sanitizeProject({ uid: XSS, name: { a: 1 }, cur: 'x', nextPage: 'y', modified: 'z', pages: [{ id: 'a', name: 7 }, { id: 2 }, { id: 2 }] });
  assert.match(p.uid, /^[a-z0-9]{1,16}$/);
  assert.equal(p.name, 'Untitled project');
  assert.equal(p.cur, 0);
  assert.equal(p.modified, 0);
  const ids = p.pages.map(pg => pg.id);
  assert.equal(new Set(ids).size, 3, 'page ids are unique');
  assert.ok(ids.every(Number.isInteger));
  assert.ok(p.nextPage > Math.max(...ids));
  assert.equal(p.pages.map(pg => pg.name).join('|'), 'Page 1|Page 2|Page 3');
});

test('a valid project passes through unchanged', () => {
  const src = { v: 2, uid: 'k3j4h5', name: 'Thesis figures', rev: 'r1', cur: 1, nextPage: 3, modified: 1700000000000,
    pages: [{ id: 1, name: 'Scheme 1', doc: {} }, { id: 2, name: 'Scheme 2', doc: {} }],
    versions: [{ id: 'a1b2c3d', name: 'Draft', time: '2026-10-01T12:00:00.000Z', pages: '[]' }] };
  const p = sanitizeProject(src);
  for (const k of ['uid', 'name', 'rev', 'cur', 'nextPage', 'modified']) assert.equal(p[k], src[k], k);
  assert.equal(p.pages.length, 2);
  assert.equal(p.versions[0].time, src.versions[0].time);
});

test('non-objects become an empty one-page project', () => {
  for (const bad of [null, 'x', 42, [1, 2]]) {
    const p = sanitizeProject(bad);
    assert.equal(p.pages.length, 1);
    assert.equal(p.versions.length, 0);
  }
});

test('labels named after Object.prototype members are generic labels, not abbreviations', () => {
  for (const el of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) assert.equal(kindOf(el), 'generic', el);
});

test('a drawing with such a label still converts to a molecule', () => {
  const d = docFromSmiles(get, 'CCO');
  d.atoms[0].el = 'constructor';
  const clean = sanitizeDoc(d);
  assert.doesNotThrow(() => toOCL(clean, buildIndex(clean)));
  assert.doesNotThrow(() => F.write('cdxml', clean));
});

test('an unterminated CDATA section ends the parse instead of looping forever', () => {
  const t0 = Date.now();
  const root = F._xmlParse('<CDXML><t><![CDATA[abc</t></CDXML>');
  assert.ok(root && Date.now() - t0 < 1000);
  assert.doesNotThrow(() => F.read('cdxml', '<CDXML><page><![CDATA[x'));
});

test('bad character references become U+FFFD; unknown entities stay as written', () => {
  const root = F._xmlParse('<a>&#x110000;&#xD800;&#0;&constructor;&amp;</a>');
  assert.equal(root.children[0].text, '���&constructor;&');
});
