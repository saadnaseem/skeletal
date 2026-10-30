// The hosted site (npm run build:pages) tells search engines what it is: sitemap, robots.txt, titles, structured data.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const site = f => readFile(path.join(root, 'site', f), 'utf8');

before(async () => {
  try { await access(path.join(root, 'dist', 'lonepair.html')); } catch { execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root }); }
  execFileSync(process.execPath, ['scripts/build_pages.mjs'], { cwd: root });
});

test('robots.txt points to a sitemap that lists every page, and each page is built', async () => {
  assert.match(await site('robots.txt'), /^Sitemap: https:\/\/lonepair\.app\/sitemap\.xml$/m);
  assert.match(await site('robots.txt'), /^Disallow: \/api\/$/m);
  const locs = [...(await site('sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(locs, ['https://lonepair.app/', 'https://lonepair.app/about', 'https://lonepair.app/privacy']);
  for (const f of ['index.html', 'about.html', 'privacy.html']) await access(path.join(root, 'site', f));
});

test('the app page has a descriptive title and structured data for a free web app', async () => {
  const html = await site('index.html');
  assert.match(html, /<title data-sk>Lone Pair: free chemical structure drawing editor<\/title>/);
  const ld = JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]);
  const app = ld['@graph'].find(n => n['@type'] === 'WebApplication');
  assert.equal(app.url, 'https://lonepair.app/'); assert.equal(app.isAccessibleForFree, true); assert.equal(app.offers.price, '0');
  assert.ok(ld['@graph'].some(n => n['@type'] === 'WebSite' && n.name === 'Lone Pair'));
  // crawlable words and links to the other pages, not just toolbar labels
  assert.match(html, /Lone Pair is a free chemical structure editor[^<]*<a href="https:\/\/lonepair\.app\/about">About<\/a>/);
});

test('about and privacy pages carry their own title, heading and canonical address', async () => {
  const about = await site('about.html'), privacy = await site('privacy.html');
  assert.match(about, /<link rel="canonical" href="https:\/\/lonepair\.app\/about">/);
  assert.match(about, /<h1>Lone Pair: a free chemical structure editor<\/h1>/);
  assert.match(about, /<meta name="description" content="[^"]{80,}">/);
  assert.match(privacy, /<link rel="canonical" href="https:\/\/lonepair\.app\/privacy">/);
  // the hosted site serves /about.html at /about (and redirects the .html address), so links use the short form
  assert.doesNotMatch(about + privacy, /href="\/[a-z]+\.html"/);
});
