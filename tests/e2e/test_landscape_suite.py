"""The shared edge-case suite from docs/landscape/test-suite.md, run through the app's own import, analysis and export code.

Each structure goes through every path a user has: the Analysis panel, SMILES, molfile V2000 and V3000 export, reopening those
molfiles, and ChemDraw (CDXML, CDX), CML and Marvin round trips. Every path must give the structure's standard InChIKey.
The expected keys and masses come from Indigo 1.46 (docs/landscape/opensource/scripts/lonepair/), not from this app, so the
suite checks Lone Pair against an independent toolkit.

Known bugs are marked xfail with their number from docs/landscape/lonepair-audit.md. They are strict: when a fix makes one
pass, the run fails until its mark is removed.
"""
import re
import pytest
from conftest import _open

# id, input, standard InChIKey (Indigo), monoisotopic mass (Indigo)
CASES = [
    ("A1", "CCO", "LFQSCWFLJHTTHZ-UHFFFAOYSA-N", 46.0419),
    ("A2", "c1ccccc1", "UHOVQNZJYSORNB-UHFFFAOYSA-N", 78.0470),
    ("A3", "C1=CC=CC=C1", "UHOVQNZJYSORNB-UHFFFAOYSA-N", 78.0470),
    ("A4", "c1ccc2ccccc2c1", "UFWIBTONFRDIAS-UHFFFAOYSA-N", 128.0626),
    ("A5", "c1cc[nH]c1", "KAESVJOAVNADME-UHFFFAOYSA-N", 67.0422),
    ("A6", "C[C@H](N)C(=O)O", "QNAYBMKLOCPYGJ-REOHCLBHSA-N", 89.0477),
    ("A7a", "F/C=C/F", "WFLOTYSKFUPZQB-OWOJBTEDSA-N", 64.0125),
    ("A7b", "F/C=C\\F", "WFLOTYSKFUPZQB-UPHRSURJSA-N", 64.0125),
    ("A8", "[NH4+].[Cl-]", "NLXLAEXVIDQMFP-UHFFFAOYSA-N", 53.0032),
    ("A9", "C[N+](=O)[O-]", "LYGJENNIWJXYER-UHFFFAOYSA-N", 61.0164),
    ("A10", "CS(=O)(=O)C", "HHVIBTZHLRERCL-UHFFFAOYSA-N", 94.0089),
    ("A11", "[13CH4]", "VNWKTOKETHGBQD-OUBTZVSYSA-N", 17.0347),
    ("A12", "[CH3]", "WCYWZMWISLQXQU-UHFFFAOYSA-N", 15.0235),
    ("A13a", "C1CC1", "LVZWSLJZHVFIQJ-UHFFFAOYSA-N", 42.0470),
    ("A13b", "C1CCCCCCCCCCC1", "DDTBPAQBQHZRDW-UHFFFAOYSA-N", 168.1878),
    ("A14", "C12C3C4C1C5C2C3C45", "TXWRERCHRDBNLG-UHFFFAOYSA-N", 104.0626),
    ("A15", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1", "KTWOOEGAPBSYNW-UHFFFAOYSA-N", 186.0132),
    ("A16", "CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O", "CMKNHBZMXNUDDM-UHFFFAOYSA-N", 240.0634),
    ("A17a", "CC1=CC=CC=C1", "YXFVVABEGXRONW-UHFFFAOYSA-N", 92.0626),
    ("A17b", "Cc1ccccc1", "YXFVVABEGXRONW-UHFFFAOYSA-N", 92.0626),
    ("A18", "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "WQZGKKKJIJFFOK-GASJEMHNSA-N", 180.0634),
    ("A20", "".join(["N[C@@H](C)C(=O)", "NCC(=O)"][i % 2] for i in range(42)) + "O", "INBZYTXUSDAQBF-VBPTUVIWSA-N", 2707.2407),
    ("D1", "CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "RYYVLZVUVIJVGH-UHFFFAOYSA-N", 194.0804),
    ("D5", "CC(=O)Oc1ccccc1C(=O)O", "BSYNRYMUTXBXSQ-UHFFFAOYSA-N", 180.0423),
    ("X1", "C[C@@H](O)CC", "BTANRVKWQNVYAZ-SCSAIBSYSA-N", 74.0732),
    ("X2", "OC(=O)/C=C\\C(=O)O", "VZCYOOQTPOCHFL-UPHRSURJSA-N", 116.0110),
    ("X3", "C[S@](=O)c1ccccc1", "JXTGICXCHWMCPM-VIFPVBQESA-N", 140.0296),
    ("X4", "[O-][n+]1ccccc1", "ILVXOBCQQYKLDS-UHFFFAOYSA-N", 95.0371),
    ("X5", "N#N", "IJGRMHOSHXDMSA-UHFFFAOYSA-N", 28.0061),
    ("X6", "[2H]C([2H])([2H])O", "OKKJLVBELUTLKV-FIBGUPNXSA-N", 35.0450),
    ("X7", "Cl[Pt](Cl)([NH3])[NH3]", "LXZZYRPGZAFOLE-UHFFFAOYSA-L", 298.9556),
    ("X8", "C1CC2CCC1C2", "UMRZSTCPUPJPOJ-UHFFFAOYSA-N", 96.0939),
    ("X9", "C1C2CC3CC1CC(C2)C3", "ORILYTVJVMAKLC-UHFFFAOYSA-N", 136.1252),
    ("X10", "c1ccc2c(c1)ccc1ccccc12", "YNPNZTXNASCQKK-UHFFFAOYSA-N", 178.0783),
    ("X11", "CC(C)(C)[Si](C)(C)OC", "SYFYMKQYUPMRFA-UHFFFAOYSA-N", 146.1127),
    ("X12", "C=C=C", "IYABWNGZIDDRAK-UHFFFAOYSA-N", 40.0313),
    ("X13", "C[C@H]1CC[C@@H](C)CC1", "QRMPKOFEUHIBNM-OCAPTIKFSA-N", 112.1252),
    ("X14", "[Na+].[O-]C(=O)C", "VMHLLURERBWHNL-UHFFFAOYSA-M", 82.0031),
]
PATHS = ["analysis", "export_inchikey", "export_smiles", "export_mol", "export_molV3", "reopen_mol", "reopen_molV3",
         "cdxml", "cdx", "cml", "mrv"]

B10 = "B10: a V3000 molfile with no bonds has an empty bond block, which the IUPAC InChI library rejects"
KNOWN = {("A8", "export_molV3"): B10, ("A11", "export_molV3"): B10, ("A12", "export_molV3"): B10}

# Everything one structure needs, computed in the page in one go. Each path reads the structure back through the
# bundled IUPAC InChI library (inchiOf), so the comparison is by standard InChIKey.
RUN = r"""async s => {
  const docMol = d => toOCL(d, buildIndex(d), d.atoms.map(a=>a.id)).mol;
  const key = async molfile => (await inchiOf(molfile)).key || 'NO KEY';
  const reset = () => { setDoc(newDoc()); sel.clear(); changed(); };
  reset();
  if (!tryLoadText(s, true) || !doc.atoms.length) return {loaded: false};
  const base = subDoc(null), out = {loaded: true, keys: {}};
  const a = analysisFor(doc.atoms.map(x=>x.id)); out.exact = a.exact; out.formula = a.formula;
  const A = doc.atoms, bonded = new Set(doc.bonds.map(b=>[b.a,b.b].sort().join()));
  let min = 1e9; for (let i=0;i<A.length;i++) for (let j=i+1;j<A.length;j++) if (!bonded.has([A[i].id,A[j].id].sort().join())) min = Math.min(min, Math.hypot(A[i].x-A[j].x, A[i].y-A[j].y)/L);
  out.minNonBonded = A.length > 1 ? min : null;
  const path = async (name, f) => { try { out.keys[name] = await f(); } catch (e) { out.keys[name] = 'ERROR ' + (e.message || e); } };
  const ex = async id => (await exportData(id)).data;
  const mol2 = await ex('mol'), mol3 = await ex('molV3');
  await path('analysis', () => key(docMol(doc).toMolfile()));
  await path('export_inchikey', async () => (await ex('inchikey')).trim());
  await path('export_smiles', async () => { const m = smilesMol((await ex('smiles')).trim()); return key(m.toMolfile()); });
  await path('export_mol', () => key(mol2));
  await path('export_molV3', () => key(mol3));
  for (const [name, f] of [['reopen_mol', mol2], ['reopen_molV3', mol3]]) {
    await path(name, () => { reset(); tryLoadText(f, true); return doc.atoms.length ? key(docMol(doc).toMolfile()) : 'NOTHING OPENED'; });
  }
  for (const fmt of ['cdxml', 'cdx', 'cml', 'mrv']) {
    await path(fmt, () => { const {skipped, style, styleOv, labelSize, ...parts} = FORMATS.read(fmt, FORMATS.write(fmt, base));
      return key(docMol(normalizeDoc({...newDoc(), ...parts})).toMolfile()); });
  }
  return out;
}"""


@pytest.fixture(scope="module")
def lp(browser):
    page = _open(browser, {"width": 1400, "height": 900})
    cache = {}
    def run(smiles):
        if smiles not in cache: cache[smiles] = page.evaluate(RUN, smiles)
        return cache[smiles]
    page.run = run
    yield page
    page.context.close()


def case_params(with_paths):
    out = []
    for cid, smi, k, m in CASES:
        for p in (PATHS if with_paths else [None]):
            why = KNOWN.get((cid, p)) if p else None
            marks = [pytest.mark.xfail(reason=why, strict=True)] if why else []
            out.append(pytest.param(smi, k, m, p, id=f"{cid}-{p}" if p else cid, marks=marks))
    return out


@pytest.mark.parametrize("smiles,want_key,mass,path", case_params(True))
def test_every_path_keeps_the_structure(lp, smiles, want_key, mass, path):
    r = lp.run(smiles)
    assert r["loaded"], f"{smiles} did not load"
    assert r["keys"][path] == want_key


@pytest.mark.parametrize("smiles,want_key,mass,path", case_params(False))
def test_exact_mass_matches_indigo(lp, smiles, want_key, mass, path):
    assert abs(lp.run(smiles)["exact"] - mass) < 0.002


B8 = "B8: no cage templates; OpenChemLib's layout puts two adamantane atoms 0.5 bond lengths apart"


@pytest.mark.parametrize("smiles,want_key,mass,path", [
    pytest.param(*p.values, marks=[pytest.mark.xfail(reason=B8, strict=True)] if p.id == "X9" else [], id=p.id) for p in case_params(False)])
def test_layout_keeps_unbonded_atoms_apart(lp, smiles, want_key, mass, path):
    d = lp.run(smiles)["minNonBonded"]
    assert d is None or d >= 0.6, f"two unbonded atoms {d:.2f} bond lengths apart"


# Molfiles another toolkit wrote: RDKit 2026.09 writes chiral flag 0 even when the wedges define one enantiomer
RDKIT_ALA_V2000 = """
     RDKit          2D

  6  5  0  0  0  0  0  0  0  0999 V2000
    0.0000    0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    0.7500    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    1.2990    2.2500    0.0000 N   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981   -0.0000    0.0000 C   0  0  0  0  0  0  0  0  0  0  0  0
    2.5981   -1.5000    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
    3.8971    0.7500    0.0000 O   0  0  0  0  0  0  0  0  0  0  0  0
  2  1  1  6
  2  3  1  0
  2  4  1  0
  4  5  2  0
  4  6  1  0
M  END
"""
RDKIT_ALA_V3000 = """
     RDKit          2D

  0  0  0  0  0  0  0  0  0  0999 V3000
M  V30 BEGIN CTAB
M  V30 COUNTS 6 5 0 0 0
M  V30 BEGIN ATOM
M  V30 1 C 0.000000 0.000000 0.000000 0
M  V30 2 C 1.299038 0.750000 0.000000 0
M  V30 3 N 1.299038 2.250000 0.000000 0
M  V30 4 C 2.598076 -0.000000 0.000000 0
M  V30 5 O 2.598076 -1.500000 0.000000 0
M  V30 6 O 3.897114 0.750000 0.000000 0
M  V30 END ATOM
M  V30 BEGIN BOND
M  V30 1 1 2 1 CFG=3
M  V30 2 1 2 3
M  V30 3 1 2 4
M  V30 4 2 4 5
M  V30 5 1 4 6
M  V30 END BOND
M  V30 END CTAB
M  END
"""
@pytest.mark.parametrize("molfile,told", [(RDKIT_ALA_V2000, True), (RDKIT_ALA_V3000, False)], ids=["V2000", "V3000"])
def test_molfile_from_rdkit_keeps_its_stereocentre(lp, molfile, told):
    r = lp.evaluate("""async f => { setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent='';
        tryLoadText(f, true);
        return {key: (await exportData('inchikey')).data.trim(), smiles: (await exportData('smiles')).data.trim(),
                groups: doc.atoms.filter(a=>a.stg).map(a=>a.stg), toast: document.querySelector('#toast').textContent}; }""", molfile)
    assert r["key"] == "QNAYBMKLOCPYGJ-REOHCLBHSA-N"  # L-alanine
    assert "@" in r["smiles"] and r["groups"] in ([], ["abs"])  # read as drawn: one enantiomer, as RDKit meant
    assert ("read as drawn" in r["toast"]) == told  # the V2000 file's flag said racemic, so the user is told it was overridden


def paste(page, text):
    page.evaluate("""t=>{ setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent='';
        const dt=new DataTransfer(); dt.setData('text/plain', t); document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true})); }""", text)
    page.wait_for_timeout(100)
    return page.evaluate("({atoms: doc.atoms.length, radicals: doc.atoms.filter(a=>a.rad).length, toast: document.querySelector('#toast').textContent})")


def test_rdkit_molfile_pastes_and_opens_as_l_alanine(lp, tmp_path):
    # RDKit leaves the name line blank; paste and File > Open trim the text, which used to make the molfile unreadable
    key = "(async()=> (await exportData('inchikey')).data.trim())()"
    r = paste(lp, RDKIT_ALA_V2000)
    assert r["atoms"] == 6 and "read as drawn" in r["toast"]
    assert lp.evaluate(key) == "QNAYBMKLOCPYGJ-REOHCLBHSA-N"
    f = tmp_path / "alanine.mol"; f.write_text(RDKIT_ALA_V2000)
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed();")
    lp.set_input_files("#fileIn", str(f))
    for _ in range(50):
        if lp.evaluate("doc.atoms.length"): break
        lp.wait_for_timeout(50)
    assert lp.evaluate("doc.atoms.length") == 6
    assert lp.evaluate(key) == "QNAYBMKLOCPYGJ-REOHCLBHSA-N"


@pytest.mark.parametrize("text,formula,datives,arrows", [
    ("Cl[Pt](Cl)([NH3])[NH3]", "Cl2H6N2Pt", 2, 0),  # ammine ligands keep their 3 H: the N-Pt bonds come in as dative
    ("N->[BH3]", "BH6N", 1, 0),                       # SMILES's own dative bond, not a reaction arrow
    ("CC(=O)O.N->[BH3]>>CC(=O)[O-].[NH4+]", None, 1, 1)])  # a reaction can still contain one
def test_dative_ligands_paste_with_their_hydrogens(lp, text, formula, datives, arrows):
    r = paste(lp, text)
    assert r["atoms"], r["toast"]
    got = lp.evaluate("({f: analysisFor(doc.atoms.map(a=>a.id)).formula, d: doc.bonds.filter(b=>b.kind==='dative').length, r: doc.arrows.length})")
    assert (got["d"], got["r"]) == (datives, arrows)
    if formula: assert got["f"] == formula


@pytest.mark.parametrize("text", ["xyz", "C1CC"])
def test_text_that_is_not_a_structure_is_refused(lp, text):
    r = paste(lp, text)
    assert r["atoms"] == 0 and r["toast"]


def test_unclosed_ring_says_which_ring(lp):
    assert re.search(r"\bring\b", paste(lp, "C1CC")["toast"], re.I)  # not the "ring" in "string"


@pytest.mark.parametrize("text, says", [
    ("C1CC", "Ring bond 1 is opened but never closed"),
    ("CC)C", "“)” at character 3 has no “(”"),
    ("C[NH4+", "“[” at character 2 is never closed"),
    ("NaCl", "“Na” has to be written in brackets"),
    ("C[Xx]", "“[Xx]” is not an element"),
    ("C=C=", "ends with “=”"),
    ("CC>>C1CC", "In “C1CC”: Ring bond 1"),  # a reaction names the part
])
def test_invalid_smiles_paste_says_why(lp, text, says):
    r = paste(lp, text)
    assert r["atoms"] == 0 and says in r["toast"], r["toast"]


def test_a_word_paste_keeps_the_plain_message(lp):
    assert paste(lp, "caffeine")["toast"] == "Clipboard text is not a SMILES string or molfile"


@pytest.mark.parametrize("text, pastes_clip", [("C1CC", True), ("c1cccc1", False)])
def test_invalid_smiles_paste_with_an_in_app_copy(lp, text, pastes_clip):
    # Value: protects=with an in-app copy, an unparseable SMILES pastes the copy, while a refused structure (aromatic) still toasts and pastes nothing;
    # fails_when=the syntax exemption is dropped from, or widened in, the paste handler's early return; why_new=the other paste tests run with clip null;
    # seam=none; no_claim=the system clipboard (a synthetic ClipboardEvent stands in)
    lp.evaluate("setDoc(newDoc()); sel.clear(); tryLoadText('CCO'); clip=subDoc(new Set(doc.atoms.map(a=>'a'+a.id)))")
    try: r = paste(lp, text)
    finally: lp.evaluate("clip=null")
    assert r["atoms"] == (3 if pastes_clip else 0), r
    assert ("Not a valid SMILES" in r["toast"]) is False and (("aromatic" in r["toast"]) == (not pastes_clip)), r["toast"]


def _insert(lp, text, pubchem):
    asked = []
    def handle(route):
        asked.append(route.request.url)
        if pubchem == "offline": route.abort()
        else: route.fulfill(status=200, content_type="application/json", body='{"Fault": {"Code": "PUGREST.NotFound"}}')  # a 404 would log a console error
    lp.unroute("**/pubchem.ncbi.nlm.nih.gov/**")
    lp.route("**/pubchem.ncbi.nlm.nih.gov/**", handle)
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed(); openSmilesDialog()")
    lp.fill("#smIn", text); lp.click("#smGo")
    lp.wait_for_function("!/Looking up/.test(document.querySelector('#smErr').textContent)")
    msg = lp.inner_text("#smErr"); lp.evaluate("closeDialog()"); lp.unroute("**/pubchem.ncbi.nlm.nih.gov/**")
    return msg, asked


@pytest.mark.parametrize("pubchem", ["none", "offline"])
def test_insert_dialog_says_why_after_the_name_lookup(lp, pubchem):
    # C60 or B12 might be a name, so the lookup still runs; when it finds nothing (or can't be reached) the SMILES fault is given
    msg, asked = _insert(lp, "C1CC", pubchem)
    assert asked and "Ring bond 1 is opened but never closed" in msg, msg
    assert ("PubChem has no compound" in msg) == (pubchem == "none")


def test_insert_dialog_says_why_for_long_text_without_a_lookup(lp):
    # Value: protects=text over 200 characters with a SMILES fault gives the reason and is not sent to PubChem; fails_when=the length branch drops
    # the reason or the length guard moves after the lookup; why_new=the dialog tests above use short text; seam=none; no_claim=real PubChem (routed)
    msg, asked = _insert(lp, "C1" + "C" * 210, "none")
    assert not asked and msg.startswith("That isn’t a valid SMILES string or molfile. Ring bond 1 is opened"), msg


def test_insert_dialog_still_inserts_a_name_that_is_also_a_broken_smiles(lp):
    # Value: protects=a name that also reads as a faulty SMILES (B12) is still looked up and inserted; fails_when=a syntax reason stops the
    # dialog before the PubChem lookup; why_new=only the not-found and offline lookups were tested; seam=none; no_claim=real PubChem (routed)
    lp.unroute("**/pubchem.ncbi.nlm.nih.gov/**")
    lp.route("**/pubchem.ncbi.nlm.nih.gov/**", lambda route: route.fulfill(status=200, content_type="application/json",
        body='{"PropertyTable": {"Properties": [{"SMILES": "CCO"}]}}'))
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''; openSmilesDialog()")
    lp.fill("#smIn", "B12"); lp.click("#smGo")
    lp.wait_for_function("doc.atoms.length > 0")
    toast = lp.inner_text("#toast"); lp.unroute("**/pubchem.ncbi.nlm.nih.gov/**")
    assert lp.evaluate("doc.atoms.length") == 3 and toast == "Inserted B12 from PubChem"


def test_insert_dialog_keeps_the_name_message_for_a_word(lp):
    msg, _ = _insert(lp, "notacompound", "none")
    assert msg == "Not a valid SMILES, and PubChem has no compound named “notacompound”."


def test_file_open_of_an_invalid_smiles_says_why(lp, tmp_path):
    f = tmp_path / "bad.smi"; f.write_text("CC(C)C1CC\n")
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''")
    lp.set_input_files("#fileIn", str(f))
    lp.wait_for_function("document.querySelector('#toast').textContent")
    assert "Not a valid SMILES. Ring bond 1 is opened" in lp.inner_text("#toast") and lp.evaluate("doc.atoms.length") == 0


@pytest.mark.parametrize("text", ["c1cccc1", "c1ccc[nH]c1", "c1cccc1>>CC"])
def test_aromatic_ring_that_cannot_be_kekulized_is_refused_with_the_reason(lp, text):
    # OpenChemLib would draw a radical nobody wrote; the paste is refused and the toast says what to fix
    r = paste(lp, text)
    assert r["atoms"] == 0 and r["radicals"] == 0
    assert "aromatic" in r["toast"] and "[nH]" in r["toast"]


def test_insert_dialog_explains_an_undrawable_aromatic_ring_without_a_name_lookup(lp):
    asked = []
    lp.route("**/pubchem.ncbi.nlm.nih.gov/**", lambda route: (asked.append(route.request.url), route.abort()))
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed(); openSmilesDialog()")
    lp.fill("#smIn", "c1ccc[nH]c1"); lp.click("#smGo")
    assert "aromatic" in lp.inner_text("#smErr") and lp.evaluate("doc.atoms.length") == 0
    assert asked == []
    lp.unroute("**/pubchem.ncbi.nlm.nih.gov/**")
    lp.evaluate("closeDialog()")


@pytest.mark.parametrize("text", ["[CH3]", "[c]1ccccc1", "C[O]"])
def test_radicals_written_in_brackets_still_paste(lp, text):
    assert paste(lp, text)["radicals"] == 1


@pytest.mark.parametrize("smiles,hill", [
    ("CCO", "C2H6O"), ("CN1C=NC2=C1C(=O)N(C(=O)N2C)C", "C8H10N4O2"), ("[NH4+].[Cl-]", "ClH4N"), ("[Na+].[O-]C(=O)C", "C2H3NaO2"),
    ("[13CH4]", "¹³CH4"), ("[2H]C([2H])([2H])O", "CHD3O"), ("Cl[Pt](Cl)([NH3])[NH3]", "Cl2H6N2Pt")])
def test_formula_is_in_hill_order(lp, smiles, hill):
    assert lp.run(smiles)["formula"] == hill


def test_analysis_panel_shows_the_labelled_formula_and_its_own_m_z(lp):
    lp.evaluate("setDoc(newDoc()); sel.clear(); changed(); tryLoadText('[13CH4]', true); analyzeNow();")
    html = lp.inner_html("#props")
    assert "¹³CH<sub>4</sub>" in html
    assert "18.0419" in html  # [M+H]+ of 13CH4; plain CH4 would be 17.0386


@pytest.mark.xfail(reason="B5: a carbon with five bonds gets no warning", strict=True)
def test_carbon_with_five_bonds_is_flagged(lp):
    text = lp.evaluate("""(()=>{ setDoc(newDoc()); sel.clear(); changed(); tryLoadText('CC(C)(C)C', true);
        const c=doc.atoms.find(a=>doc.bonds.filter(b=>b.a===a.id||b.b===a.id).length===4);
        pushUndo(); const n={id:nid(), el:'C', x:c.x+L, y:c.y+L, charge:0, lp:0, rad:0}; doc.atoms.push(n);
        doc.bonds.push({id:nid(), a:c.id, b:n.id, order:1, stereo:'none'}); changed(); analyzeNow();
        return document.querySelector('#props').innerText; })()""")
    assert "valence" in text.lower()


@pytest.mark.xfail(reason="B9: SMILES export of a reaction joins the parts with dots", strict=True)
def test_reaction_exports_as_reaction_smiles(lp):
    smi = lp.evaluate("""(async()=>{ setDoc(newDoc()); sel.clear(); changed(); tryLoadText('CC(=O)Oc1ccccc1C(=O)O>>CC(=O)O', true);
        return (await exportData('smiles')).data.trim(); })()""")
    assert ">" in smi


def test_suite_ran_without_console_errors(lp):
    assert lp.errors == []
