"""Spec 002 (aromatic imports): molfiles with aromatic bonds written as type 4 open with alternating single and double bonds by
every route, and a ring that can't alternate is refused (molfiles) or counted (ChemDraw, CML, Marvin files). Checks CK-05...CK-08
of sdd/specs/002-aromatic-imports/validation.md, named after the requirement IDs."""
import pytest
from conftest import _wait

RESET = "loadProject(newProject()); sel.clear(); changed();"
# a molfile made by OpenChemLib from SMILES, with its aromatic bonds rewritten as type 4 (as CDK and Open Babel write them)
TYPE4 = """s=>{ const m=OCL.Molecule.fromSmiles(s); m.inventCoordinates(); m.ensureHelperArrays(OCL.Molecule.cHelperRings);
  const L=m.toMolfile().split('\\n'), na=+L[3].slice(0,3), nb=+L[3].slice(3,6);
  for (let k=0;k<nb;k++){ const l=L[4+na+k], b=m.getBond(+l.slice(0,3)-1, +l.slice(3,6)-1); if (b>=0 && m.isAromaticBond(b)) L[4+na+k]=l.slice(0,6)+'  4'+l.slice(9); }
  return L.join('\\n'); }"""
REFUSED = "aromatic ring that can’t alternate single and double bonds"


def type4(page, smi): return page.evaluate(TYPE4, smi)
def atoms(page): return page.evaluate("doc.atoms.length")
def formula(page): return page.evaluate("doc.atoms.length ? analysisFor(doc.atoms.map(a=>a.id)).formula : ''")
def doubles(page): return page.evaluate("doc.bonds.filter(b=>b.order===2).length")
def dialog_open(page): return page.evaluate("modal.classList.contains('open')")


def paste(page, text):
    page.evaluate("""t=>{ loadProject(newProject()); sel.clear(); changed();
        const dt=new DataTransfer(); dt.setData('text/plain', t); document.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true})); }""", text)
    page.wait_for_timeout(100)


def open_file(page, path):
    page.evaluate(RESET)
    page.set_input_files("#fileIn", str(path))
    for _ in range(50):
        if atoms(page) or dialog_open(page) or page.evaluate("document.getElementById('toast').classList.contains('show')"): break
        page.wait_for_timeout(50)


def via_dialog(page, text):
    page.evaluate(RESET)
    page.click("#bSmiles")
    page.fill("#smIn", text)
    page.click("#smGo")


@pytest.mark.parametrize("route", ["dialog", "paste", "mol", "sdf"])
def test_FR_001_type4_benzene_every_route(page, tmp_path, route):
    t = type4(page, "c1ccccc1")
    assert "  4  0" in t
    if route == "dialog": via_dialog(page, t)
    elif route == "paste": paste(page, t)
    else:
        f = tmp_path / f"benzene.{route}"; f.write_text(t + ("\n$$$$\n" if route == "sdf" else ""))
        open_file(page, f)
    assert formula(page) == "C6H6" and doubles(page) == 3 and not dialog_open(page)


@pytest.mark.parametrize("smi,f", [("c1ccncc1", "C5H5N"), ("c1ccc2ccccc2c1", "C10H8"), ("c1ccoc1", "C4H4O"), ("CC(=O)Oc1ccccc1C(=O)O", "C9H8O4")])
def test_FR_001_type4_formulas_match_smiles(page, smi, f):
    page.evaluate(RESET)
    assert page.evaluate("t=>tryLoadText(t, true)", type4(page, smi)) is True
    assert formula(page) == f


def test_FR_001_undo_removes_in_one_step(page):
    page.evaluate(RESET)
    page.evaluate("t=>tryLoadText(t, true)", type4(page, "c1ccccc1"))
    assert atoms(page) == 6
    page.evaluate("undo()")
    assert atoms(page) == 0


def test_FR_003_dialog_refuses_ring_that_cannot_alternate(page):
    via_dialog(page, type4(page, "c1cc[nH]c1"))
    assert atoms(page) == 0 and dialog_open(page)
    err = page.inner_text("#smErr")
    assert REFUSED in err and "hydrogen count" in err
    assert page.is_hidden("#smForce")


def test_FR_003_paste_and_file_show_the_reason(page, tmp_path):
    t = type4(page, "c1cc[nH]c1")
    paste(page, t)
    assert atoms(page) == 0 and not dialog_open(page) and REFUSED in page.inner_text("#toast")
    f = tmp_path / "pyrrole.mol"; f.write_text(t)
    open_file(page, f)
    assert atoms(page) == 0 and REFUSED in page.inner_text("#toast")


def test_CON_003_over_valent_type4_still_offers_insert_anyway(page):
    t = type4(page, 'C(C)(C)(C)(C)c1ccccc1')
    via_dialog(page, t)
    assert "C has 5 bonds; at most 4" in page.inner_text("#smErr") and page.is_visible("#smForce")
    page.click("#smForce")
    assert atoms(page) == 11 and doubles(page) == 3


def test_FR_005_kekule_molfile_unchanged(page):
    page.evaluate(RESET)
    page.evaluate("tryLoadText(OCL.Molecule.fromSmiles('c1cc[nH]c1').toMolfile(), true)")
    assert formula(page) == "C4H5N" and doubles(page) == 2
