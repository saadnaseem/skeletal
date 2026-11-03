"""Showing hydrogens for teaching: the toolbar's Show H button, condensed formulas typed on an atom (CH2CH3), loose typing (ch3, CH₃),
a warning for a label that drops out of the chemistry, typing straight after a double-click, the H hotkey hint, and carbenes."""
from test_hydrogens import draw, shown, label, atom_xy


def formula(page):
    return page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula")


def test_show_h_button_cycles_off_end_all_and_undoes(page):
    draw(page, "CCC")
    btn = page.locator("#bShowH")
    assert btn.get_attribute("aria-pressed") == "false" and btn.inner_text() == "Show H"
    btn.click(); assert shown(page) == ["CH3", "", "CH3"] and btn.inner_text() == "H: ends"
    assert page.evaluate("document.querySelector('#showCH').value") == "end", "the Style panel follows"
    btn.click(); assert shown(page) == ["CH3", "CH2", "CH3"] and btn.inner_text() == "H: all"
    btn.click(); assert shown(page) == ["", "", ""] and btn.get_attribute("aria-pressed") == "false"
    page.keyboard.press("Control+z"); assert shown(page) == ["CH3", "CH2", "CH3"] and btn.inner_text() == "H: all"
    assert formula(page) == "C3H8", "showing H never changes the chemistry"


def test_condensed_formula_on_an_atom_counts_and_reads_from_either_side(page):
    draw(page, "CCC")
    label(page, 0, "CH2CH3")
    assert page.evaluate("kindOf(doc.atoms[0].el)") == "abbr"
    assert formula(page) == "C4H10"
    label(page, 2, "CH2OH")
    assert formula(page) == "C4H10O"
    assert not page.evaluate("doc.atoms.some(a=>valenceError(a,ix))")


def test_loose_typing_reads_as_meant(page):
    draw(page, "CCC")
    label(page, 0, "ch3")
    assert page.evaluate("[doc.atoms[0].el, !!doc.atoms[0].hs]") == ["C", True]
    label(page, 2, "CH₃")
    assert shown(page)[2] == "CH3" and formula(page) == "C3H8"


def test_a_formula_like_label_that_reads_as_nothing_is_flagged(page):
    draw(page, "CCC")
    label(page, 0, "C2H5")
    assert "left out of the formula" in page.inner_text("#toast")
    assert formula(page) == "C2H6", "the generic label is left out, as the warning says"
    page.evaluate("toast('')")
    label(page, 0, "R")  # a real generic label: no warning
    assert "left out" not in page.inner_text("#toast")


def test_typing_straight_after_a_double_click_replaces_the_label(page):
    for _ in range(5):
        page.evaluate("doc.atoms=[]; doc.bonds=[]; changed()")
        draw(page, "CCCC")
        page.mouse.dblclick(*atom_xy(page, 1))
        page.keyboard.type("CH2"); page.keyboard.press("Enter")
        assert page.evaluate("[doc.atoms[1].el, !!doc.atoms[1].hs]") == ["C", True]


def test_h_on_a_hovered_carbon_says_how_to_show_hydrogens(page):
    draw(page, "CCC")
    page.mouse.move(*atom_xy(page, 2)); page.wait_for_timeout(100)
    page.keyboard.press("h")
    assert page.evaluate("doc.atoms[2].el") == "H"
    assert "Show H in the toolbar" in page.inner_text("#toast")


def test_carbene_dots_and_count(page):
    draw(page, "CC")
    page.mouse.move(*atom_xy(page, 1)); page.wait_for_timeout(100)
    page.keyboard.press("."); assert page.evaluate("doc.atoms[1].rad") == 1 and formula(page) == "C2H5"
    page.keyboard.press("."); assert page.evaluate("doc.atoms[1].rad") == 2 and formula(page) == "C2H4"
    page.evaluate("doc.showCH='all'; changed()")
    assert shown(page)[1] == "CH"
    assert page.evaluate("document.querySelectorAll('#cv circle').length") >= 2, "two dots drawn"
    page.keyboard.press("."); assert page.evaluate("doc.atoms[1].rad") == 0 and formula(page) == "C2H6"
