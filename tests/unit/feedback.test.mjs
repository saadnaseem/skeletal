import { test } from 'node:test';
import assert from 'node:assert/strict';
import { feedback, buildEmail, _test } from '../../server/feedback.js';
import { api } from '../../server/api.js';

class FakeMessage { constructor(from, to, raw) { Object.assign(this, { from, to, raw }); } }
const env = () => { const sent = []; return { sent, FEEDBACK_TO: 'owner@example.com', FEEDBACK: { send: async m => { sent.push(m); } } }; };
const post = (body, headers = {}) => new Request('https://lonepair.app/api/feedback', { method: 'POST',
  headers: { origin: 'https://lonepair.app', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.' + Math.floor(Math.random() * 250), ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body) });
const decode = raw => new TextDecoder().decode(Uint8Array.from(atob(raw.split('\r\n\r\n')[1].replace(/\r\n/g, '')), c => c.charCodeAt(0)));

test('a message is emailed to the owner, with a reply address and context', async () => {
  const e = env();
  const r = await feedback(post({ message: 'Love it! Could the eraser… ✨\nsecond line', email: 'ada@example.com', context: { smiles: 'CCO', page: '/' } }), e, FakeMessage);
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true });
  assert.equal(e.sent.length, 1);
  const m = e.sent[0];
  assert.equal(m.from, 'feedback@lonepair.app'); assert.equal(m.to, 'owner@example.com');
  assert.match(m.raw, /^From: Lone Pair feedback <feedback@lonepair.app>\r\nTo: <owner@example.com>\r\nReply-To: <ada@example.com>\r\nSubject: =\?UTF-8\?B\?/);
  assert.match(m.raw, /\r\nMessage-ID: <[0-9a-f-]+@lonepair.app>\r\n/);
  const text = decode(m.raw);
  assert.match(text, /^Love it! Could the eraser… ✨\r\nsecond line/); assert.match(text, /From: ada@example.com/); assert.match(text, /Drawing \(SMILES\): CCO/);
});

test('subject is plain ASCII when it can be, and the email is optional', () => {
  const raw = buildEmail({ to: 'o@example.com', message: 'Bug: export fails', email: '' });
  assert.match(raw, /\r\nSubject: Lone Pair feedback: Bug: export fails\r\n/); assert.doesNotMatch(raw, /Reply-To/);
  assert.match(decode(raw), /From: \(no email given\)/);
});

test('bad input, other sites and bots are turned away', async () => {
  const e = env();
  assert.equal((await feedback(post({ message: '   ' }), e, FakeMessage)).status, 400);
  assert.equal((await feedback(post({ message: 'x'.repeat(5001) }), e, FakeMessage)).status, 400);
  assert.equal((await feedback(post({ message: 'hi', email: 'not an email' }), e, FakeMessage)).status, 400);
  assert.equal((await feedback(post({ message: 'hi', email: 'a@b.com\r\nBcc: x@y.com' }), e, FakeMessage)).status, 400); // no header injection
  assert.equal((await feedback(post('{nope'), e, FakeMessage)).status, 400);
  assert.equal((await feedback(post({ message: 'hi' }, { origin: 'https://evil.example' }), e, FakeMessage)).status, 403);
  assert.equal((await feedback(new Request('https://lonepair.app/api/feedback'), e, FakeMessage)).status, 405);
  const bot = await feedback(post({ message: 'buy now', website: 'http://spam' }), e, FakeMessage);
  assert.equal(bot.status, 200); // the honeypot pretends it worked
  assert.equal(e.sent.length, 0);
});

test('not set up: answers 503 and sends nothing', async () => {
  const r = await feedback(post({ message: 'hi' }), { FEEDBACK: { send: async () => assert.fail() } }, FakeMessage);
  assert.equal(r.status, 503);
});

test('a burst from one visitor is slowed down', async () => {
  _test.recent.clear(); const e = env(), ip = { 'cf-connecting-ip': '198.51.100.7' };
  for (let i = 0; i < 5; i++) assert.equal((await feedback(post({ message: 'm' + i }, ip), e, FakeMessage)).status, 200);
  assert.equal((await feedback(post({ message: 'one too many' }, ip), e, FakeMessage)).status, 429);
  assert.equal(e.sent.length, 5);
});

test('a failed send is reported, not swallowed', async () => {
  const r = await feedback(post({ message: 'hi' }), { FEEDBACK_TO: 'o@example.com', FEEDBACK: { send: async () => { throw new Error('destination not verified'); } } }, FakeMessage);
  assert.equal(r.status, 502);
});

test('the /api router sends feedback and sign-in to the right handler', async () => {
  const e = env();
  assert.equal((await api(post({ message: 'via router' }), e, { EmailMessage: FakeMessage })).status, 200);
  assert.equal(e.sent.length, 1);
  const me = await api(new Request('https://lonepair.app/api/me'), {});
  assert.deepEqual(await me.json(), { available: false, signedIn: false });
});

test('IPv6 visitors are limited per /64, and IPv4-mapped addresses as plain IPv4', async () => {
  const { addressBlock } = _test;
  assert.equal(addressBlock('2001:db8:abcd:12:1::5'), '2001:db8:abcd:12::/64');
  assert.equal(addressBlock('2001:DB8:abcd:0012:ffff:1:2:3'), '2001:db8:abcd:12::/64');
  assert.equal(addressBlock('::ffff:198.51.100.9'), '198.51.100.9');
  assert.equal(addressBlock('198.51.100.9'), '198.51.100.9');
  _test.recent.clear(); _test.sent.length = 0; const e = env();
  // one sender rotating through addresses in its own /64 is still one sender
  for (let i = 0; i < 5; i++) assert.equal((await feedback(post({ message: 'm' + i }, { 'cf-connecting-ip': `2001:db8:1:2::${i + 1}` }), e, FakeMessage)).status, 200);
  assert.equal((await feedback(post({ message: 'more' }, { 'cf-connecting-ip': '2001:db8:1:2:ffff::9' }), e, FakeMessage)).status, 429);
  assert.equal((await feedback(post({ message: 'neighbour' }, { 'cf-connecting-ip': '2001:db8:1:3::1' }), e, FakeMessage)).status, 200);
});

test('a site-wide cap stops a flood from many addresses', async () => {
  _test.recent.clear(); _test.sent.length = 0; const e = { ...env(), FEEDBACK_GLOBAL_LIMIT: '3' };
  for (let i = 0; i < 3; i++) assert.equal((await feedback(post({ message: 'm' + i }, { 'cf-connecting-ip': '192.0.2.' + (i + 1) }), e, FakeMessage)).status, 200);
  assert.equal((await feedback(post({ message: 'flood' }, { 'cf-connecting-ip': '192.0.2.200' }), e, FakeMessage)).status, 429);
  assert.equal(e.sent.length, 3);
  // the cap is per hour
  assert.equal(_test.limited('192.0.2.201', Date.now() + 61 * 60 * 1000, 3), false);
  _test.sent.length = 0;
});
