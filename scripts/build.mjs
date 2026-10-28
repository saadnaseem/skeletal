// Builds dist/skeletal.html: one self-contained file (app code + OpenChemLib inlined).
import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = f => path.join(root, 'src', f);

// Order matters: later files use globals defined by earlier ones.
const APP_FILES = ['core.js', 'nmr.js', 'pdf.js', 'solvents.js', 'formats.js', 'ms.js', 'app.js'];

const ocl = await build({
  stdin: { contents: "export * from 'openchemlib'; export * as InChI from 'inchi-js';", resolveDir: root },
  bundle: true, minify: true, format: 'iife', globalName: 'OCL', write: false, logLevel: 'silent',
});
const oclCode = ocl.outputFiles[0].text;
if (oclCode.includes('</script')) throw new Error('OpenChemLib bundle contains a closing script tag');

const appCode = (await Promise.all(APP_FILES.map(f => readFile(src(f), 'utf8')))).join('\n');
if (appCode.includes('</script')) throw new Error('App code contains a closing script tag');

const shell = await readFile(src('shell.html'), 'utf8');
for (const marker of ['/*OCL*/', '/*APP*/']) if (!shell.includes(marker)) throw new Error(`shell.html is missing ${marker}`);
const html = shell.replace('/*OCL*/', () => oclCode).replace('/*APP*/', () => '\n' + appCode + '\n');

await mkdir(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'skeletal.html');
await writeFile(out, html);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`Built ${path.relative(root, out)} (${mb} MB)`);
