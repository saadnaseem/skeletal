"""Every structure file Lone Pair writes is read back and compared with the drawing; a file that would lose something says what."""
import pytest

FORMATS = ["smiles", "mol", "molV3", "sdf", "cdxml", "cdx", "cml", "mrv"]


def draw(page, smiles):
    page.evaluate("s=>{ setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''; tryLoadText(s, true); sel.clear(); changed(); }", smiles)


def check(page, fmt):
    return page.evaluate("async f=>{ const {data}=await exportData(f); return exportCheck(f, data, exportDoc()); }", fmt)


@pytest.mark.parametrize("smiles", [
    "CC(=O)Oc1ccccc1C(=O)O", "C[C@H](N)C(=O)O", "F/C=C\\F", "C[13CH2]O", "[2H]C([2H])([2H])O", "[NH4+].[Cl-]", "[CH3]",
    "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1", "CC(=O)O.OCC>>CC(=O)OCC", "C12C3C4C1C5C2C3C45",
    "[H][H]"])  # H2: its SMILES keeps [H], which must not read back as protium
@pytest.mark.parametrize("fmt", FORMATS)
def test_a_faithful_export_reads_back_the_same(page, smiles, fmt):
    draw(page, smiles)
    assert check(page, fmt) == ""


def test_an_export_that_loses_dative_bonds_says_so(page):
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    for fmt in ["mol", "smiles"]:  # molfile and SMILES leave the N->Pt bonds out (audit B12)
        assert "dative" in check(page, fmt), fmt
    for fmt in ["cdxml", "cdx"]:  # ChemDraw files keep them
        assert check(page, fmt) == "", fmt


def test_a_writer_that_drops_an_isotope_is_caught(page):
    # what B4 was: CML written without isotopeNumber reads back as plain ethanol
    draw(page, "C[13CH2]O")
    page.evaluate("""window.__w=FORMATS.write; FORMATS.write=(id,d)=>{ const s=__w(id,d); return id==='cml'? s.replace(/ isotopeNumber="\\d+"/g,'') : s; }; 0""")
    try:
        msg = check(page, "cml")
    finally:
        page.evaluate("FORMATS.write=window.__w; 0")
    assert "C¹³CH6O" in msg and "C2H6O" in msg


def test_a_writer_that_drops_stereo_is_caught(page):
    draw(page, "C[C@H](N)C(=O)O")
    page.evaluate("""window.__w=FORMATS.write; FORMATS.write=(id,d)=>{ const s=__w(id,d); return id==='mrv'? s.replace(/<bondStereo>[WH]<\\/bondStereo>/g,'') : s; }; 0""")
    try:
        msg = check(page, "mrv")
    finally:
        page.evaluate("FORMATS.write=window.__w; 0")
    assert "stereo" in msg.lower()


def test_save_as_still_saves_and_then_warns(page):
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    with page.expect_download() as dl:
        page.evaluate("exportAs('mol')")
    assert dl.value.suggested_filename.endswith(".mol")
    for _ in range(50):
        if "dative" in page.inner_text("#toast"): break
        page.wait_for_timeout(50)
    assert "dative" in page.inner_text("#toast")


def test_copy_as_smiles_warns_too(page):
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    page.context.grant_permissions(["clipboard-read", "clipboard-write"])
    page.evaluate("exportAs('smiles', true)")
    for _ in range(50):
        if "dative" in page.inner_text("#toast"): break
        page.wait_for_timeout(50)
    assert "dative" in page.inner_text("#toast")


def test_a_writer_that_changes_bond_order_is_caught(page):
    # Value: protects=different-bonds branch; fails_when=same formula but altered bond goes unreported; why_new=no test hit this branch; seam=none; no_claim=wording
    # butane written with its last bond moved to the second carbon reads back as isobutane: same formula, other bonds
    draw(page, "CCCC")
    page.evaluate("""window.__w=FORMATS.write; FORMATS.write=(id,d)=>{ const s=__w(id,d); return id==='cml'? s.replace('atomRefs2="a3 a4"','atomRefs2="a2 a4"') : s; }; 0""")
    try:
        msg = check(page, "cml")
    finally:
        page.evaluate("FORMATS.write=window.__w; 0")
    assert "different bonds" in msg


def test_an_unreadable_file_says_it_could_not_be_checked(page):
    # Value: protects=read-back catch path; fails_when=a reader throw escapes or is reported as faithful; why_new=error path untested; seam=none; no_claim=all readers
    draw(page, "CCO")
    assert "read back" in page.evaluate("exportCheck('cdx', 'not a cdx', exportDoc())")
    # a reader that doesn't throw but finds nothing gets the same message, not a formula comparison with a blank side
    msg = page.evaluate("exportCheck('cml', '<<not xml', exportDoc())")
    assert "read back" in msg and ", not" not in msg


def test_no_check_for_non_structure_formats_empty_or_generic_drawings(page):
    # Value: protects=early returns; fails_when=empty doc, R/X atoms or non-readback ids raise false warnings; why_new=early returns untested; seam=none; no_claim=toast UI
    draw(page, "CCO")
    assert page.evaluate("exportCheck('svg', '', exportDoc())") == ""
    page.evaluate("setDoc(newDoc()); changed(); 0")
    assert page.evaluate("exportCheck('mol', '', exportDoc())") == ""
    draw(page, "CCO")  # an R label is written as an unknown atom on purpose ('*' in SMILES reads as carbon, so relabel)
    page.evaluate("doc.atoms[0].el='R'; changed(); 0")
    assert page.evaluate("doc.atoms[0].el") == "R"
    assert check(page, "mol") == ""


def test_a_failed_copy_does_not_say_copied(page):
    # Value: protects=the warning toast tells the truth when the clipboard refuses; fails_when=it says copied over the manual-copy dialog; why_new=red-team finding; seam=none; no_claim=real clipboard permissions
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    page.evaluate("""navigator.clipboard.writeText=()=>Promise.reject(new Error('denied')); document.execCommand=()=>false; 0""")
    page.evaluate("exportAs('smiles', true)")
    for _ in range(50):
        if "dative" in page.inner_text("#toast"): break
        page.wait_for_timeout(50)
    toast = page.inner_text("#toast")
    assert "dative" in toast and "copied" not in toast
    assert "Copy text" in page.inner_text("#dialog")  # the text is offered to copy by hand


def test_a_reader_that_reverses_a_dative_bond_is_caught(page):
    # the same number of dative bonds, pointing the wrong way, is not the drawing
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    page.evaluate("""window.__w=FORMATS.write; FORMATS.write=(id,d)=>{ const s=__w(id,d); return id==='cdxml'? s.replace(/B="(\\d+)" E="(\\d+)" Order="dative"/, 'B="$2" E="$1" Order="dative"') : s; }; 0""")
    try:
        msg = check(page, "cdxml")
    finally:
        page.evaluate("FORMATS.write=window.__w; 0")
    assert "different dative bonds" in msg


@pytest.mark.parametrize("how,message", [("reject", "Could not save the file here"), ("declined", "")])
def test_a_failed_or_declined_save_keeps_its_own_message(page, how, message):
    # the read-back warning must not replace the save's failure, or a file that was never written reads as exported
    draw(page, "Cl[Pt](Cl)([NH3])[NH3]")
    err = "Object.assign(new Error('no'), {code:'declined'})" if how == "declined" else "new Error('disk full')"
    page.evaluate(f"dlCap={{save:()=>Promise.reject({err})}}; document.querySelector('#toast').textContent=''; 0")
    try:
        page.evaluate("exportAs('mol')")
        page.wait_for_timeout(300)
        toast = page.inner_text("#toast")
    finally:
        page.evaluate("dlCap=undefined; 0")
    assert "dative" not in toast
    assert toast == message
