// Loads the browser modules (core, nmr, solvents) into a Node VM context with minimal DOM stubs.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as OCL from 'openchemlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = f => readFileSync(path.join(root, 'src', f), 'utf8');

// Text width stub: roughly Arial-like (about 0.6 em per character) so label layout is deterministic.
const ctx2d = { font: '10px Arial', measureText(t) { const px = parseFloat(/(\d+(\.\d+)?)px/.exec(this.font)?.[1] || 10); return { width: t.length * px * 0.6 }; } };
const documentStub = { createElement: () => ({ getContext: () => ctx2d }), documentElement: { outerHTML: '' } };

export function loadModules() {
  const context = vm.createContext({ OCL, document: documentStub, console, Math, JSON });
  for (const f of ['core.js', 'nmr.js', 'solvents.js', 'formats.js', 'ms.js']) vm.runInContext(read(f), context, { filename: f });
  return name => vm.runInContext(name, context);
}

// Build a doc from SMILES using the app's own conversion path (OCL layout -> fromOCL).
export function docFromSmiles(get, smiles) {
  const fromOCL = get('fromOCL'), scaleLayout = get('scaleLayout'), newDoc = get('newDoc');
  const mol = OCL.Molecule.fromSmiles(smiles); mol.inventCoordinates(); scaleLayout(mol);
  const { atoms, bonds } = fromOCL(mol);
  const d = newDoc(); let id = 1;
  atoms.forEach(a => { a.id = id++; d.atoms.push(a); });
  bonds.forEach(b => d.bonds.push({ id: id++, a: atoms[b.a].id, b: atoms[b.b].id, order: b.order, stereo: b.stereo }));
  d.nid = id;
  return d;
}
export function molFromSmiles(smiles) { const m = OCL.Molecule.fromSmiles(smiles); m.inventCoordinates(); return m; }
export { OCL };
