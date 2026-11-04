// Runs test-suite.md section A (SMILES) through MolView's own non-browser code path.
//
// Usage: node molview_suite.cjs /path/to/molview  [jsme_results.json] [out.json]
//
// MolView has no local SMILES parser and no 2D layout. Loader.loadSMILES() calls
// Request.resolve(): PubChem smiles->CID, then PubChem 2D SDF for that CID; the NCI CIR
// fallback is hard-wired off (Request.CIR.available = false in src/js/Request.js).
// The molfile then goes into MolPad (MPMolecule.loadMOL keeps only element, charge,
// isotope, x/y and bond type/stereo) and SMILES comes back out of Ketcher's
// chem.SmilesSaver (src/js/chem/chem/smiles.js).
//
// Path "PC"  : replicate that pipeline with real PubChem calls.
// Path "LOC" : skip the network: feed the 2D molfile JSME produced for the same SMILES
//              (from jsme_suite.cjs output) into the same MolPad-filter + SmilesSaver.

const fs = require('fs'), path = require('path'), vm = require('vm');
const MV = path.resolve(process.argv[2] || '.');
const jsmeJson = process.argv[3];
const outJson = process.argv[4];

// Load Ketcher chem in Gruntfile order into one context.
const files = ['chem/prototype.js', 'chem/util/common.js', 'chem/util/vec2.js', 'chem/util/set.js', 'chem/util/map.js',
  'chem/util/pool.js', 'chem/chem/element.js', 'chem/chem/struct.js', 'chem/chem/molfile.js', 'chem/chem/sgroup.js',
  'chem/chem/struct_valence.js', 'chem/chem/dfs.js', 'chem/chem/cis_trans.js', 'chem/chem/stereocenters.js', 'chem/chem/smiles.js'];
const ctx = vm.createContext({console, navigator: {userAgent: 'node'}});
vm.runInContext('var window = this;', ctx);   // Ketcher code checks window.util / window.chem
for (const f of files) vm.runInContext(fs.readFileSync(path.join(MV, 'src/js', f), 'utf8'), ctx, {filename: f});
const chem = vm.runInContext('chem', ctx);

// Same data MolPad keeps (MPAtom.getKetcherData / MPBond.getKetcherData / MPMolecule.getKetcherData).
function molpadSmiles(molfile) {
  const parsed = chem.Molfile.parseCTFile(molfile.split('\n'));
  const out = new chem.Struct();
  parsed.atoms.each((i, a) => out.atoms.add(new chem.Struct.Atom({pp: {x: a.pp.x, y: a.pp.y}, label: a.label, charge: a.charge, isotope: a.isotope})));
  parsed.bonds.each((i, b) => out.bonds.add(new chem.Struct.Bond({type: b.type, stereo: b.stereo, begin: b.begin, end: b.end})));
  out.initHalfBonds(); out.initNeighbors(); out.markFragments();
  const smiles = new chem.SmilesSaver().saveMolecule(out);
  const raw = new chem.SmilesSaver().saveMolecule(parsed);   // unfiltered Ketcher, for comparison
  const rt = (() => { try { return new chem.MolfileSaver().saveMolecule(out); } catch (e) { return 'ERR ' + e.message; } })();
  return {smiles, rawKetcher: raw, molfileOut: rt};
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function pubchem(smi) {
  const u = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/smiles/cids/json?smiles=' + encodeURIComponent(smi);
  const j = await (await fetch(u)).json().catch(() => ({}));
  const cid = j.IdentifierList && j.IdentifierList.CID[0];
  if (!(cid > 0)) return {cid: 0, note: j.Fault ? j.Fault.Message : 'no CID'};
  await sleep(250);
  const r = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/sdf?record_type=2d`);
  if (!r.ok) return {cid, note: 'no 2D SDF, HTTP ' + r.status};
  return {cid, sdf: (await r.text()).split('$$$$')[0]};
}

const peptide = n => { const res = ['N[C@@H](C)C(=O)', 'NCC(=O)', 'N[C@@H](CO)C(=O)', 'N[C@@H](CC(C)C)C(=O)', 'N[C@@H](Cc1ccccc1)C(=O)']; let s = ''; for (let i = 0; i < n; i++) s += res[i % res.length]; return s + 'O'; };
const cases = [['A1','CCO'],['A2','c1ccccc1'],['A3','C1=CC=CC=C1'],['A4','c1ccc2ccccc2c1'],['A5','c1cc[nH]c1'],['A6','C[C@H](N)C(=O)O'],['A7a','F/C=C/F'],['A7b','F/C=C\\F'],['A8','[NH4+].[Cl-]'],['A9','C[N+](=O)[O-]'],['A10','CS(=O)(=O)C'],['A11','[13CH4]'],['A12','[CH3]'],['A13a','C1CC1'],['A13b','C1CCCCCCCCCCC1'],['A14','C12C3C4C1C5C2C3C45'],['A15','[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1'],['A16','CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O'],['A17a','CC1=CC=CC=C1'],['A17b','Cc1ccccc1'],['A18','OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'],['A19a','xyz'],['A19b','C1CC'],['A20',peptide(42)]];

(async () => {
  const jsme = jsmeJson ? Object.fromEntries(JSON.parse(fs.readFileSync(jsmeJson, 'utf8')).map(r => [r.id, r])) : {};
  const rows = [];
  for (const [id, smi] of cases) {
    const r = {id, in: smi};
    try {
      const pc = await pubchem(smi);
      r.cid = pc.cid; r.pcNote = pc.note;
      if (pc.sdf) { const m = molpadSmiles(pc.sdf); r.PC_smiles = m.smiles; r.PC_title = pc.sdf.split('\n')[0].trim(); }
    } catch (e) { r.PC_error = String(e.message || e).slice(0, 120); }
    const jm = jsme[id] && jsme[id].molFile;
    if (jm && jsme[id].nAtoms > 0) {
      try { const m = molpadSmiles(jm); r.LOC_smiles = m.smiles; r.LOC_raw = m.rawKetcher; } catch (e) { r.LOC_error = String(e.message || e).slice(0, 120); }
    } else r.LOC_smiles = jm ? '(JSME produced empty molfile)' : '(no JSME molfile)';
    rows.push(r);
    const sh = s => (s || '').length > 120 ? s.slice(0, 117) + '...' : (s || '');
    console.log(`[${id}] ${sh(smi)}\n   PC : CID=${r.cid || '-'} ${r.pcNote || ''} ${sh(r.PC_smiles)} ${r.PC_error || ''}\n   LOC: ${sh(r.LOC_smiles)} ${r.LOC_error || ''}${r.LOC_raw && r.LOC_raw !== r.LOC_smiles ? '  (unfiltered Ketcher: ' + sh(r.LOC_raw) + ')' : ''}`);
    await sleep(300);
  }
  if (outJson) fs.writeFileSync(outJson, JSON.stringify(rows, null, 1));
})();
