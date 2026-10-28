"""Cross-check Lone Pair's exported chemical files with RDKit and Open Babel.

Usage: node scripts/gen_format_samples.mjs DIR && python scripts/check_formats.py DIR
DIR holds <name>.<format>.<ext> files and expected.json ({name: SMILES}), as written by
a generator that calls FORMATS.write for each test drawing. Each file is read by every
tool that supports its format, and the canonical SMILES must match the expected one.
Requires: pip install rdkit openbabel-wheel
"""
import json, pathlib, sys
from rdkit import Chem, RDLogger
RDLogger.DisableLog("rdApp.*")
try:
    from openbabel import pybel, openbabel
    openbabel.obErrorLog.SetOutputLevel(0)
except ImportError:
    pybel = None


def canon(smi):
    m = Chem.MolFromSmiles(smi)
    return ".".join(sorted(Chem.MolToSmiles(m).split("."))) if m else None


def from_mols(mols):
    parts = [Chem.MolToSmiles(m) for m in mols if m is not None and m.GetNumAtoms()]
    return canon(".".join(parts)) if parts else None


def rdkit_read(path, fmt):
    if fmt == "cdxml":
        return from_mols(Chem.MolsFromCDXMLFile(str(path), sanitize=True, removeHs=True))
    if fmt == "cdx":
        p = Chem.CDXMLParserParams(); p.format = Chem.CDXMLFormat.CDX
        return from_mols(Chem.MolsFromCDXMLFile(str(path), p))
    if fmt in ("mol", "molV3"):
        return from_mols([Chem.MolFromMolFile(str(path))])
    if fmt == "sdf":
        return from_mols(list(Chem.SDMolSupplier(str(path))))
    if fmt in ("rxn", "rxnV3"):
        from rdkit.Chem import rdChemReactions
        r = rdChemReactions.ReactionFromRxnFile(str(path))
        return from_mols(list(r.GetReactants()) + list(r.GetProducts()))
    if fmt == "smarts":
        m = Chem.MolFromSmarts(path.read_text().strip())
        if m is None: return None
        m.UpdatePropertyCache(False); Chem.SanitizeMol(m)
        return canon(Chem.MolToSmiles(m))
    return "skip"


# The openbabel-wheel CDX reader rejects genuine ChemDraw files too ("no ChemDraw Header"), so CDX is checked with RDKit only.
OB_FMT = {"cdxml": "cdxml", "cml": "cml", "mrv": "mrv", "mol": "mol", "molV3": "mol", "sdf": "sdf", "rxn": "rxn"}


def ob_read(path, fmt):
    if pybel is None or fmt not in OB_FMT: return "skip"
    mols = list(pybel.readfile(OB_FMT[fmt], str(path)))
    parts = []
    for m in mols:
        s = m.write("smi").split("\t")[0].strip()
        if s: parts.extend(x for x in s.replace(">>", ".").replace(">", ".").split(".") if x)
    return canon(".".join(parts)) if parts else None


def skeleton(smi):
    """Heavy-atom graph with bond orders, ignoring H counts, radicals and stereo."""
    m = Chem.MolFromSmiles(smi, sanitize=False) if smi else None
    if m is None: return None
    for a in m.GetAtoms(): a.SetNumRadicalElectrons(0); a.SetNoImplicit(False); a.SetNumExplicitHs(0); a.SetChiralTag(Chem.ChiralType.CHI_UNSPECIFIED)
    for b in m.GetBonds(): b.SetStereo(Chem.BondStereo.STEREONONE)
    try: Chem.SanitizeMol(m)
    except Exception: return Chem.MolToSmiles(m, isomericSmiles=False)
    return ".".join(sorted(Chem.MolToSmiles(m, isomericSmiles=False).split(".")))


# Tool limitations seen with genuine ChemDraw/Marvin files too, so they are reported but not counted:
# Open Babel expands no CDXML nicknames (it prints "*" plus loose fragments) and ignores Marvin's radical attribute.
KNOWN = {("openbabel", "cdxml", "omeNick"), ("openbabel", "cdxml", "phNick"), ("openbabel", "mrv", "radical")}


def main(d):
    d = pathlib.Path(d); exp = json.loads((d / "expected.json").read_text())
    fails = 0; rows = []
    for f in sorted(d.iterdir()):
        if f.name == "expected.json": continue
        name, fmt = f.name.split(".")[:2]
        want = canon(exp[name])
        for tool, fn in (("rdkit", rdkit_read), ("openbabel", ob_read)):
            try: got = fn(f, fmt)
            except Exception as e: got = f"error: {e}"
            if got == "skip": continue
            # Open Babel's CDXML reader leaves implicit H off every atom (also for genuine ChemDraw files),
            # and SMARTS carries no stereo or radicals, so those two are compared as skeletons.
            loose = (tool == "openbabel" and fmt == "cdxml") or fmt == "smarts"
            ok = (skeleton(got) == skeleton(want)) if loose else (got == want)
            known = not ok and (tool, fmt, name) in KNOWN
            fails += not ok and not known
            rows.append(f"{'ok  ' if ok else 'known' if known else 'FAIL'} {tool:9} {fmt:7} {name:9} {'' if ok else f'got {got} want {want}'}")
    # the reaction scheme in CDXML must read back as reactants >> products, not just loose molecules
    from rdkit.Chem import rdChemReactions
    for f in d.glob("reaction.cdxml.*"):
        rx = rdChemReactions.ReactionsFromCDXMLFile(str(f))
        got = [rdChemReactions.ReactionToSmiles(r) for r in rx]
        ok = len(got) == 1 and len(rx[0].GetReactants()) == 2 and len(rx[0].GetProducts()) == 1
        fails += not ok
        rows.append(f"{'ok  ' if ok else 'FAIL'} rdkit     cdxml   reaction  as a reaction: {got}")
    print("\n".join(rows)); print(f"{fails} failures")
    return fails


if __name__ == "__main__":
    sys.exit(1 if main(sys.argv[1]) else 0)
