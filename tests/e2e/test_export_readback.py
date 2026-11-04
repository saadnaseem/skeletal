"""Every structure file Lone Pair writes is read back and compared with the drawing; a file that would lose something says what."""
import pytest

FORMATS = ["smiles", "mol", "molV3", "sdf", "cdxml", "cdx", "cml", "mrv"]


def draw(page, smiles):
    page.evaluate("s=>{ setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''; tryLoadText(s, true); sel.clear(); changed(); }", smiles)


def check(page, fmt):
    return page.evaluate("async f=>{ const {data}=await exportData(f); return exportCheck(f, data, exportDoc()); }", fmt)


@pytest.mark.parametrize("smiles", [
    "CC(=O)Oc1ccccc1C(=O)O", "C[C@H](N)C(=O)O", "F/C=C\\F", "C[13CH2]O", "[2H]C([2H])([2H])O", "[NH4+].[Cl-]", "[CH3]",
    "OC[C@H]1OC(O)[C@H](O)[C@@H](O)[C@@H]1O", "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1", "CC(=O)O.OCC>>CC(=O)OCC", "C12C3C4C1C5C2C3C45"])
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
