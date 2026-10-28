// Render each EPS and PDF in DIR to PNG with Ghostscript at 300 dpi, using the WebAssembly build
// (npm install --ignore-scripts @okathira/ghostpdl-wasm in a separate folder; AGPL, so it is not a dependency here).
// Usage: GS_WASM=/path/to/node_modules/@okathira/ghostpdl-wasm/dist/gs.js node scripts/check_eps_render.mjs DIR
//        python scripts/check_eps_compare.py DIR
const { default: loadWASM } = await import(process.env.GS_WASM);
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
const DIR = process.argv[2];
for (const f of readdirSync(DIR).filter(f => /\.(eps|pdf)$/.test(f))) {
  const log = [];
  const gs = await loadWASM({ print: s => log.push(s), printErr: s => log.push('ERR ' + s) });
  gs.FS.writeFile('/in', readFileSync(`${DIR}/${f}`));
  const args = ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=png16m', '-r300', '-dTextAlphaBits=4', '-dGraphicsAlphaBits=4', ...(f.endsWith('.eps') ? ['-dEPSCrop'] : []), '-sOutputFile=/out.png', '/in'];
  const code = gs.callMain(args);
  let ok = false; try { writeFileSync(`${DIR}/${f}.png`, gs.FS.readFile('/out.png')); ok = true; } catch (e) {}
  console.log(f, 'exit', code, ok ? 'rendered' : 'NO OUTPUT', log.filter(l => /ERR|Error|error|Warning/.test(l)).slice(0, 4).join(' / '));
}
