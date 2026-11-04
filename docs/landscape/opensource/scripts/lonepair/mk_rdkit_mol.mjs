import initRDKitModule from '@rdkit/rdkit';
import { writeFileSync } from 'node:fs';
const R = await initRDKitModule();
const out = {};
for (const [k, s] of Object.entries({ ala: 'C[C@H](N)C(=O)O', glucose: 'OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O', ala_v3: 'C[C@H](N)C(=O)O' })) {
  const m = R.get_mol(s); out[k] = k.endsWith('v3') ? m.get_v3Kmolblock() : m.get_molblock(); m.delete();
}
writeFileSync(process.argv[2], JSON.stringify(out));
console.log(out.ala.split('\n').slice(0,4).join('\n'));
