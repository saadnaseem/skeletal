// Subscripts and superscripts in text: the markup, its round trip with the editor's formatted characters, drawing and ChemDraw files.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModules, docFromSmiles } from './load.mjs';
const get = loadModules();
const F = get('FORMATS'), newDoc = get('newDoc'), renderDoc = get('renderDoc'), buildIndex = get('buildIndex'), textMetrics = get('textMetrics');
const textChars = get('textCharsAll'), toMarkup = get('charsToMarkup'), normalize = get('normalizeChars'), plainText = get('plainText');
const runs = s => JSON.parse(JSON.stringify(get('textRuns')(s))).map(r => [r.t, r.m]); // copy out of the VM realm
const modes = cs => cs.map(x => (x.m === 'sup' ? x.c.replace('-', '−') : x.c) + ':' + x.m).join(' ');
const cdxml = body => `<?xml version="1.0"?><CDXML>${body}</CDXML>`;

test('markup: _{…} and ^{…} take anything; formula digits and ^charges work as before', () => {
  assert.deepEqual(runs('pK_{a} 4.8'), [['pK', 'n'], ['a', 'sub'], [' 4.8', 'n']]);
  assert.deepEqual(runs('Fe^{III}'), [['Fe', 'n'], ['III', 'sup']]);
  assert.deepEqual(runs('[α]_{D}^{20}'), [['[α]', 'n'], ['D', 'sub'], ['20', 'sup']]);
  assert.deepEqual(runs('ΔG^{‡}'), [['ΔG', 'n'], ['‡', 'sup']]);
  assert.deepEqual(runs('H2SO4'), [['H', 'n'], ['2', 'sub'], ['SO', 'n'], ['4', 'sub']]);
  assert.deepEqual(runs('Pd(PPh3)4'), [['Pd(PPh', 'n'], ['3', 'sub'], [')', 'n'], ['4', 'sub']]);
  assert.deepEqual(runs('^13C NMR'), [['13', 'sup'], ['C NMR', 'n']]);
  assert.deepEqual(runs('SO4^{2-}'), [['SO', 'n'], ['4', 'sub'], ['2−', 'sup']], 'a hyphen in a charge is a minus sign');
  assert.deepEqual(runs('^{t-Bu}'), [['t-Bu', 'sup']], 'but not in a word');
});

test('markup: a digit right after a subscript group, or after a backslash, stays normal', () => {
  assert.deepEqual(runs('S_{N}2'), [['S', 'n'], ['N', 'sub'], ['2', 'n']]);
  assert.deepEqual(runs('E\\2 elimination'), [['E2 elimination', 'n']]);
  assert.deepEqual(runs('C\\C=C/C'), [['C\\C=C/C', 'n']], 'a backslash before anything else (SMILES) is kept');
  assert.deepEqual(runs('a_{b'), [['a_{b', 'n']], 'an unclosed group is plain text');
  assert.equal(plainText('pK_{a}, Fe^{III}\nH2O'), 'pKa, FeIII\nH2O');
});

test('formatted characters -> markup -> the same formatting, for fuzzed text and fuzzed editor content', () => {
  const A = 'aZ0129)]}{^_\\-+−‡ \n'; let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let k = 0; k < 20000; k++){
    let s = ''; for (let i = 0, n = 1 + rnd(14); i < n; i++) s += A[rnd(A.length)];
    const a = textChars(s); assert.equal(modes(textChars(toMarkup(a))), modes(a), JSON.stringify(s));
    const cs = []; for (let i = 0, n = 1 + rnd(10); i < n; i++) cs.push({ c: A[rnd(A.length)], m: ['n', 'n', 'sub', 'sup'][rnd(4)], keep: rnd(3) === 0, auto: rnd(5) === 0 });
    assert.equal(modes(textChars(toMarkup(cs))), modes(normalize(cs)), JSON.stringify(cs));
  }
});

test('the editor writes clean markup: formula digits plainly, a kept digit with a backslash', () => {
  const c = (s, m = 'n', f = {}) => [...s].map(x => ({ c: x, m, ...f }));
  assert.equal(toMarkup([...c('H'), ...c('2', 'sub'), ...c('O')]), 'H2O', 'a subscript the formula rule gives anyway');
  assert.equal(toMarkup([...c('pK'), ...c('a', 'sub')]), 'pK_{a}');
  assert.equal(toMarkup([...c('E'), ...c('2', 'n', { keep: true })]), 'E\\2');
  assert.equal(toMarkup([...c('CH'), ...c('3'), ...c('+', 'sup')]), 'CH3^{+}', 'typed digits after a letter become subscripts');
  assert.equal(toMarkup([...c('S'), ...c('N', 'sub'), ...c('2')]), 'S_{N}2');
  assert.equal(toMarkup([...c('x'), ...c('a}b', 'sup')]), 'x^{a\\}b}');
});

test('subscripts and superscripts are drawn smaller and shifted, never as markup', () => {
  const d = { ...newDoc(), texts: [{ id: 1, x: 0, y: 0, text: 'pK_{a}, Fe^{III}' }] };
  const { svg } = renderDoc(d, buildIndex(d));
  assert.ok(!svg.includes('_{') && !svg.includes('^{'), svg);
  const sub = /<tspan dy="([\d.-]+)" font-size="([\d.]+)">a<\/tspan>/.exec(svg), sup = /<tspan dy="([\d.-]+)" font-size="([\d.]+)">III<\/tspan>/.exec(svg);
  assert.ok(sub && +sub[1] > 0, 'subscript below the line');
  assert.ok(sup && +sup[1] < 0, 'superscript above the line');
  const m = textMetrics(d, d.texts[0]), plain = textMetrics(d, { ...d.texts[0], text: 'pKa, FeIII' });
  assert.ok(m.w < plain.w, 'the smaller characters take less room');
});

test('CDXML and CDX keep subscripts and superscripts (ChemDraw face 32 and 64)', () => {
  const d = newDoc(); d.texts.push({ id: 1, x: 0, y: 0, text: 'pK_{a} 4.8, [Fe^{III}(H2O)6]^{3+}, S_{N}2, E\\2' });
  const x = F.write('cdxml', d);
  assert.match(x, /face="32"[^>]*>a</); assert.match(x, /face="64"[^>]*>III</);
  for (const f of ['cdxml', 'cdx']) assert.equal(F.read(f, F.write(f, d)).texts[0].text, d.texts[0].text, f);
});

test('ChemDraw text opens with its subscripts, superscripts and Formula style', () => {
  const t = runs => F.read('cdxml', cdxml(`<page><t p="0 0">${runs}</t></page>`)).texts[0].text;
  assert.equal(t('<s face="0">λ</s><s face="32">max</s><s face="0"> 254 nm</s>'), 'λ_{max} 254 nm');
  assert.equal(t('<s face="0">Cu</s><s face="64">I</s>'), 'Cu^{I}');
  assert.equal(t('<s face="96">C6H12O6</s>'), 'C6H12O6', 'Formula style: the digits are subscripts here too');
  assert.equal(t('<s face="0">H</s><s face="32">2</s><s face="0">O</s>'), 'H2O');
  assert.equal(t('<s face="2">n</s><s face="0">-BuLi</s>'), 'n-BuLi');
  assert.equal(t('<s face="0">HPLC, C18 column, E2</s>'), 'HPLC, C\\18 column, E\\2', 'digits ChemDraw shows normal stay normal');
  // an atom label in Formula style is plain text, with no markup in the element symbol
  const r = F.read('cdxml', cdxml(`<page><fragment><n id="1" p="0 0" NodeType="Nickname"><t><s face="96">CO2Me</s></t></n></fragment></page>`));
  assert.ok(!/[\^_{}]/.test(r.atoms[0].el), r.atoms[0].el);
});

test('a superscript charge next to ChemDraw brackets becomes the bracket label', () => {
  const r = F.read('cdxml', cdxml(`<page><graphic id="4" BoundingBox="-6 -10 20.4 10" GraphicType="Bracket" BracketType="SquarePair"/>
    <t id="5" p="22 -12" BoundingBox="22 -16 30 -9"><s face="64">2−</s></t></page>`));
  assert.equal(r.brackets[0].sup, '2-'); assert.equal(r.texts.length, 0);
});

test('chemfig reaction labels: set subscripts and superscripts become \\textsubscript and \\textsuperscript', () => {
  const lay = (smi, x0) => { const p = docFromSmiles(get, smi), mx = Math.min(...p.atoms.map(a => a.x)); p.atoms.forEach(a => { a.x += x0 - mx; }); return p; };
  const d = newDoc(); let id = 1;
  for (const p of [lay('CCO', 0), lay('CC=O', 200)]) { const m = new Map(); p.atoms.forEach(a => { m.set(a.id, id); d.atoms.push({ ...a, id: id++ }); }); p.bonds.forEach(b => d.bonds.push({ ...b, id: id++, a: m.get(b.a), b: m.get(b.b) })); }
  const y = d.atoms.reduce((t, a) => t + a.y, 0) / d.atoms.length;
  d.arrows.push({ id: id++, type: 'reaction', x1: 100, y1: y, x2: 180, y2: y });
  d.texts.push({ id: id++, x: 140, y: y - 12, text: 'K_{2}Cr2O7, H^{+} {1}' }); d.nid = id;
  assert.match(F.write('chemfig', d), /\\arrow\{->\[K\\textsubscript\{2\}Cr2O7, H\\textsuperscript\{\+\} 1\]\}/);
});
