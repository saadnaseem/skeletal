// POST /api/feedback (server/auth.js) against an in-memory stand-in for D1: no wrangler or Node 22 needed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../../server/auth.js';

const ORIGIN = 'https://lonepair.app';

// just enough of D1 for the feedback route: the conditional insert (per-address and site-wide counts) and the cleanup
function fakeDB() {
  const rows = [];
  const db = {
    rows,
    prepare(sql) {
      let args = [];
      const stmt = {
        bind(...a) { args = a; return stmt; },
        async first() { throw new Error('unexpected query: ' + sql); },
        async run() {
          if (/INSERT INTO feedback[\s\S]*SELECT[\s\S]*WHERE/.test(sql)) {
            const [created_at, message, email, user_id, context, ip_hash, key, since, limit, gsince, glimit] = args;
            const mine = rows.filter(r => r.ip_hash === key && r.created_at > since).length, all = rows.filter(r => r.created_at > gsince).length;
            if (mine >= limit || all >= glimit) return { meta: { changes: 0 } };
            rows.push({ created_at, message, email, user_id, context, ip_hash }); return { meta: { changes: 1 } };
          }
          if (/UPDATE feedback SET ip_hash = NULL/.test(sql)) { for (const r of rows) if (r.ip_hash != null && r.created_at <= args[0]) r.ip_hash = null; return { meta: {} }; }
          throw new Error('unexpected statement: ' + sql);
        },
      };
      return stmt;
    },
  };
  return db;
}

function post(env, body, { origin = ORIGIN, ip = '203.0.113.7', type = 'application/json' } = {}) {
  const headers = { 'content-type': type, 'cf-connecting-ip': ip };
  if (origin) headers.origin = origin;
  return handle(new Request(ORIGIN + '/api/feedback', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) }), env);
}

test('a message is stored with the reply address and the details the sender chose', async () => {
  const env = { DB: fakeDB() };
  const r = await post(env, { message: '  The lasso misses small rings  ', email: 'ada@example.com', context: { browser: 'Firefox 140', screen: '1440x900' } });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: true });
  const [row] = env.DB.rows;
  assert.equal(row.message, 'The lasso misses small rings');
  assert.equal(row.email, 'ada@example.com');
  assert.equal(row.user_id, null);
  assert.deepEqual(JSON.parse(row.context), { browser: 'Firefox 140', screen: '1440x900' });
});

test('the IP address is stored only as a hash', async () => {
  const env = { DB: fakeDB() };
  await post(env, { message: 'hi' }, { ip: '198.51.100.23' });
  const { ip_hash } = env.DB.rows[0];
  assert.match(ip_hash, /^[0-9a-f]{64}$/);
  assert.ok(!JSON.stringify(env.DB.rows).includes('198.51.100.23'));
});

test('/api/me tells the app whether feedback can go to the server', async () => {
  const me = async env => (await handle(new Request(ORIGIN + '/api/me'), env)).json();
  assert.equal((await me({ DB: fakeDB() })).feedback, true);   // database only, no Google sign-in: feedback still works
  assert.equal((await me({})).feedback, false);                 // no database: the app falls back to email
});

test('requests from other sites, without a database or not JSON are refused', async () => {
  assert.equal((await post({ DB: fakeDB() }, { message: 'x' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post({ DB: fakeDB() }, { message: 'x' }, { origin: null })).status, 403);
  assert.equal((await post({}, { message: 'x' })).status, 503);
  assert.equal((await post({ DB: fakeDB() }, 'message=x', { type: 'application/x-www-form-urlencoded' })).status, 415);
  assert.equal((await post({ DB: fakeDB() }, '{not json')).status, 400);
});

test('empty and oversized messages are refused', async () => {
  const env = { DB: fakeDB() };
  assert.equal((await post(env, { message: '   ' })).status, 400);
  assert.equal((await post(env, { message: 'x'.repeat(5001) })).status, 400);
  assert.equal((await post(env, { message: 'x'.repeat(5000) })).status, 200);
  assert.equal((await post(env, 'x'.repeat(20001))).status, 413);
  assert.equal(env.DB.rows.length, 1);
});

test('bad emails are dropped and context is limited to short plain values', async () => {
  const env = { DB: fakeDB() };
  await post(env, { message: 'm', email: 'not an email', context: { 'bad key': 1, nested: { a: 1 }, ok: 'yes', long: 'y'.repeat(400) } });
  const [row] = env.DB.rows;
  assert.equal(row.email, null);
  const ctx = JSON.parse(row.context);
  assert.deepEqual(Object.keys(ctx).sort(), ['long', 'ok']);
  assert.equal(ctx.long.length, 300);
});

test('each address can send 5 messages per 10 minutes; other addresses are unaffected', async () => {
  const env = { DB: fakeDB() };
  const codes = [];
  for (let i = 0; i < 6; i++) codes.push((await post(env, { message: `m${i}` }, { ip: '192.0.2.1' })).status);
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 429]);
  assert.equal((await post(env, { message: 'other' }, { ip: '192.0.2.2' })).status, 200);
  assert.equal((await post({ DB: env.DB, FEEDBACK_LIMIT: '7' }, { message: 'm6' }, { ip: '192.0.2.1' })).status, 200); // FEEDBACK_LIMIT raises it
});

test('IPv6 senders are limited per /64, so rotating addresses within one network does not get round it', async () => {
  const env = { DB: fakeDB(), FEEDBACK_LIMIT: '2' };
  const codes = [];
  for (const ip of ['2001:db8:1:2::1', '2001:db8:1:2:aaaa::7', '2001:0db8:0001:0002:ffff:ffff:ffff:ffff']) codes.push((await post(env, { message: 'x' }, { ip })).status);
  assert.deepEqual(codes, [200, 200, 429]);
  assert.equal((await post(env, { message: 'x' }, { ip: '2001:db8:1:3::1' })).status, 200, 'the next /64 is someone else');
  // IPv4 written as an IPv6-mapped address is the same sender as the plain IPv4 address
  const env4 = { DB: fakeDB(), FEEDBACK_LIMIT: '1' };
  assert.equal((await post(env4, { message: 'x' }, { ip: '192.0.2.9' })).status, 200);
  assert.equal((await post(env4, { message: 'x' }, { ip: '::ffff:192.0.2.9' })).status, 429);
});

test('a site-wide cap stops a flood from many addresses', async () => {
  const env = { DB: fakeDB(), FEEDBACK_GLOBAL_LIMIT: '3' };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await post(env, { message: 'x' }, { ip: `198.51.100.${i}` })).status);
  assert.deepEqual(codes, [200, 200, 200, 429, 429]);
});

test('parallel requests from one address cannot all slip past the limit', async () => {
  const env = { DB: fakeDB(), FEEDBACK_LIMIT: '3' };
  const codes = await Promise.all(Array.from({ length: 8 }, (_, i) => post(env, { message: `m${i}` }, { ip: '192.0.2.50' }).then(r => r.status)));
  assert.equal(codes.filter(c => c === 200).length, 3);
  assert.equal(env.DB.rows.length, 3);
});

test('with FEEDBACK_SECRET set the address key is an HMAC, and keys are cleared after the window', async () => {
  const a = { DB: fakeDB() }, b = { DB: fakeDB(), FEEDBACK_SECRET: 's3cret' }, c = { DB: fakeDB(), FEEDBACK_SECRET: 'other' };
  for (const env of [a, b, c]) await post(env, { message: 'x' }, { ip: '203.0.113.5' });
  const keys = [a, b, c].map(e => e.DB.rows[0].ip_hash);
  assert.equal(new Set(keys).size, 3, 'the key depends on the secret, so it cannot be matched against a table of hashed addresses');
  // an old row loses its key on the next message
  b.DB.rows[0].created_at -= 11 * 60 * 1000;
  await post(b, { message: 'later' }, { ip: '203.0.113.6' });
  assert.equal(b.DB.rows[0].ip_hash, null);
  assert.match(b.DB.rows[1].ip_hash, /^[0-9a-f]{64}$/);
});
