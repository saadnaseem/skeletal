"""Labels typed with their hydrogens and charges, written either way round (H3C, H2N, HO, NH3+, O-), nicknames written leftward,
deuterated groups and explicit H in SMILES: each is a real atom, so the formula and mass stay right. Where a label is not
recognised, the Analysis panel names it rather than leaving it out silently."""
import re
import pytest

TEXT = '#tools button[title^="Text"]'


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def focused(page):
    page.wait_for_selector("#texted:not([hidden])")
    for _ in range(50):
        if page.evaluate("document.activeElement.id") == "texted": return
        page.wait_for_timeout(20)
    raise AssertionError("the text editor did not take the focus")


def draw(page, smiles):
    page.evaluate("doc.atoms=[]; doc.bonds=[]; doc.texts=[]; changed();")
    page.evaluate(f"tryLoadText({smiles!r}); sel.clear(); setTool('select'); fit(); changed();")


def label(page, i, text):
    page.click(TEXT)
    page.mouse.click(*screen(page, *page.evaluate(f"[doc.atoms[{i}].x, doc.atoms[{i}].y]")))
    focused(page)
    page.keyboard.type(text)
    page.keyboard.press("Enter")
    page.wait_for_timeout(450)


def formula(page):
    return page.evaluate("toOCL(doc,ix).mol.getMolecularFormula().formula")


def mass(page):
    return page.evaluate("toOCL(doc,ix).mol.getMolecularFormula().relativeWeight")


def shown(page, i):
    return page.evaluate(f"(()=>{{ const l=layoutLabel(doc,ix,doc.atoms[{i}]); return l.visible? l.items.map(t=>t.t).join('') : ''; }})()")


@pytest.mark.parametrize("smiles,i,typed,el,charge,want_formula,looks", [
    ("CCO", 0, "H3C", "C", 0, "C2H6O", r"^(CH3|H3C)$"),
    ("CCO", 2, "HO", "O", 0, "C2H6O", r"^(OH|HO)$"),
    ("CCN", 2, "H2N", "N", 0, "C2H7N", r"^(NH2|H2N)$"),
    ("CCN", 2, "NH3+", "N", 1, "C2H8N+", r"^(NH3\+|H3N\+)$"),
    ("CC(=O)O", 3, "O-", "O", -1, "C2H3O2-", r"^O[−-]$"),
    ("CCO", 2, "OH-", "O", -1, None, None),  # O with one bond and a minus takes no H: kept as typed and flagged
    ("CC", 0, "CH2+", "C", 1, "C2H5+", r"^(CH2\+|H2C\+)$"),
    ("CC", 0, "CH2-", "C", -1, "C2H5-", None),
])
def test_typed_labels_with_hydrogens_and_charges_are_real_atoms(page, smiles, i, typed, el, charge, want_formula, looks):
    draw(page, smiles)
    label(page, i, typed)
    assert page.evaluate(f"[doc.atoms[{i}].el, doc.atoms[{i}].charge||0]") == [el, charge]
    assert page.evaluate("toOCL(doc,ix).generic") is False, "nothing is left out of the formula"
    if want_formula:
        assert formula(page) == want_formula.replace("+", "").replace("-", "") or formula(page) == want_formula
    if looks:
        assert re.match(looks, shown(page, i)), shown(page, i)


def test_oh_minus_on_a_bonded_oxygen_is_flagged_not_dropped(page):
    draw(page, "CCO")
    label(page, 2, "OH-")
    assert page.evaluate("[doc.atoms[2].el, doc.atoms[2].charge, doc.atoms[2].hl]") == ["O", -1, "OH"]
    assert page.evaluate("!!valenceError(doc.atoms[2],ix)"), "an O- with a bond has no H: the typed OH- is flagged"


def test_ho_is_hydroxyl_not_holmium_and_co_is_not_cobalt(page):
    draw(page, "CCO")
    label(page, 2, "HO")
    assert page.evaluate("doc.atoms[2].el") == "O"
    label(page, 0, "CO")
    assert page.evaluate("doc.atoms[0].el") == "CO", "kept as typed (a generic label), not Co"
    label(page, 0, "Co")
    assert page.evaluate("doc.atoms[0].el") == "Co", "typed in its own case it is cobalt"


@pytest.mark.parametrize("typed,nick,mw", [("MeO", "OMe", 46.07 + 14.03), ("F3C", "CF3", 114.04), ("Me2N", "NMe2", 73.14), ("D3C", "CD3", 49.09)])
def test_nicknames_written_leftward_are_the_nickname(page, typed, nick, mw):
    draw(page, "CCO" if typed != "D3C" else "CCO")
    i = 0
    label(page, i, typed)
    assert page.evaluate(f"doc.atoms[{i}].el") == nick
    assert page.evaluate("toOCL(doc,ix).generic") is False
    if typed == "D3C":
        assert abs(mass(page) - mw) < 0.05, mass(page)


def test_cd3_counts_its_deuterium(page):
    draw(page, "CCO")
    label(page, 0, "CD3")
    assert page.evaluate("doc.atoms[0].el") == "CD3"
    assert abs(mass(page) - 49.09) < 0.05, mass(page)


def test_element_dialog_takes_charged_and_leftward_labels(page):
    draw(page, "CCN")
    for typed, want in (("NH3+", ["N", 1]), ("H2N", ["N", 0])):
        page.evaluate("openElementDialog()")
        page.fill("#elIn", typed); page.keyboard.press("Enter")
        page.mouse.click(*screen(page, *page.evaluate("[doc.atoms[2].x, doc.atoms[2].y]")))
        page.wait_for_timeout(300)
        assert page.evaluate("[doc.atoms[2].el, doc.atoms[2].charge||0]") == want, typed


def test_smiles_with_explicit_hydrogens_draws_them(page):
    draw(page, "[H]C([H])([H])C([H])([H])O[H]")
    assert page.evaluate("doc.atoms.filter(a=>a.el==='H').length") == 6
    assert page.evaluate("doc.atoms.every(a=>!a.iso)"), "the drawn H carry no mass number"
    assert formula(page) == "C2H6O"
    # the hydrogens app action turns them back into implicit H
    page.evaluate("sel.clear(); removeHBonds();")
    assert page.evaluate("doc.atoms.length") == 3 and formula(page) == "C2H6O"


def test_analysis_names_a_label_it_leaves_out(page):
    draw(page, "CCO")
    page.evaluate("doc.atoms[0].el='Xyz'; changed();")
    page.click("#bAnalyze")
    page.wait_for_function("document.getElementById('props') && /left out/.test(document.getElementById('props').textContent)", timeout=5000)
    assert "Xyz" in page.text_content("#props")


def test_reopening_a_charged_label_shows_its_charge_and_enter_keeps_it(page):
    draw(page, "CC")
    label(page, 0, "CH2+")
    page.evaluate("startLabelEdit(doc.atoms[0])")
    focused(page)
    assert page.evaluate("tedMarkup()") == "CH2+"
    page.keyboard.press("End"); page.keyboard.press("Enter")
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[0].charge, !!doc.atoms[0].hl]") == ["C", 1, False]


def test_superscript_on_a_charged_atom_types_a_label_not_a_second_plus(page):
    draw(page, "CC[N+](C)(C)C")
    i = page.evaluate("doc.atoms.findIndex(a=>a.el==='N')")
    page.evaluate(f"sel=new Set(['a'+doc.atoms[{i}].id]); setTool('select'); changed();")
    page.click("#tSup")
    focused(page)
    page.keyboard.type("1"); page.keyboard.press("Enter")
    assert page.evaluate(f"[doc.atoms[{i}].el, doc.atoms[{i}].charge]") == ["N^{1}", 1]


def test_a_count_of_zero_is_kept(page):
    draw(page, "CCN")
    label(page, 2, "NH0")
    assert page.evaluate("[doc.atoms[2].el, doc.atoms[2].hl]") == ["N", "NH0"]
    assert shown(page, 2) == "N"


def test_a_shown_ch3_can_be_clicked_on_its_letters_and_resized(page):
    draw(page, "CCO")
    label(page, 0, "CH3")
    p = page.evaluate("(()=>{ const it=layoutLabel(doc,ix,doc.atoms[0]).items; const h=it[it.length-1]; return [h.x, h.y-h.size*0.3]; })()")
    assert page.evaluate(f"hitTest(V({p[0]},{p[1]}))") == {"type": "atom", "id": page.evaluate("doc.atoms[0].id")}
    page.evaluate("sel=new Set(['a'+doc.atoms[0].id]); setTool('select'); changed();")
    page.select_option("#tSize", "16")
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[0].size, layoutLabel(doc,ix,doc.atoms[0]).items[0].size]") == ["C", 16, 16]
