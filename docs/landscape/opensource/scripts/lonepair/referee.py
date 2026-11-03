"""Referee Lone Pair's suite output with Indigo: canonical SMILES identity, formula, masses, InChIKey."""
import json, sys
from indigo import Indigo
from indigo.inchi import IndigoInchi

ind = Indigo(); inchi = IndigoInchi(ind)
ind.setOption("ignore-stereochemistry-errors", True)
res = json.load(open(sys.argv[1]))

def canon(s):
    try:
        m = ind.loadMolecule(s); m.aromatize(); return m.canonicalSmiles()
    except Exception as e:
        return "ERR " + str(e)[:60]

def canon_mol(mf):
    try:
        m = ind.loadMolecule(mf); m.aromatize(); return m.canonicalSmiles()
    except Exception as e:
        return "ERR " + str(e)[:60]

def key(s):
    try:
        m = ind.loadMolecule(s); return inchi.getInchiKey(inchi.getInchi(m))
    except Exception as e:
        return "ERR"

rows = []
for r in res:
    if not r["id"][0] in "ADX" or "analysis" not in r:
        rows.append({"id": r["id"], "note": r.get("toast") or r.get("smiles"), "loaded": r.get("loaded")}); continue
    src = r["input"]
    if ">>" in src:
        ref = canon(src.replace(">>", "."))
    else:
        ref = canon(src)
    out = {"id": r["id"], "ref": ref}
    a = r["analysis"] or {}
    checks = {
        "analysis_smiles": canon(a.get("smiles", "")),
        "export_smiles": canon(r["ex_smiles"].strip()),
        "export_mol": canon_mol(r["ex_mol"]),
        "export_molV3": canon_mol(r["ex_molV3"]),
        "rt_mol_import": canon(r["rt_mol_import"]) if r["rt_mol_import"] not in ("n/a", "EMPTY") else r["rt_mol_import"],
        "rt_molV3_import": canon(r["rt_molV3_import"]) if r["rt_molV3_import"] not in ("n/a", "EMPTY") else r["rt_molV3_import"],
        "rt_cdxml": canon(r["rt_cdxml"]) if not r["rt_cdxml"].startswith("ERROR") else r["rt_cdxml"],
        "rt_cdx": canon(r["rt_cdx"]) if not r["rt_cdx"].startswith("ERROR") else r["rt_cdx"],
        "rt_cml": canon(r["rt_cml"]) if not r["rt_cml"].startswith("ERROR") else r["rt_cml"],
        "rt_mrv": canon(r["rt_mrv"]) if not r["rt_mrv"].startswith("ERROR") else r["rt_mrv"],
    }
    out["mismatch"] = {k: v for k, v in checks.items() if v != ref}
    try:
        m = ind.loadMolecule(src.replace(">>", "."))
        out["ref_formula"] = m.grossFormula(); out["ref_mw"] = round(m.molecularWeight(), 3); out["ref_exact"] = round(m.monoisotopicMass(), 4)
    except Exception as e:
        out["ref_formula"] = "ERR"
    out["lp_formula"] = a.get("formula"); out["lp_mw"] = round(a.get("mw", 0), 3); out["lp_exact"] = round(a.get("exact", 0), 4)
    if ">>" not in src:
        rk = key(src); lk = r["ex_inchikey"].strip()
        if rk != lk: out["inchikey"] = {"ref": rk, "lp": lk}
    out["layout"] = r["layout"]; out["drawn"] = r["drawn"]; out["t_load_s"] = r["t_load_s"]
    out["console"] = r["console"]; out["toast"] = r["toast"]
    for k in ["ex_jme", "ex_smarts"]:
        if r[k].startswith("ERROR"): out[k] = r[k]
    rows.append(out)

json.dump(rows, open(sys.argv[2], "w"), indent=1)
for o in rows:
    flag = []
    if o.get("mismatch"): flag.append("MISMATCH " + json.dumps(o["mismatch"]))
    if o.get("ref_formula") and o.get("lp_formula") and o["ref_formula"].replace(" ", "") != o["lp_formula"]: flag.append(f"formula ref={o['ref_formula']} lp={o['lp_formula']}")
    if "ref_exact" in o and abs(o["ref_exact"] - o["lp_exact"]) > 0.002: flag.append(f"exact ref={o['ref_exact']} lp={o['lp_exact']}")
    if "ref_mw" in o and abs(o["ref_mw"] - o["lp_mw"]) > 0.05: flag.append(f"mw ref={o['ref_mw']} lp={o['lp_mw']}")
    if o.get("inchikey"): flag.append("inchikey " + json.dumps(o["inchikey"]))
    L = o.get("layout") or {}
    if L.get("closePairs") or L.get("crossings"): flag.append(f"layout {L}")
    if o.get("console"): flag.append("console " + str(o["console"])[:200])
    for k in ["ex_jme", "ex_smarts"]:
        if k in o: flag.append(f"{k} {o[k]}")
    print(o["id"], "OK" if not flag else "")
    for f in flag: print("    ", f)
