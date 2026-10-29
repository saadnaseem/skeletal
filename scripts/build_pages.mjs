// Builds site/ for Cloudflare Pages (or any static host that reads _headers/_redirects):
// site/index.html is dist/lonepair.html; _headers sets caching and security headers; _redirects keeps old links working.
// Run `npm run build` first (npm run build:pages does both).
import { readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
// the hosted copy gets a marker so the app asks /api/me about sign-in (Pages Functions answer it; see server/auth.js)
// it also links the PNG icons in assets/ (scripts/make_brand_images.py), which only exist on the hosted site
const ICONS = ['og-image.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon-32.png'];
const html = (await readFile(path.join(root, 'dist', 'lonepair.html'), 'utf8')).replace('<meta charset="utf-8" data-sk>', `<meta charset="utf-8" data-sk>
<meta name="lp-api" content="/api">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`);
if (!html.includes('name="lp-api"')) throw new Error('could not add the lp-api marker to index.html');

// Everything is inline (one file), so scripts and styles need 'unsafe-inline'; WebAssembly (InChI) needs 'wasm-unsafe-eval'.
// The app only fetches from PubChem (name/CAS lookup), EBI (ChEMBL) and its own /api (optional sign-in); other services are links.
// Cloudflare Web Analytics (cookieless, switched on in the Pages dashboard) is allowed too.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://pubchem.ncbi.nlm.nih.gov https://www.ebi.ac.uk https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
  Cross-Origin-Opener-Policy: same-origin
  Content-Security-Policy: ${CSP}

# the app is one HTML file: always revalidate so a new deploy shows up on the next visit
# (Cloudflare still serves it compressed and answers repeat visits with 304 Not Modified)
/
  Cache-Control: public, max-age=0, must-revalidate
/index.html
  Cache-Control: public, max-age=0, must-revalidate
/*.png
  Cache-Control: public, max-age=86400
`;
const manifest = JSON.stringify({ name: 'Lone Pair', short_name: 'Lone Pair', description: 'Chemical structure editor for publication-quality figures',
  start_url: '/', display: 'standalone', background_color: '#ffffff', theme_color: '#2459a8',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2);
const redirects = `/lonepair.html / 301
/skeletal.html / 301
/dist/lonepair.html / 301
/dist/skeletal.html / 301
`;

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await writeFile(path.join(site, 'index.html'), html);
await writeFile(path.join(site, '_headers'), headers);
await writeFile(path.join(site, '_redirects'), redirects);
await writeFile(path.join(site, 'robots.txt'), 'User-agent: *\nAllow: /\nDisallow: /api/\n');
await writeFile(path.join(site, 'privacy.html'), await readFile(path.join(root, 'src', 'privacy.html'), 'utf8'));
await writeFile(path.join(site, 'site.webmanifest'), manifest);
for (const f of ICONS) await copyFile(path.join(root, 'assets', f), path.join(site, f));
console.log(`Built site/ for Cloudflare Pages (index.html ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB, _headers, _redirects, icons)`);
