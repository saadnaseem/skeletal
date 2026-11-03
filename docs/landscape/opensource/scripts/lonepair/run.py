"""Run the landscape edge-case suite (docs/landscape/test-suite.md) against Lone Pair's built page.

Usage: python3 run.py <path to dist/lonepair.html> <rdkit_mols.json> <out.json>
Everything goes through the app's own functions (tryLoadText, analysisFor, exportData, FORMATS).
"""
import json, sys, time, pathlib
from playwright.sync_api import sync_playwright

DIST, MOLS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

def peptide(n):
    # alternating L-Ala / Gly, about 3.5 heavy atoms per Gly and 5 per Ala; n residues
    res = ["N[C@@H](C)C(=O)", "NCC(=O)"]
    return "".join(res[i % 2] for i in range(n)) + "O"

CASES = [
    ("A1", "CCO"), ("A2", "c1ccccc1"), ("A3", "C1=CC=CC=C1"), ("A4", "c1ccc2ccccc2c1"),
    ("A5", "c1cc[nH]c1"), ("A6", "C[C@H](N)C(=O)O"), ("A7a", "F/C=C/F"), ("A7b", "F/C=C\\F"),
    ("A8", "[NH4+].[Cl-]"), ("A9", "C[N+](=O)[O-]"), ("A10", "CS(=O)(=O)C"), ("A11", "[13CH4]"),
    ("A12", "[CH3]"), ("A13a", "C1CC1"), ("A13b", "C1CCCCCCCCCCC1"), ("A14", "C12C3C4C1C5C2C3C45"),
    ("A15", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1"), ("A16", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O"),
    ("A17a", "CC1=CC=CC=C1"), ("A17b", "Cc1ccccc1"), ("A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"),
    ("A19a", "xyz"), ("A19b", "C1CC"), ("A19c", "c1cccc1"), ("A19d", "c1ccc[nH]c1"),
    ("A20", peptide(42)), ("D1", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"), ("D5", "CC(=O)Oc1ccccc1C(=O)O"),
    ("X1", "C[C@@H](O)CC"), ("X2", "OC(=O)/C=C\\C(=O)O"), ("X3", "C[S@](=O)c1ccccc1"), ("X4", "[O-][n+]1ccccc1"),
    ("X5", "N#N"), ("X6", "[2H]C([2H])([2H])O"), ("X7", "Cl[Pt](Cl)([NH3])[NH3]"), ("X8", "C1CC2CCC1C2"),
    ("X9", "C1C2CC3CC1CC(C2)C3"), ("X10", "c1ccc2c(c1)ccc1ccccc12"), ("X11", "CC(C)(C)[Si](C)(C)OC"),
    ("X12", "C=C=C"), ("X13", "C[C@H]1CC[C@@H](C)CC1"), ("X14", "[Na+].[O-]C(=O)C"),
]

HELPERS = r"""
window.__lp = {
  clear(){ setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''; },
  toast(){ return document.querySelector('#toast').textContent; },
  ids(){ return doc.atoms.map(a=>a.id); },
  layout(){
    const A=doc.atoms, bonded=new Set(doc.bonds.map(b=>[b.a,b.b].sort().join(',')));
    let min=1e9, close=0;
    for(let i=0;i<A.length;i++) for(let j=i+1;j<A.length;j++){ if (bonded.has([A[i].id,A[j].id].sort().join(','))) continue;
      const d=Math.hypot(A[i].x-A[j].x, A[i].y-A[j].y)/L; if (d<min) min=d; if (d<0.5) close++; }
    // bond crossings
    const P=id=>ix.atom.get(id); let cross=0; const B=doc.bonds;
    const ccw=(a,b,c)=>(c.y-a.y)*(b.x-a.x)>(b.y-a.y)*(c.x-a.x);
    for(let i=0;i<B.length;i++) for(let j=i+1;j<B.length;j++){ const s=new Set([B[i].a,B[i].b,B[j].a,B[j].b]); if (s.size<4) continue;
      const a=P(B[i].a),b=P(B[i].b),c=P(B[j].a),d=P(B[j].b); if (ccw(a,c,d)!==ccw(b,c,d) && ccw(a,b,c)!==ccw(a,b,d)) cross++; }
    return {minNonBonded: A.length>1? +min.toFixed(3): null, closePairs: close, crossings: cross};
  },
  drawn(){ return { atoms: doc.atoms.length, bonds: doc.bonds.length, arrows: doc.arrows.length, pluses: doc.pluses.length, texts: doc.texts.length,
      wedges: doc.bonds.filter(b=>b.stereo&&b.stereo!=='none').map(b=>b.stereo), radicals: doc.atoms.filter(a=>a.rad).length,
      charges: doc.atoms.filter(a=>a.charge).map(a=>a.el+a.charge), labels: doc.atoms.filter(a=>a.el!=='C').map(a=>a.el) }; },
  async ex(id){ try{ const r=await exportData(id); return typeof r.data==='string'? r.data : '[binary '+(r.data.length||r.data.size)+']'; }catch(e){ return 'ERROR: '+(e.message||e); } },
  smilesOfDoc(d){ const dix=buildIndex(d); const ids=d.atoms.map(a=>a.id); if(!ids.length) return 'EMPTY'; return toOCL(d,dix,ids).mol.toIsomericSmiles(); },
  rt(fmt){ try{ const w=FORMATS.write(fmt, subDoc(null)); const r=FORMATS.read(fmt, w); const {skipped,style,styleOv,labelSize,...parts}=r; return this.smilesOfDoc(normalizeDoc({...newDoc(),...parts})); }catch(e){ return 'ERROR: '+(e.message||e); } },
};
"""

def run_case(page, cid, smi):
    page.evaluate("__lp.clear()")
    t0 = time.time()
    try:
        ok = page.evaluate("s=>tryLoadText(s, true)", smi)
    except Exception as e:
        ok = f"THROW {e}"
    t_load = round(time.time() - t0, 3)
    page.wait_for_timeout(50)
    r = {"id": cid, "input": smi, "loaded": ok, "toast": page.evaluate("__lp.toast()"), "t_load_s": t_load}
    if not page.evaluate("doc.atoms.length"):
        return r
    r["drawn"] = page.evaluate("__lp.drawn()")
    r["layout"] = page.evaluate("__lp.layout()")
    a = page.evaluate("(()=>{ const x=analysisFor(__lp.ids()); return x && {smiles:x.smiles, formula:x.formula, mw:x.mw, exact:x.exact, generic:x.generic}; })()")
    r["analysis"] = a
    for fmt in ["smiles", "mol", "molV3", "inchikey", "jme", "smarts"]:
        r["ex_" + fmt] = page.evaluate("f=>__lp.ex(f)", fmt)
    for fmt in ["cdxml", "cdx", "cml", "mrv"]:
        r["rt_" + fmt] = page.evaluate("f=>__lp.rt(f)", fmt)
    # molfile round trips through the import path the user uses
    for key in ["ex_mol", "ex_molV3"]:
        mf = r[key]
        page.evaluate("__lp.clear()")
        if mf.startswith("ERROR"):
            r["rt_" + key[3:] + "_import"] = "n/a"; continue
        page.evaluate("s=>tryLoadText(s, true)", mf)
        r["rt_" + key[3:] + "_import"] = page.evaluate("doc.atoms.length ? __lp.smilesOfDoc(doc) : 'EMPTY'")
    return r

def main():
    mols = json.loads(pathlib.Path(MOLS).read_text())
    results = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 1400, "height": 900})
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type in ("error", "warning") else None)
        page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        page.goto(pathlib.Path(DIST).resolve().as_uri())
        for _ in range(200):
            if page.evaluate("typeof OCL!=='undefined' && typeof tryLoadText==='function'"): break
            page.wait_for_timeout(100)
        page.evaluate(HELPERS)
        for cid, smi in CASES:
            n0 = len(errors)
            r = run_case(page, cid, smi)
            r["console"] = errors[n0:]
            results.append(r)
            print(cid, "loaded=", r.get("loaded"), "smiles=", (r.get("analysis") or {}).get("smiles"), flush=True)
        # molfiles written by another toolkit
        for k, mf in mols.items():
            page.evaluate("__lp.clear()")
            n0 = len(errors)
            page.evaluate("s=>tryLoadText(s, true)", mf)
            results.append({"id": "C1-rdkit-" + k, "input": "RDKit molfile " + k,
                            "smiles": page.evaluate("doc.atoms.length ? __lp.smilesOfDoc(doc) : 'EMPTY'"),
                            "drawn": page.evaluate("__lp.drawn()"), "console": errors[n0:]})
            print(results[-1]["id"], results[-1]["smiles"], flush=True)
        b.close()
    pathlib.Path(OUT).write_text(json.dumps(results, indent=1))

main()
