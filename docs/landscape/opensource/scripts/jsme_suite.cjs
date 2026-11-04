// Runs test-suite.md section A (SMILES) against JSME (GWT build) headless in jsdom.
// Usage: node jsme_suite.cjs /path/to/jsme-editor.github.io/dist  [out.json]
// Needs: npm install jsdom@24   (no canvas package: JSME's canvas calls are no-ops)
// For each case: readGenericMolecularInput(smi) -> smiles(), nonisomericSmiles(), molFile();
// then molfile round trip: readMolFile(molFile()) -> smiles().
const {JSDOM, VirtualConsole} = require('jsdom');
const path = require('path');
const dist = path.resolve(process.argv[2] || './dist');
const vc = new VirtualConsole(); const errs = [];
vc.on('jsdomError', e => errs.push(String(e.message || e).slice(0, 200)));
vc.on('error', e => errs.push('console.error ' + String(e).slice(0, 200)));
const html = `<!doctype html><html><head><script src="file://${dist}/jsme/jsme.nocache.js"></script></head>
<body><div id="c"></div><script>
function jsmeOnLoad(){ window.__ready = true; try { window.app = new JSApplet.JSME("c","380px","340px"); } catch(e){ window.__err = String(e && e.stack || e); } }
</script></body></html>`;
const dom = new JSDOM(html, {url: `file://${dist}/index.html`, runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc});
const w = dom.window;
w.matchMedia = w.matchMedia || (() => ({matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}}));
w.alert = m => errs.push('alert: ' + String(m).slice(0, 200));
const peptide = n => { const res = ['N[C@@H](C)C(=O)', 'NCC(=O)', 'N[C@@H](CO)C(=O)', 'N[C@@H](CC(C)C)C(=O)', 'N[C@@H](Cc1ccccc1)C(=O)']; let s = ''; for (let i = 0; i < n; i++) s += res[i % res.length]; return s + 'O'; };
const cases = [['A1','CCO'],['A2','c1ccccc1'],['A3','C1=CC=CC=C1'],['A4','c1ccc2ccccc2c1'],['A5','c1cc[nH]c1'],['A6','C[C@H](N)C(=O)O'],['A7a','F/C=C/F'],['A7b','F/C=C\\F'],['A8','[NH4+].[Cl-]'],['A9','C[N+](=O)[O-]'],['A10','CS(=O)(=O)C'],['A11','[13CH4]'],['A12','[CH3]'],['A13a','C1CC1'],['A13b','C1CCCCCCCCCCC1'],['A14','C12C3C4C1C5C2C3C45'],['A15','[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1'],['A16','CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O'],['A17a','CC1=CC=CC=C1'],['A17b','Cc1ccccc1'],['A18','OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O'],['A19a','xyz'],['A19b','C1CC'],['A20',peptide(42)]];
let n = 0;
const iv = setInterval(() => {
  n++;
  if (w.__ready || n > 300) {
    clearInterval(iv);
    console.log('jsmeOnLoad called:', !!w.__ready, ' JSApplet defined:', typeof w.JSApplet, ' ctor error:', w.__err ? w.__err.slice(0, 300) : 'none');
    const app = w.app;
    (async () => {
      const sleep = ms => new Promise(r => setTimeout(r, ms));
      const out = [];
      if (app) for (const [id, s] of cases) {
        // fresh editor per case: reset() does not leave reaction mode after A16
        const div = w.document.createElement('div'); div.id = 'c_' + id; w.document.body.appendChild(div);
        const app = new w.JSApplet.JSME(div.id, '380px', '340px');
        const r = {id, in: s};
        errs.length = 0;
        const t = Date.now();
        try { app.reset(); app.readGenericMolecularInput(s); } catch (e) { r.readErr = String(e).slice(0, 120); }
        for (let k = 0; k < 60 && !app.smiles(); k++) await sleep(50);   // SMILES parser lives in a GWT runAsync fragment
        r.ms = Date.now() - t;
        for (const f of ['smiles', 'nonisomericSmiles', 'molFile']) { try { r[f] = app[f](); } catch (e) { r[f] = 'ERR ' + String(e).slice(0, 80); } }
        try { r.nAtoms = app.totalNumberOfAtoms(); r.nMols = app.numberOfMolecules(); } catch (e) {}
        try { const mf = r.molFile; app.reset(); app.readMolFile(mf); r.molRT = app.smiles(); r.molRT_same = r.molRT === r.smiles; } catch (e) { r.molRT = 'ERR ' + String(e).slice(0, 80); }
        try { app.readGenericMolecularInput(s); r.svgBytes = (app.getMolecularAreaGraphicsString() || '').length; } catch (e) { r.svgBytes = 'ERR ' + String(e).slice(0, 60); }
        r.messages = errs.slice(0, 3);
        out.push(r);
      }
      if (process.argv[3]) require('fs').writeFileSync(process.argv[3], JSON.stringify(out, null, 1));
      if (process.env.OUT) require('fs').writeFileSync(process.env.OUT, JSON.stringify(out, null, 1));
      for (const r of out) console.log(`[${r.id}] ${r.in.length > 50 ? r.in.slice(0, 40) + '...' : r.in}\n   smiles=${(r.smiles || '').slice(0, 160)}  atoms=${r.nAtoms} mols=${r.nMols} ${r.ms}ms\n   molRT=${r.molRT_same ? 'same' : (r.molRT || '').slice(0, 120)}  svgBytes=${r.svgBytes}  ${r.readErr ? 'readErr=' + r.readErr : ''} ${r.messages.length ? 'msgs=' + JSON.stringify(r.messages) : ''}`);
      console.log('jsdom errors (first 8):', errs.slice(0, 8));
      process.exit(0);
    })();
  }
}, 50);
