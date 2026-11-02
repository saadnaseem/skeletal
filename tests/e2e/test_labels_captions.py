"""Text tool on atoms and bonds: atom labels edited in place (with sub/superscripts), captions attached to bonds, and the Text panel's x₂ x² on labels."""
import math
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


def ethanol(page):
    page.evaluate("tryLoadText('CCO'); sel.clear(); fit()")
    page.click(TEXT)


def click_doc(page, x, y):
    sx, sy = screen(page, x, y)
    page.mouse.click(sx, sy)


def bond_point(page, i, f):
    """A point f of the way along bond i."""
    return page.evaluate(f"(()=>{{ const b=doc.bonds[{i}], A=ix.atom.get(b.a), B=ix.atom.get(b.b); return [A.x+(B.x-A.x)*{f}, A.y+(B.y-A.y)*{f}]; }})()")


def test_text_tool_on_an_atom_edits_its_label_in_place_with_a_superscript(page):
    ethanol(page)
    o = page.evaluate("(()=>{ const a=doc.atoms.find(a=>a.el==='O'); return [a.x,a.y]; })()")
    click_doc(page, *o)
    focused(page)
    assert page.evaluate("getSelection().toString()") == "O", "the label is selected, ready to type over"
    assert page.evaluate("doc.texts.length") == 0, "no loose text on top of the atom"
    page.keyboard.type("R")
    page.keyboard.press("Control+Shift+Equal")
    page.keyboard.type("1")
    page.keyboard.press("Enter")
    assert page.evaluate("doc.atoms.map(a=>a.el)") == ["C", "C", "R^{1}"]
    one = page.evaluate("(()=>{ const a=doc.atoms[2], it=layoutLabel(doc,ix,a).items; return [it.find(i=>i.t==='R').y, it.find(i=>i.t==='1').y]; })()")
    assert one[1] < one[0], "the 1 is raised"
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms[2].el") == "O"


def test_typing_a_substituent_name_gives_its_nickname(page):
    ethanol(page)
    click_doc(page, *page.evaluate("[doc.atoms[2].x, doc.atoms[2].y]"))
    focused(page)
    page.keyboard.type("phenyl")
    page.keyboard.press("Enter")
    assert page.evaluate("doc.atoms[2].el") == "Ph"


def test_clicking_near_a_bond_end_labels_that_atom(page):
    ethanol(page)
    end = page.evaluate("doc.bonds[1].b")  # the O end of C-O
    click_doc(page, *bond_point(page, 1, 0.9))
    focused(page)
    page.keyboard.type("OMe")
    page.keyboard.press("Enter")
    assert page.evaluate(f"ix.atom.get({end}).el") == "OMe"
    assert page.evaluate("doc.texts.length") == 0


def test_clicking_the_middle_of_a_bond_adds_a_caption_that_stays_with_it(page):
    ethanol(page)
    click_doc(page, *bond_point(page, 0, 0.5))
    focused(page)
    page.keyboard.type("hν")
    page.keyboard.press("Enter")
    t = page.evaluate("JSON.parse(JSON.stringify(doc.texts[0]))")
    assert t["text"] == "hν" and t["on"]["b"] == page.evaluate("doc.bonds[0].id")
    gap = lambda: page.evaluate("(()=>{ const t=doc.texts[0], b=ix.bond.get(t.on.b), A=ix.atom.get(b.a), B=ix.atom.get(b.b); return Math.hypot(t.x-(A.x+B.x)/2, t.y-(A.y+B.y)/2); })()")
    g0 = gap()
    assert 3 < g0 < 15, "beside the bond, not on it"
    # it is on the open side: away from the O
    side = page.evaluate("(()=>{ const t=doc.texts[0], o=doc.atoms[2], b=doc.bonds[0], A=ix.atom.get(b.a), B=ix.atom.get(b.b), m={x:(A.x+B.x)/2,y:(A.y+B.y)/2}; return Math.hypot(t.x-o.x,t.y-o.y) > Math.hypot(m.x-o.x,m.y-o.y); })()")
    assert side
    gapv = lambda: page.evaluate("[doc.texts[0].on.v, doc.texts[0].on.s]")
    v0 = gapv()
    # rotate only the atoms 90°: the caption turns with the bond and keeps its gap and side
    page.evaluate("pushUndo(); sel=new Set(doc.atoms.map(a=>'a'+a.id)); transformSel(p=>({x:-p.y, y:p.x})); sel.clear(); changed();")
    assert abs(gapv()[0] - v0[0]) < 1e-6 and gapv()[1] == v0[1]
    assert 3 < gap() < 25
    # drag the caption alone, then move the structure: the new spot is kept
    page.evaluate("doc.texts[0].x+=4; changed(); moveKeys(doc.atoms.map(a=>'a'+a.id), 30, 0); changed();")
    g1 = gap()
    page.evaluate("moveKeys(doc.atoms.map(a=>'a'+a.id), 0, 25); changed();")
    assert abs(gap() - g1) < 1e-6


def test_a_caption_is_copied_with_its_bond_and_deleted_with_it(page):
    ethanol(page)
    click_doc(page, *bond_point(page, 0, 0.5))
    focused(page)
    page.keyboard.type("a")
    page.keyboard.press("Enter")
    page.evaluate("sel=new Set(doc.atoms.map(a=>'a'+a.id)); render();")
    page.keyboard.press("Control+d")
    caps = page.evaluate("doc.texts.map(t=>t.on && doc.bonds.some(b=>b.id===t.on.b))")
    assert caps == [True, True], "the copy has its own caption on its own bond"
    assert page.evaluate("new Set(doc.texts.map(t=>t.on.b)).size") == 2
    page.evaluate("pushUndo(); doc.bonds=doc.bonds.filter(b=>b.id!==doc.texts[0].on.b); changed();")
    assert page.evaluate("doc.texts.length") == 1
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.texts.length") == 2
    # saved and opened again, it is still attached
    assert page.evaluate("normalizeDoc(JSON.parse(JSON.stringify(doc))).texts.every(t=>t.on && t.on.b)")


def test_panel_superscript_on_a_selected_label(page):
    page.evaluate("tryLoadText('CCO'); doc.atoms[2].el='R1'; changed(); setTool('select'); sel=new Set(['a'+doc.atoms[2].id]); render();")
    page.click("#tSup")
    assert page.evaluate("doc.atoms[2].el") == "R^{1}"
    page.click("#tSup")
    assert page.evaluate("doc.atoms[2].el") == "R1"
    # an element symbol has no number to raise: its label opens instead, and leaving it unchanged changes nothing
    page.evaluate("sel=new Set(['a'+doc.atoms[0].id]); render();")
    page.click("#tSup")
    focused(page)
    page.keyboard.press("Escape")
    assert page.evaluate("doc.atoms[0].el") == "C"


def two_labels(page):
    """CC(C)OC with R1 and R2 on the two ends, drawn large, with the select tool on."""
    page.evaluate("tryLoadText('CC(C)OC'); doc.atoms[0].el='R1'; doc.atoms[4].el='R2'; changed(); sel.clear(); setTool('select'); fit()")


def click_atom(page, i):
    sx, sy = screen(page, *page.evaluate(f"[doc.atoms[{i}].x, doc.atoms[{i}].y]"))
    page.mouse.click(sx, sy)
    page.wait_for_timeout(500)  # not a double-click


def selected(page):
    return page.evaluate("[...sel].sort()")


def test_a_second_click_on_an_atom_selects_just_it_and_x2_raises_its_number(page):
    two_labels(page)
    click_atom(page, 0)
    assert len(selected(page)) == 5, "the first click picks the whole structure"
    click_atom(page, 0)
    assert selected(page) == [page.evaluate("'a'+doc.atoms[0].id")], "the second picks just the atom"
    assert "R1" in page.text_content("#textScope")
    page.click("#tSup")
    assert page.evaluate("doc.atoms.map(a=>a.el)") == ["R^{1}", "C", "C", "O", "R2"], "only the clicked label changes"
    assert page.get_attribute("#tSup", "aria-pressed") == "true"
    page.click("#tSub")
    assert page.evaluate("doc.atoms[0].el") == "R1", "a subscript 1 after a letter is written plainly (drawn R₁)"
    page.click("#tSub")
    assert page.evaluate("doc.atoms[0].el") == "R\\1"
    # the whole structure selected: both labels switch together
    page.evaluate("sel=new Set(doc.atoms.map(a=>'a'+a.id)); changed();")
    page.click("#tSup")
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[4].el]") == ["R^{1}", "R^{2}"]


@pytest.mark.parametrize("keys,want", [
    ("Control+Shift+Equal", "R^{1}"), ("Meta+Shift+Equal", "R^{1}"), ("Meta+Period", "R^{1}"),
    ("Control+Equal", "R\\1"), ("Meta+Comma", "R\\1"),
])
def test_keys_work_on_a_selected_atom_without_opening_it(page, keys, want):
    two_labels(page)
    click_atom(page, 0)
    click_atom(page, 0)
    page.keyboard.press(keys)
    assert page.evaluate("doc.atoms[0].el") == want
    assert page.evaluate("doc.atoms[4].el") == "R2"
    assert page.is_hidden("#texted")


def test_x2_on_an_atom_with_no_number_opens_it_ready_to_type_a_superscript(page):
    two_labels(page)
    click_atom(page, 3)  # O
    click_atom(page, 3)
    page.click("#tSup")
    focused(page)
    assert page.get_attribute('#tedBar [data-m="sup"]', "aria-pressed") == "true"
    page.keyboard.type("1")
    page.keyboard.press("Enter")
    assert page.evaluate("doc.atoms[3].el") == "O^{1}"
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms[3].el") == "O"


def test_double_click_a_label_and_use_the_bar(page):
    page.evaluate("tryLoadText('CCO'); doc.atoms[2].el='X'; changed(); sel.clear(); setTool('select'); fit()")
    sx, sy = screen(page, *page.evaluate("[doc.atoms[2].x, doc.atoms[2].y]"))
    page.mouse.dblclick(sx, sy)
    focused(page)
    page.keyboard.press("End")
    page.click('#tedBar [data-m="sub"]')
    page.keyboard.type("a")
    page.keyboard.press("Enter")
    assert page.evaluate("doc.atoms[2].el") == "X_{a}"
    cdxml = page.evaluate("FORMATS.write('cdxml', doc)")
    assert 'GenericNickname="Xa"' in cdxml and 'face="32"' in cdxml
