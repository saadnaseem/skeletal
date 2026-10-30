// POST /api/feedback: emails a message from the in-app Feedback form to the site owner, through Cloudflare Email Routing.
// Needs, on the Worker: a send_email binding FEEDBACK (wrangler.toml) and the secret FEEDBACK_TO, a verified
// Email Routing destination (the owner's inbox). The address is a secret so it never appears in this public repo.
// Nothing is stored: the message goes out as one email and is gone from the server.

const FROM = 'feedback@lonepair.app', MAX_MESSAGE = 5000, MAX_BODY = 20000;
const LIMIT = 5, WINDOW_MS = 10 * 60 * 1000; // per visitor, per server instance: a brake on scripts, not a guarantee
const GLOBAL_LIMIT = 100, GLOBAL_WINDOW_MS = 60 * 60 * 1000; // all visitors together, so many addresses can't flood the inbox
const recent = new Map(), sent = [];
const EMAIL_RE = /^[^\s@<>()",;:\\[\]]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const b64 = s => { const bytes = new TextEncoder().encode(s); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`; // RFC 2047 for anything non-ASCII

// rate-limit key for a visitor: IPv6 addresses by their /64 (one household or server gets a whole /64, so a single
// sender could otherwise rotate through billions of addresses); IPv4-mapped IPv6 as the plain IPv4 address
function addressBlock(ip) {
  ip = String(ip || 'unknown').trim().toLowerCase();
  const v4 = /(\d{1,3}(\.\d{1,3}){3})$/.exec(ip);
  if (!ip.includes(':') || v4) return v4 ? v4[1] : ip;
  const [h, t = ''] = ip.split('::'), a = h ? h.split(':') : [], b = t ? t.split(':') : [];
  const full = [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill('0'), ...b];
  return full.slice(0, 4).map(x => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}

function limited(ip, now = Date.now(), globalLimit = GLOBAL_LIMIT) {
  const key = addressBlock(ip);
  while (sent.length && now - sent[0] >= GLOBAL_WINDOW_MS) sent.shift();
  const times = (recent.get(key) || []).filter(t => now - t < WINDOW_MS);
  if (times.length >= LIMIT || sent.length >= globalLimit) { recent.set(key, times); return true; }
  times.push(now); recent.set(key, times); sent.push(now);
  if (recent.size > 5000) recent.clear();
  return false;
}

export function buildEmail({ to, from = FROM, email, message, context = {}, now = new Date(), id = crypto.randomUUID() }) {
  const first = message.split('\n').find(l => l.trim()) || 'Feedback';
  const subject = 'Lone Pair feedback: ' + (first.length > 70 ? first.slice(0, 67) + '…' : first).trim();
  const lines = [message, '', '—', `From: ${email || '(no email given)'}`];
  if (context.smiles) lines.push(`Drawing (SMILES): ${context.smiles}`);
  if (context.page) lines.push(`Page: ${context.page}`);
  if (context.ua) lines.push(`Browser: ${context.ua}`);
  lines.push(`Sent: ${now.toISOString()}`);
  const head = [
    `From: Lone Pair feedback <${from}>`, `To: <${to}>`, ...(email ? [`Reply-To: <${email}>`] : []),
    `Subject: ${header(subject)}`, `Date: ${now.toUTCString()}`, `Message-ID: <${id}@lonepair.app>`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64',
  ];
  return head.join('\r\n') + '\r\n\r\n' + wrap(b64(lines.join('\n').replace(/\r?\n/g, '\r\n')));
}

export async function feedback(request, env, EmailMessage) {
  const url = new URL(request.url);
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (request.headers.get('origin') !== url.origin) return json({ error: 'forbidden' }, 403);
  if (!env.FEEDBACK || !env.FEEDBACK_TO || !EmailMessage) return json({ error: 'Feedback is not set up on this server' }, 503);
  if (+(request.headers.get('content-length') || 0) > MAX_BODY) return json({ error: 'too long' }, 413);
  let body; try { const t = await request.text(); if (t.length > MAX_BODY) return json({ error: 'too long' }, 413); body = JSON.parse(t); } catch (e) { return json({ error: 'bad request' }, 400); }
  if (body && body.website) return json({ ok: true }); // the hidden field only bots fill in: pretend it worked
  const message = typeof body?.message === 'string' ? body.message.replace(/\r\n?/g, '\n').trim() : '';
  if (!message) return json({ error: 'Please write a message' }, 400);
  if (message.length > MAX_MESSAGE) return json({ error: `Please keep it under ${MAX_MESSAGE} characters` }, 400);
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (email && (email.length > 254 || !EMAIL_RE.test(email))) return json({ error: 'That email address doesn’t look right' }, 400);
  if (limited(request.headers.get('cf-connecting-ip'), Date.now(), +env.FEEDBACK_GLOBAL_LIMIT || GLOBAL_LIMIT)) return json({ error: 'Thanks! That’s a lot of messages at once; please try again in a few minutes' }, 429);
  const c = body.context && typeof body.context === 'object' ? body.context : {};
  const clip = (v, n) => typeof v === 'string' ? v.replace(/[\r\n]+/g, ' ').slice(0, n) : '';
  const context = { smiles: clip(c.smiles, 2000), page: clip(c.page, 200), ua: clip(request.headers.get('user-agent'), 300) };
  const from = env.FEEDBACK_FROM || FROM;
  try {
    await env.FEEDBACK.send(new EmailMessage(from, env.FEEDBACK_TO, buildEmail({ to: env.FEEDBACK_TO, from, email, message, context })));
  } catch (e) {
    console.error('feedback email failed:', e && e.message);
    return json({ error: 'Couldn’t send right now' }, 502);
  }
  return json({ ok: true });
}
export const _test = { limited, recent, sent, addressBlock };
