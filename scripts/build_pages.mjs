// Builds site/ for Cloudflare Pages (or any static host that reads _headers/_redirects):
// site/index.html is dist/skeletal.html; _headers sets caching and security headers; _redirects keeps old links working.
// Run `npm run build` first (npm run build:pages does both).
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = path.join(root, 'site');
const html = await readFile(path.join(root, 'dist', 'skeletal.html'), 'utf8');

// Everything is inline (one file), so scripts and styles need 'unsafe-inline'; WebAssembly (InChI) needs 'wasm-unsafe-eval'.
// The app only fetches from PubChem (name/CAS lookup) and EBI (ChEMBL); other services are links opened in a new tab.
export const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://pubchem.ncbi.nlm.nih.gov https://www.ebi.ac.uk",
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
`;
const redirects = `/skeletal.html / 301
/dist/skeletal.html / 301
`;

await rm(site, { recursive: true, force: true });
await mkdir(site, { recursive: true });
await writeFile(path.join(site, 'index.html'), html);
await writeFile(path.join(site, '_headers'), headers);
await writeFile(path.join(site, '_redirects'), redirects);
await writeFile(path.join(site, 'robots.txt'), 'User-agent: *\nAllow: /\n');
console.log(`Built site/ for Cloudflare Pages (index.html ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB, _headers, _redirects)`);
