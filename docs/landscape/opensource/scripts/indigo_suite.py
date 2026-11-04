#!/usr/bin/env python3
"""Run the Lone Pair edge-case suite (docs/landscape/test-suite.md, section A
plus C7, D1, D2, D3) against EPAM Indigo through its Python package.

Setup:
    python3 -m venv indigo-venv
    indigo-venv/bin/pip install epam.indigo
    indigo-venv/bin/python -I indigo_suite.py [--json out.json]

For every case it records: load status (or error), canonical SMILES, a
molfile V2000 and V3000 round trip (layout -> molfile -> reload -> canonical
SMILES compared with the original), gross formula, average molecular weight,
monoisotopic mass, CIP labels, InChI and InChIKey, and the 2D layout time.
"""
import json
import sys
import time

from indigo import Indigo, IndigoException
from indigo.inchi import IndigoInchi

CIP = {0: "", 1: "?", 2: "s", 3: "r", 4: "S", 5: "R", 6: "E", 7: "Z"}

PEPTIDE_300 = "N[C@@H](C)C(=O)" * 60 + "O"  # Ala60: 301 heavy atoms

CASES = [
    ("A1", "CCO"),
    ("A2", "c1ccccc1"),
    ("A3", "C1=CC=CC=C1"),
    ("A4", "c1ccc2ccccc2c1"),
    ("A5", "c1cc[nH]c1"),
    ("A6", "C[C@H](N)C(=O)O"),
    ("A7a", "F/C=C/F"),
    ("A7b", "F/C=C\\F"),
    ("A8", "[NH4+].[Cl-]"),
    ("A9", "C[N+](=O)[O-]"),
    ("A10", "CS(=O)(=O)C"),
    ("A11", "[13CH4]"),
    ("A12", "[CH3]"),
    ("A13a", "C1CC1"),
    ("A13b", "C1CCCCC1"),
    ("A13c", "C1CCCCCCCCCCC1"),
    ("A14", "C12C3C4C1C5C2C3C45"),
    ("A15", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1"),
    ("A16", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O"),
    ("A17a", "CC1=CC=CC=C1"),
    ("A17b", "Cc1ccccc1"),
    ("A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O"),
    ("A19a", "xyz"),
    ("A19b", "C1CC"),
    ("A20", PEPTIDE_300),
    ("D1-D2", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"),  # caffeine
]


def cip_labels(indigo, mol):
    """Atom and bond CIP labels, read from Indigo's KET output with the
    stereo-descriptor option on (works for both atoms and double bonds)."""
    try:
        m = mol.clone()
        m.addCIPStereoDescriptors()
        ket = json.loads(m.json())
        out = []
        for key, node in ket.items():
            if not key.startswith("mol"):
                continue
            for i, a in enumerate(node.get("atoms", [])):
                if a.get("cip"):
                    out.append(f"{a['label']}{i + 1}:{a['cip']}")
            for b in node.get("bonds", []):
                if b.get("cip"):
                    out.append(f"bond{b['atoms'][0] + 1}-{b['atoms'][1] + 1}:{b['cip']}")
        return " ".join(out)
    except IndigoException as e:
        return f"ERR {e}"


def min_contact(mol):
    """Smallest distance between two non-bonded atoms, in units of the
    median bond length, after layout. Values well under ~0.5 mean overlaps."""
    import statistics
    xyz = {a.index(): a.xyz()[:2] for a in mol.iterateAtoms()}
    bonded = set()
    lengths = []
    for b in mol.iterateBonds():
        i, j = b.source().index(), b.destination().index()
        bonded.add((min(i, j), max(i, j)))
        (x1, y1), (x2, y2) = xyz[i], xyz[j]
        lengths.append(((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5)
    if not lengths:
        return None
    med = statistics.median(lengths)
    ids = sorted(xyz)
    best = float("inf")
    for n, i in enumerate(ids):
        for j in ids[n + 1:]:
            if (i, j) in bonded:
                continue
            (x1, y1), (x2, y2) = xyz[i], xyz[j]
            best = min(best, ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5)
    return round(best / med, 3) if best != float("inf") else None


def run_case(indigo, inchi, cid, smi):
    r = {"id": cid, "input": smi if len(smi) < 80 else smi[:40] + "...(%d chars)" % len(smi)}
    is_rxn = ">" in smi
    try:
        obj = indigo.loadReaction(smi) if is_rxn else indigo.loadMolecule(smi)
    except IndigoException as e:
        r["error"] = str(e)
        return r
    r["loaded"] = True
    try:
        r["canonical"] = obj.canonicalSmiles()
    except IndigoException as e:
        r["canonical"] = f"ERR {e}"
    if not is_rxn:
        try:
            r["bad_valence"] = obj.checkBadValence() or ""
        except IndigoException as e:
            r["bad_valence"] = f"ERR {e}"
    try:
        arom = obj.clone()
        arom.aromatize()
        r["canonical_aromatized"] = arom.canonicalSmiles()
    except IndigoException as e:
        r["canonical_aromatized"] = f"ERR {e}"
    t0 = time.perf_counter()
    obj.layout()
    r["layout_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    if not is_rxn:
        r["layout_min_contact"] = min_contact(obj)

    for ver in ("2000", "3000"):
        indigo.setOption("molfile-saving-mode", ver)
        try:
            mf = obj.rxnfile() if is_rxn else obj.molfile()
            back = indigo.loadReaction(mf) if is_rxn else indigo.loadMolecule(mf)
            rt = back.canonicalSmiles()
            r[f"v{ver}_roundtrip"] = "same" if rt == r.get("canonical") else f"DIFF {rt}"
        except IndigoException as e:
            r[f"v{ver}_roundtrip"] = f"ERR {e}"
    indigo.setOption("molfile-saving-mode", "auto")

    if is_rxn:
        r["components"] = f"{obj.countReactants()} reactant(s) -> {obj.countProducts()} product(s)"
        return r

    r["components"] = obj.countComponents()
    for key, fn in (("formula", obj.grossFormula), ("mw", obj.molecularWeight),
                    ("mono_mass", obj.monoisotopicMass)):
        try:
            v = fn()
            r[key] = round(v, 4) if isinstance(v, float) else v
        except IndigoException as e:
            r[key] = f"ERR {e}"
    r["cip"] = cip_labels(indigo, obj)
    try:
        inc = inchi.getInchi(obj)
        r["inchi"] = inc
        r["inchikey"] = inchi.getInchiKey(inc)
    except IndigoException as e:
        r["inchikey"] = f"ERR {e}"
    # radicals / isotopes / charges, to check A8, A11, A12
    extras = []
    for a in obj.iterateAtoms():
        bits = []
        if a.charge():
            bits.append(f"charge={a.charge()}")
        if a.isotope():
            bits.append(f"iso={a.isotope()}")
        if a.radicalElectrons():
            bits.append(f"rad_e={a.radicalElectrons()}")
        if bits:
            extras.append(a.symbol() + "(" + ",".join(bits) + ")")
    r["atom_flags"] = " ".join(extras)
    return r


def main():
    indigo = Indigo()
    inchi = IndigoInchi(indigo)
    print("Indigo", indigo.version())
    results = [run_case(indigo, inchi, cid, smi) for cid, smi in CASES]
    for r in results:
        print(json.dumps(r))
    if "--json" in sys.argv:
        with open(sys.argv[sys.argv.index("--json") + 1], "w") as f:
            json.dump({"indigo": indigo.version(), "results": results}, f, indent=1)


if __name__ == "__main__":
    main()
