// Optional "Sign in with Google" for the hosted site (Cloudflare Pages Functions + D1). The editor works without it.
// Routes: GET /api/me, GET /api/auth/google, GET /api/auth/google/callback, POST /api/auth/logout, POST /api/account/delete,
// POST /api/feedback (works with just the D1 binding, without Google sign-in)
// Stores only the Google account id, name, email and visit times; drawings never reach the server.

const SESSION_COOKIE = 'lp_session', FLOW_COOKIE = 'lp_oauth';
const SESSION_DAYS = 30, FLOW_MINUTES = 10, TOUCH_EVERY_MS = 60 * 60 * 1000;
const FEEDBACK_MAX = 5000, FEEDBACK_WINDOW_MS = 10 * 60 * 1000, FEEDBACK_GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth', GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

const enc = new TextEncoder();
const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const hex = bytes => [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');

function cookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('='); if (i <= 0) continue;
    // another app on the domain may set a cookie that isn't valid percent-encoding; skip it rather than fail the request
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* not ours */ }
  }
  return out;
}
function setCookie(url, name, value, maxAge, path = '/') {
  const secure = url.protocol === 'https:' ? '; Secure' : ''; // local `wrangler pages dev` runs on http
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
const redirect = (to, cookieList = []) => { const h = new Headers({ location: to, 'cache-control': 'no-store' }); for (const c of cookieList) h.append('set-cookie', c); return new Response(null, { status: 302, headers: h }); };
const configured = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.DB);
// state-changing requests must come from our own pages (the cookie is SameSite=Lax; this closes the rest)
const sameOrigin = (request, url) => request.headers.get('origin') === url.origin;

async function currentSession(request, env) {
  const token = cookies(request)[SESSION_COOKIE]; if (!token) return null;
  const id = hex(await sha256(token));
  const row = await env.DB.prepare('SELECT s.id, s.expires_at, u.id AS user_id, u.name, u.email, u.last_seen_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?').bind(id).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) { await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run(); return null; }
  return row;
}

async function me(request, env) {
  const feedback = !!env.DB; // the app shows its feedback form only when this server can store the message
  if (!configured(env)) return json({ available: false, signedIn: false, feedback });
  const s = await currentSession(request, env);
  if (!s) return json({ available: true, signedIn: false, feedback });
  if (Date.now() - (s.last_seen_at || 0) > TOUCH_EVERY_MS) await env.DB.prepare('UPDATE users SET last_seen_at = ? WHERE id = ?').bind(Date.now(), s.user_id).run();
  return json({ available: true, signedIn: true, feedback, user: { name: s.name, email: s.email } });
}

async function start(request, env, url) {
  if (!configured(env)) return json({ error: 'Sign-in is not set up on this server' }, 503);
  const state = randomToken(), verifier = randomToken(48);
  const challenge = b64url(await sha256(verifier));
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: `${url.origin}/api/auth/google/callback`, response_type: 'code',
    scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account',
  });
  return redirect(`${env.GOOGLE_AUTH_URL || GOOGLE_AUTH}?${q}`, [setCookie(url, FLOW_COOKIE, `${state}.${verifier}`, FLOW_MINUTES * 60, '/api/auth')]);
}

// The ID token comes straight from Google's token endpoint over TLS with our client secret, so per OpenID Connect
// Core 3.1.3.7 TLS validation stands in for checking its signature; issuer, audience, expiry and email are still checked.
function claims(idToken, env) {
  const part = (idToken || '').split('.')[1]; if (!part) throw new Error('no ID token');
  // the payload is base64url-encoded UTF-8: decode the bytes as UTF-8 so names like "José" survive (atob alone gives Latin-1)
  const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/'));
  const c = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, ch => ch.charCodeAt(0))));
  const issuers = env.GOOGLE_ISSUER ? [env.GOOGLE_ISSUER] : GOOGLE_ISSUERS;
  if (!issuers.includes(c.iss)) throw new Error('wrong issuer');
  if (c.aud !== env.GOOGLE_CLIENT_ID) throw new Error('wrong audience');
  if (!(c.exp * 1000 > Date.now())) throw new Error('expired');
  if (!c.sub || !c.email || c.email_verified !== true) throw new Error('email not verified');
  return c;
}

async function callback(request, env, url) {
  const clearFlow = setCookie(url, FLOW_COOKIE, '', 0, '/api/auth');
  if (!configured(env)) return redirect('/?signin=unavailable', [clearFlow]);
  const [state, verifier] = (cookies(request)[FLOW_COOKIE] || '').split('.');
  if (url.searchParams.get('error')) return redirect('/?signin=cancelled', [clearFlow]);
  if (!state || url.searchParams.get('state') !== state || !url.searchParams.get('code')) return redirect('/?signin=failed', [clearFlow]);
  let c;
  try {
    const r = await fetch(env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({
      grant_type: 'authorization_code', code: url.searchParams.get('code'), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: `${url.origin}/api/auth/google/callback`, code_verifier: verifier,
    }) });
    if (!r.ok) throw new Error(`token endpoint ${r.status}`);
    c = claims((await r.json()).id_token, env);
  } catch (e) {
    console.error('sign-in failed:', e.message);
    return redirect('/?signin=failed', [clearFlow]);
  }
  const now = Date.now();
  await env.DB.prepare(`INSERT INTO users (id, email, name, created_at, last_seen_at, sign_ins) VALUES (?, ?, ?, ?, ?, 1)
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, last_seen_at = excluded.last_seen_at, sign_ins = users.sign_ins + 1`)
    .bind(c.sub, c.email, c.name || c.email, now, now).run();
  const token = randomToken();
  await env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND expires_at < ?').bind(c.sub, now).run(); // tidy this user's expired sessions
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(hex(await sha256(token)), c.sub, now, now + SESSION_DAYS * 864e5).run();
  return redirect('/?signin=ok', [clearFlow, setCookie(url, SESSION_COOKIE, token, SESSION_DAYS * 86400)]);
}

async function logout(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  const token = cookies(request)[SESSION_COOKIE];
  if (token && configured(env)) await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(hex(await sha256(token))).run();
  return json({ ok: true }, 200, { 'set-cookie': setCookie(url, SESSION_COOKIE, '', 0) });
}

async function deleteAccount(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  if (!configured(env)) return json({ error: 'Sign-in is not set up on this server' }, 503);
  const s = await currentSession(request, env); if (!s) return json({ error: 'not signed in' }, 401);
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(s.user_id), env.DB.prepare('DELETE FROM feedback WHERE user_id = ?').bind(s.user_id),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(s.user_id)]);
  return json({ ok: true }, 200, { 'set-cookie': setCookie(url, SESSION_COOKIE, '', 0) });
}

// "Send feedback": anyone may send, signed in or not. Limited per IP address (stored only as a hash).
async function feedback(request, env, url) {
  if (!sameOrigin(request, url)) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'Feedback is not set up on this server' }, 503);
  if (!(request.headers.get('content-type') || '').includes('application/json')) return json({ error: 'expected JSON' }, 415);
  const raw = await request.text(); if (raw.length > 20000) return json({ error: 'too long' }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: 'bad JSON' }, 400); }
  if (!b || typeof b !== 'object') return json({ error: 'bad request' }, 400);
  const message = typeof b.message === 'string' ? b.message.trim() : '';
  if (!message || message.length > FEEDBACK_MAX) return json({ error: `Write a message of up to ${FEEDBACK_MAX} characters` }, 400);
  const email = typeof b.email === 'string' && /^[^\s@<>]{1,64}@[^\s@<>]{1,190}\.[^\s@<>]{2,}$/.test(b.email.trim()) ? b.email.trim() : null;
  // only short strings from the context the sender agreed to include
  let context = null;
  if (b.context && typeof b.context === 'object') {
    const c = {}; for (const [k, v] of Object.entries(b.context).slice(0, 12)) if (/^\w{1,24}$/.test(k) && ['string', 'number', 'boolean'].includes(typeof v)) c[k] = String(v).slice(0, 300);
    if (Object.keys(c).length) context = JSON.stringify(c);
  }
  const now = Date.now(), limit = +env.FEEDBACK_LIMIT || 5, globalLimit = +env.FEEDBACK_GLOBAL_LIMIT || 100;
  const ipHash = await senderKey(request, env);
  const s = configured(env) ? await currentSession(request, env) : null;
  // one statement, so parallel requests can't all pass the count before any of them is stored
  const r = await env.DB.prepare(`INSERT INTO feedback (created_at, message, email, user_id, context, ip_hash)
      SELECT ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM feedback WHERE ip_hash = ? AND created_at > ?) < ?
        AND (SELECT COUNT(*) FROM feedback WHERE created_at > ?) < ?`)
    .bind(now, message, email || (s && s.email) || null, s ? s.user_id : null, context, ipHash,
      ipHash, now - FEEDBACK_WINDOW_MS, limit, now - FEEDBACK_GLOBAL_WINDOW_MS, globalLimit).run();
  // the address key is only needed for the rate limit: clear it once the window has passed
  await env.DB.prepare('UPDATE feedback SET ip_hash = NULL WHERE ip_hash IS NOT NULL AND created_at <= ?').bind(now - FEEDBACK_WINDOW_MS).run();
  if (!(r && r.meta && r.meta.changes)) return json({ error: 'Too many messages. Please try again in a few minutes.' }, 429);
  return json({ ok: true });
}
// rate-limit key for the sender: IPv6 addresses by their /64 (one household or server gets a whole /64), keyed with
// a server secret when one is set, so the stored value can't be reversed by hashing every IPv4 address
function addressBlock(ip) {
  const v4 = /(\d{1,3}(\.\d{1,3}){3})$/.exec(ip);
  if (!ip.includes(':') || v4) return v4 ? v4[1] : ip;
  const [h, t = ''] = ip.split('::'), a = h ? h.split(':') : [], b = t ? t.split(':') : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return full.slice(0, 4).map(x => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}
async function senderKey(request, env) {
  const block = addressBlock((request.headers.get('cf-connecting-ip') || 'unknown').trim().toLowerCase());
  if (!env.FEEDBACK_SECRET) return hex(await sha256('lp-feedback:' + block));
  const key = await crypto.subtle.importKey('raw', enc.encode(env.FEEDBACK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(block))));
}

export async function handle(request, env) {
  const url = new URL(request.url), m = request.method, p = url.pathname.replace(/\/+$/, '');
  try {
    if (p === '/api/me' && m === 'GET') return await me(request, env);
    if (p === '/api/auth/google' && m === 'GET') return await start(request, env, url);
    if (p === '/api/auth/google/callback' && m === 'GET') return await callback(request, env, url);
    if (p === '/api/auth/logout' && m === 'POST') return await logout(request, env, url);
    if (p === '/api/account/delete' && m === 'POST') return await deleteAccount(request, env, url);
    if (p === '/api/feedback' && m === 'POST') return await feedback(request, env, url);
    return json({ error: 'not found' }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
}
