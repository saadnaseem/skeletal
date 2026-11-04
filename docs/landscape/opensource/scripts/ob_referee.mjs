// Checks JSME and MolView suite outputs against the input with OpenBabel canonical SMILES.
// Usage: node ob_referee.mjs /path/to/Kekule.js/dist jsme.json molview.json
// Same OB canonical string => same constitution, charges, isotopes, H counts and stereo.
import fs from 'fs';
import path from 'path';
import {loadKekuleWithOB, makeObCan} from './kekule_ob_loader.mjs';
const [dist, jsmeF, mvF] = process.argv.slice(2);
const Kekule = await loadKekuleWithOB(path.resolve(dist));
const can = makeObCan(Kekule);
const strip = s => (s || '').replace(/>>$/, '');
const show = (label, rows, keys) => {
  console.log(`\n${label}`);
  for (const r of rows) {
    const ref = can(r.in);
    if (ref == null) { console.log(`[${r.id}] input not parseable by OB; outputs: ` + keys.map(k => `${k}=${JSON.stringify(r[k] == null ? null : r[k])}`).join('  ')); continue; }
    console.log(`[${r.id}] ` + keys.map(k => `${k}=${r[k] == null ? '-' : (can(strip(r[k])) === ref ? 'MATCH' : 'DIFF')}`).join('  '));
  }
};
if (jsmeF) show('JSME (smiles() vs input)', JSON.parse(fs.readFileSync(jsmeF, 'utf8')), ['smiles', 'molRT']);
if (mvF) {
  // PubChem SDF has explicit H atoms; OB canonical form handles that, MolPad would strip them in skeletal mode.
  show('MolView (PC = PubChem 2D SDF via MolPad filter, LOC = JSME molfile via MolPad filter)', JSON.parse(fs.readFileSync(mvF, 'utf8')), ['PC_smiles', 'LOC_smiles']);
}
process.exit(0);
