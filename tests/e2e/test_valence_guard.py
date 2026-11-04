"""Spec 001 (valence guard): typed or pasted text with an atom over its valence is refused, with the reason and an
Insert anyway button; real hypervalent, charged and metal compounds go in without a prompt. Checks CK-03...CK-13 of
sdd/specs/001-valence-guard/validation.md, named after the requirement IDs."""
import json
import pytest
from conftest import _wait

RESET = "loadProject(newProject()); sel.clear(); changed();"
ACCEPT = {
    "SF6": "FS(F)(F)(F)(F)F", "PCl5": "ClP(Cl)(Cl)(Cl)Cl", "IF7": "FI(F)(F)(F)(F)(F)F", "PhI(OAc)2": "CC(=O)OI(OC(C)=O)c1ccccc1",
    "ClO4-": "[O-]Cl(=O)(=O)=O", "DMSO": "CS(C)=O", "NMe4+": "C[N+](C)(C)C", "cisplatin": "Cl[Pt](Cl)([NH3])[NH3]",
    "ferrocene": "[Fe+2].c1cc[cH-]c1.c1cc[cH-]c1",
    "wilkinson": "Cl[Rh]([P](c1ccccc1)(c1ccccc1)c1ccccc1)([P](c1ccccc1)(c1ccccc1)c1ccccc1)[P](c1ccccc1)(c1ccccc1)c1ccccc1",
    "grubbsII": "CC1=CC(C)=C(N2CCN(C2=[Ru](Cl)(Cl)(=Cc2ccccc2)P(C2CCCCC2)(C2CCCCC2)C2CCCCC2)c2c(C)cc(C)cc2C)C(C)=C1",
}
REFUSE = {"C(C)(C)(C)(C)C": "C has 5 bonds; at most 4", "N(C)(C)(C)C": "N has 4 bonds; at most 3",
          "O(C)(C)C": "O has 3 bonds; at most 2", "F(C)C": "F has 2 bonds; at most 1"}


def atoms(page): return page.evaluate("doc.atoms.length")
def dialog_open(page): return page.evaluate("modal.classList.contains('open')")


def insert_via_dialog(page, text):
    page.evaluate(RESET)
    page.click("#bSmiles")
    page.fill("#smIn", text)
    page.click("#smGo")


@pytest.mark.parametrize("text", list(REFUSE) + ["MOLFILE"])
def test_FR_001_002_dialog_refuses_five_bond_carbon(page, text):
    if text == "MOLFILE": text = page.evaluate("OCL.Molecule.fromSmiles('C(C)(C)(C)(C)C').toMolfile()")
    insert_via_dialog(page, text)
    assert atoms(page) == 0 and dialog_open(page)
    err = page.inner_text("#smErr")
    assert REFUSE.get(text, "C has 5 bonds; at most 4") in err and "Nothing was inserted" in err
    assert page.is_visible("#smForce")


def test_FR_002_counts_more_atoms(page):
    insert_via_dialog(page, "C(C)(C)(C)(C)CC(C)(C)(C)(C)C")
    err = page.inner_text("#smErr")
    assert err.startswith("C has 5 bonds; at most 4 (and 1 more atom)") and atoms(page) == 0


def test_FR_003_008_insert_anyway_then_undo(page):
    insert_via_dialog(page, "C(C)(C)(C)(C)C")
    page.click("#smForce")
    assert atoms(page) == 6 and not dialog_open(page)
    assert page.is_visible("#valWarn") and "C has 5 bonds" in page.inner_text("#valWarn")
    page.evaluate("undo()")
    assert atoms(page) == 0


def test_FR_003_editing_the_text_hides_insert_anyway(page):
    insert_via_dialog(page, "C(C)(C)(C)(C)C")
    page.fill("#smIn", "CCO")
    assert page.is_hidden("#smForce")
    page.click("#smGo")
    assert atoms(page) == 3 and not dialog_open(page)


def test_FR_007_reaction_refused_as_a_whole(page):
    insert_via_dialog(page, "CC>>C(C)(C)(C)(C)C")
    assert atoms(page) == 0 and page.evaluate("doc.arrows.length") == 0
    assert "Nothing was inserted" in page.inner_text("#smErr")
    page.click("#smForce")
    assert page.evaluate("doc.arrows.length") == 1 and atoms(page) == 8


@pytest.mark.parametrize("name", list(ACCEPT))
def test_FR_006_valid_inputs_insert_without_prompt(page, name):
    page.evaluate(RESET)
    assert page.evaluate(f"tryLoadText({json.dumps(ACCEPT[name])}, true)") is True
    assert atoms(page) > 0 and page.is_hidden("#valWarn") and not dialog_open(page)


def test_FR_010_pubchem_result_checked(page):
    page.evaluate(RESET + " pubchemNameToSmiles = async () => 'C(C)(C)(C)(C)C';")
    page.click("#bSmiles")
    page.fill("#smIn", "pentavalent carbon")
    page.click("#smGo")
    _wait(page, "document.getElementById('smErr').textContent.includes('Nothing was inserted')")
    assert "C has 5 bonds" in page.inner_text("#smErr") and page.is_visible("#smForce") and atoms(page) == 0
    page.click("#smForce")  # inserts PubChem's structure, not the typed name
    assert atoms(page) == 6 and not dialog_open(page)


def test_FR_010_templates_and_examples_still_insert(page):
    bad = page.evaluate("""(()=>{ const out=[];
      const all=[...TEMPLATES.filter(t=>typeof t[1]==='string').map(t=>t[1]), ...NMRG.EXAMPLES.map(e=>e.smiles)];
      for (const s of all){ loadProject(newProject()); if (!tryLoadText(s, true) || loadErrorKind) out.push(s); }
      return out; })()""")
    assert bad == []


def test_invented_radical_still_refused_without_insert_anyway(page):
    insert_via_dialog(page, "c1cccc1")
    assert "[nH]" in page.inner_text("#smErr") and page.is_hidden("#smForce") and atoms(page) == 0
