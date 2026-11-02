"""Subscripts and superscripts end to end, as a user does them: selecting one atom by clicking, x₂ x² and their keys on
atoms and texts that are not open, the keys left to the browser when nothing is selected, undo, saving, exports and touch."""
import pytest

TEXT = '#tools button[title^="Text"]'


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def atom_xy(page, i):
    return screen(page, *page.evaluate(f"[doc.atoms[{i}].x, doc.atoms[{i}].y]"))


def click_atom(page, i, **kw):
    page.mouse.click(*atom_xy(page, i), **kw)
    page.wait_for_timeout(500)  # not a double-click


def focused(page):
    page.wait_for_selector("#texted:not([hidden])")
    for _ in range(50):
        if page.evaluate("document.activeElement.id") == "texted": return
        page.wait_for_timeout(20)
    raise AssertionError("the text editor did not take the focus")


def els(page):
    return page.evaluate("doc.atoms.map(a=>a.el)")


def selected(page):
    return page.evaluate("[...sel].sort()")


def akey(page, i):
    return page.evaluate(f"'a'+doc.atoms[{i}].id")


def labels(page, smiles="CC(C)OC", at=None):
    """A structure drawn large with the select tool on and nothing selected; at maps atom index -> label."""
    at = at or {0: "R1", 4: "R2"}
    js = "".join(f"doc.atoms[{i}].el={l!r};" for i, l in at.items())
    page.evaluate(f"tryLoadText({smiles!r}); {js} changed(); sel.clear(); setTool('select'); fit(); changed();")


# ---------- selecting one atom ----------

def test_clicks_go_structure_then_atom_then_structure_again(page):
    labels(page)
    click_atom(page, 0)
    assert len(selected(page)) == 5
    click_atom(page, 0)
    assert selected(page) == [akey(page, 0)]
    click_atom(page, 0)
    assert len(selected(page)) == 5, "a third click goes back to the whole structure"
    click_atom(page, 4)
    assert selected(page) == [akey(page, 4)], "another atom of the selected structure is picked on its own too"


def test_shift_click_still_adds_and_removes_whole_structures(page):
    page.evaluate("tryLoadText('CCO.CCN'); sel.clear(); setTool('select'); fit(); render();")
    click_atom(page, 0)
    assert len(selected(page)) == 3
    page.keyboard.down("Shift"); click_atom(page, 4); page.keyboard.up("Shift")
    assert len(selected(page)) == 6
    page.keyboard.down("Shift"); click_atom(page, 0); page.keyboard.up("Shift")
    assert len(selected(page)) == 3, "shift-click on a selected structure removes it, it does not pick one atom"


def test_dragging_a_selected_structure_by_an_atom_still_moves_all_of_it(page):
    labels(page)
    click_atom(page, 0)
    before = page.evaluate("doc.atoms.map(a=>[a.x,a.y])")
    x, y = atom_xy(page, 0)
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 40, y + 20, steps=5); page.mouse.up()
    after = page.evaluate("doc.atoms.map(a=>[a.x,a.y])")
    moved = [abs(a[0] - b[0]) > 1 for a, b in zip(after, before)]
    assert all(moved), "every atom moved"
    assert len(selected(page)) == 5, "and the structure stays selected"


def test_double_click_still_opens_the_label(page):
    labels(page)
    page.mouse.dblclick(*atom_xy(page, 3))
    focused(page)
    assert page.evaluate("editingText.atom && editingText.atom.el") == "O"
    page.keyboard.press("Escape")


# ---------- x₂ x² and keys on atoms ----------

@pytest.mark.parametrize("how", ["button", "Control+Shift+Equal", "Meta+Shift+Equal", "Control+Period", "Meta+Period"])
def test_superscript_one_selected_label_every_way(page, how):
    labels(page)
    click_atom(page, 0); click_atom(page, 0)
    page.click("#tSup") if how == "button" else page.keyboard.press(how)
    assert els(page) == ["R^{1}", "C", "C", "O", "R2"]
    assert page.is_hidden("#texted")


@pytest.mark.parametrize("how", ["button", "Control+Equal", "Meta+Equal", "Control+Comma", "Meta+Comma"])
def test_subscript_one_selected_label_every_way(page, how):
    labels(page, at={0: "R^{1}", 4: "R2"})
    click_atom(page, 0); click_atom(page, 0)
    page.click("#tSub") if how == "button" else page.keyboard.press(how)
    assert els(page)[0] == "R1", "R₁: a subscript digit after a letter is written plainly"


def test_toggle_round_trip_and_undo_redo(page):
    labels(page)
    click_atom(page, 0); click_atom(page, 0)
    page.keyboard.press("Control+Shift+Equal")
    assert els(page)[0] == "R^{1}"
    page.keyboard.press("Control+Shift+Equal")
    assert els(page)[0] == "R1", "pressing it again turns the superscript off"
    page.keyboard.press("Control+z")
    assert els(page)[0] == "R^{1}"
    page.keyboard.press("Control+z")
    assert els(page)[0] == "R1"
    page.keyboard.press("Control+Shift+z")
    assert els(page)[0] == "R^{1}"


def test_primes_and_letters_with_numbers(page):
    labels(page, at={0: "R'", 4: "X12"})
    click_atom(page, 0); click_atom(page, 0)
    page.click("#tSup")
    assert els(page)[0] == "R^{'}"
    click_atom(page, 4)  # back to the whole structure
    click_atom(page, 4)
    page.click("#tSup")
    assert els(page)[4] == "X^{12}"


def test_panel_says_what_it_applies_to_and_shows_the_state(page):
    labels(page, at={0: "R^{1}", 4: "R2"})
    assert page.text_content("#textScope") == "Settings for new text"
    click_atom(page, 0)
    assert "2 selected labels" in page.text_content("#textScope")
    click_atom(page, 0)
    assert "label R1" in page.text_content("#textScope")
    assert page.get_attribute("#tSup", "aria-pressed") == "true"
    assert page.get_attribute("#tSub", "aria-pressed") == "false"
    click_atom(page, 3); click_atom(page, 3)
    assert "edit the label O" in page.text_content("#textScope")
    page.keyboard.press("Escape")
    assert page.text_content("#textScope") == "Settings for new text", "Esc clears the selection and the panel follows"


def test_whole_structure_with_no_labels_gives_a_hint_and_changes_nothing(page):
    page.evaluate("tryLoadText('CCO'); sel.clear(); setTool('select'); fit(); render();")
    click_atom(page, 0)
    page.click("#tSup")
    assert els(page) == ["C", "C", "O"]
    assert page.is_hidden("#texted")
    assert "again" in page.text_content("#toast")


@pytest.mark.parametrize("m,want", [("sup", "R^{1}"), ("sub", "R1")])
def test_a_label_with_no_number_opens_ready_to_type(page, m, want):
    labels(page, at={0: "R", 4: "R2"})
    click_atom(page, 0); click_atom(page, 0)
    page.click("#tSup" if m == "sup" else "#tSub")
    focused(page)
    assert page.get_attribute(f'#tedBar [data-m="{m}"]', "aria-pressed") == "true"
    page.keyboard.type("1")
    page.keyboard.press("Enter")
    assert els(page)[0] == want
    assert els(page)[4] == "R2"


def test_keys_on_an_element_open_it_and_escape_leaves_it(page):
    labels(page)
    click_atom(page, 3); click_atom(page, 3)
    page.keyboard.press("Control+Shift+Equal")
    focused(page)
    page.keyboard.press("Escape")
    assert els(page)[3] == "O"
    undo = page.evaluate("undoStack.length")
    page.keyboard.press("Control+Shift+Equal")  # selection is kept: opens again
    focused(page)
    page.keyboard.type("+")
    page.keyboard.press("Enter")
    # a superscript + on an element is its charge (O+), so it still counts in the formula
    assert els(page)[3] == "O" and page.evaluate("doc.atoms[3].charge") == 1
    assert page.evaluate("undoStack.length") == undo + 1


# ---------- texts that are not open ----------

def test_keys_on_selected_texts_and_a_mix_with_labels(page):
    labels(page)
    page.evaluate("doc.texts.push({id:nid(), x:0, y:60, text:'III'}); changed(); sel=new Set(['t'+doc.texts[0].id, 'a'+doc.atoms[0].id]); changed();")
    page.keyboard.press("Control+Shift+Equal")
    assert page.evaluate("doc.texts[0].text") == "^{III}"
    assert els(page)[0] == "R^{1}"
    assert page.is_hidden("#texted")


# ---------- the keys are left alone when nothing is selected ----------

def test_with_nothing_selected_the_keys_are_left_to_the_browser(page):
    labels(page)
    for key in ["=", ",", "."]:
        prevented = page.evaluate(f"""(()=>{{ const e=new KeyboardEvent('keydown',{{key:{key!r}, ctrlKey:true, metaKey:true, bubbles:true, cancelable:true}}); window.dispatchEvent(e); return e.defaultPrevented; }})()""")
        assert prevented is False, f"Ctrl/⌘ {key} with nothing selected is not taken from the browser (page zoom)"
    assert els(page) == ["R1", "C", "C", "O", "R2"]


def test_in_other_inputs_the_keys_do_nothing_to_the_drawing(page):
    labels(page)
    click_atom(page, 0); click_atom(page, 0)
    page.focus("#tSize")
    page.keyboard.press("Control+Shift+Equal")
    assert els(page)[0] == "R1"


# ---------- typing (each key and button while the editor is open) ----------

@pytest.mark.parametrize("on,off", [("Control+Shift+Equal", "Control+Shift+Equal"), ("Meta+Shift+Equal", "Meta+Shift+Equal"), ("Control+Period", "Control+Period"), ("Meta+Period", "Meta+Period")])
def test_typing_a_superscript_and_back(page, on, off):
    page.click(TEXT); page.mouse.click(700, 400); focused(page)
    page.keyboard.type("cm")
    page.keyboard.press(on); page.keyboard.type("-1"); page.keyboard.press(off)
    page.keyboard.type(" x")
    page.keyboard.press("Enter")
    assert page.evaluate("textRuns(doc.texts[0].text).map(r=>[r.t,r.m])") == [["cm", "n"], ["−1", "sup"], [" x", "n"]]


def test_select_characters_then_each_bar_and_panel_button(page):
    page.click(TEXT); page.mouse.click(700, 400); focused(page)
    page.keyboard.type("SN2")
    page.keyboard.press("Shift+ArrowLeft"); page.keyboard.press("Shift+ArrowLeft")  # "N2"
    page.click('#tedBar [data-m="sub"]')
    assert page.evaluate("document.activeElement.id") == "texted", "the caret stays in the text"
    page.keyboard.press("End")
    page.keyboard.press("Shift+ArrowLeft")
    page.click("#tSup")
    page.keyboard.press("Enter")
    assert page.evaluate("textRuns(doc.texts[0].text).map(r=>[r.t,r.m])") == [["S", "n"], ["N", "sub"], ["2", "sup"]]


# ---------- what is kept ----------

def test_saved_reopened_and_exported_labels_keep_their_superscript(page):
    labels(page)
    click_atom(page, 0); click_atom(page, 0)
    page.click("#tSup")
    assert page.evaluate("sanitizeDoc(JSON.parse(JSON.stringify(doc))).atoms[0].el") == "R^{1}"
    svg = page.evaluate("exportSVG(doc,{transparent:true}).svg")
    assert "^{" not in svg and "R" in svg
    cdxml = page.evaluate("FORMATS.write('cdxml', doc)")
    assert 'face="64"' in cdxml, "ChemDraw keeps it as a superscript"
    assert page.evaluate("(()=>{ const it=layoutLabel(doc,ix,doc.atoms[0]).items; return it.find(i=>i.t==='1').y < it.find(i=>i.t==='R').y; })()")


# ---------- touch ----------

def test_tap_twice_on_a_phone_selects_one_atom(mobile):
    page = mobile
    labels(page)
    x, y = atom_xy(page, 0)
    page.touchscreen.tap(x, y); page.wait_for_timeout(500)
    assert len(selected(page)) == 5
    page.touchscreen.tap(x, y); page.wait_for_timeout(500)
    assert selected(page) == [akey(page, 0)]
    page.evaluate("scriptSelection('sup')")
    assert els(page)[0] == "R^{1}"
