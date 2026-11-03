"""Hydrogens as a user shows them: typing CH3, CH2, CH on a carbon, the element dialog, Show H and H bonds from the right-click menu,
the whole-drawing setting, undo, and what a later edit to the atom does to a typed label."""
import re
import pytest

TEXT = '#tools button[title^="Text"]'


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def atom_xy(page, i):
    return screen(page, *page.evaluate(f"[doc.atoms[{i}].x, doc.atoms[{i}].y]"))


def focused(page):
    page.wait_for_selector("#texted:not([hidden])")
    for _ in range(50):
        if page.evaluate("document.activeElement.id") == "texted": return
        page.wait_for_timeout(20)
    raise AssertionError("the text editor did not take the focus")


def draw(page, smiles):
    page.evaluate(f"tryLoadText({smiles!r}); sel.clear(); setTool('select'); fit(); changed();")


def shown(page):
    """Each atom's label as read left to right, written element first: a label that reads leftward (H3C, HO) counts as CH3, OH."""
    labs = page.evaluate("doc.atoms.map(a=>{ const l=layoutLabel(doc,ix,a); return l.visible? l.items.map(i=>i.t).join('') : ''; })")
    return [re.sub(r"^H(\d*)([A-Z][a-z]?)$", r"\2H\1", t) for t in labs]


def label(page, i, text):
    page.click(TEXT)
    page.mouse.click(*atom_xy(page, i))
    focused(page)
    if text == "Backspace": page.keyboard.press("Backspace")
    else: page.keyboard.type(text)
    page.keyboard.press("Enter")
    page.wait_for_timeout(450)


def bad(page):
    return page.evaluate("doc.atoms.map(a=>!!valenceError(a,ix))")


def test_typing_ch3_ch2_ch_on_carbons_shows_them(page):
    draw(page, "CCC=O")  # propanal
    assert shown(page) == ["", "", "", "O"]
    label(page, 0, "CH3"); label(page, 1, "CH2"); label(page, 2, "CH")
    assert shown(page) == ["CH3", "CH2", "CH", "O"]
    assert bad(page) == [False] * 4
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H6O"
    label(page, 1, "C")  # a bare C is drawn as C, its H implied
    assert shown(page)[1] == "C"
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H6O"
    page.keyboard.press("Control+z")
    assert shown(page)[1] == "CH2"
    label(page, 1, "Backspace")  # an emptied label is a plain vertex again
    assert shown(page)[1] == ""


def test_a_wrong_count_is_kept_as_typed_and_flagged(page):
    draw(page, "CCC")
    label(page, 1, "CH3")
    assert shown(page)[1] == "CH3"
    assert bad(page) == [False, True, False]
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H8", "the formula follows the bonds"
    label(page, 1, "CH2")
    assert bad(page) == [False, False, False]


def grow(page, i):
    page.evaluate(f"pushUndo(); const a=doc.atoms[{i}], c=addAtom(a.x+L*0.7, a.y+L*0.7, 'C'); addBond(a.id, c.id, 1); changed();")


def test_a_shown_ch3_follows_its_bonds_but_a_typed_wrong_one_does_not(page):
    draw(page, "CC")
    label(page, 1, "CH3")
    grow(page, 1)
    assert shown(page)[1] == "CH2", "a correct label updates when the chain grows"
    draw(page, "CCC")
    label(page, 4, "CH3")  # the middle carbon of the new propane: mistyped
    grow(page, 4)
    assert shown(page)[4] == "CH3" and bad(page)[4], "a mistyped one stays as typed, still flagged"


def test_reopening_a_label_and_pressing_enter_keeps_it(page):
    draw(page, "CCC")
    label(page, 0, "CH3"); label(page, 1, "CH3")  # the second is mistyped
    undo = page.evaluate("undoStack.length")
    for i in (0, 1):
        page.mouse.dblclick(*atom_xy(page, i)); focused(page)
        assert page.evaluate("ted.textContent") == "CH3", "it opens as it is shown"
        page.keyboard.press("Enter"); page.wait_for_timeout(450)
    assert shown(page) == ["CH3", "CH3", ""] and bad(page) == [False, True, False]
    assert page.evaluate("undoStack.length") == undo, "no undo step for an unchanged label"
    page.evaluate("doc.showCH='end'; changed();")
    page.mouse.dblclick(*atom_xy(page, 2)); focused(page)
    assert page.evaluate("ted.textContent") == "CH3"
    page.keyboard.press("Enter"); page.wait_for_timeout(450)
    assert page.evaluate("!!doc.atoms[2].hs") is False, "shown by the drawing setting: unchanged, not turned into a per-atom label"


def test_a_ch3_placed_on_empty_canvas_then_bonded_is_never_flagged(page):
    page.evaluate("setTool('select');")
    page.evaluate("openElementDialog()")
    page.fill("#elIn", "CH3"); page.keyboard.press("Enter")
    page.mouse.click(600, 400); page.wait_for_timeout(450)
    assert page.evaluate("[doc.atoms[0].el, !!doc.atoms[0].hs, doc.atoms[0].hl||null]") == ["C", True, None]
    assert not any(bad(page)) and shown(page) == ["CH4"]
    grow(page, 0)
    assert shown(page)[0] == "CH3" and not any(bad(page))
    page.evaluate("openElementDialog()")
    assert page.input_value("#elIn") == "CH3", "the dialog remembers what was typed"
    page.keyboard.press("Escape")


def test_a_typed_count_that_becomes_right_follows_the_bonds_after(page):
    draw(page, "CC")
    label(page, 0, "CH2")  # wrong for an end carbon
    assert bad(page)[0]
    grow(page, 0)  # now right
    assert not any(bad(page)) and page.evaluate("doc.atoms[0].hl||null") is None
    grow(page, 0)
    assert shown(page)[0] == "CH" and not any(bad(page)), "it follows the bonds from then on"


def test_typed_hydrogens_on_a_metal_are_not_kept(page):
    draw(page, "C[Na]")
    label(page, 1, "NaH")
    assert page.evaluate("[doc.atoms[1].el, doc.atoms[1].hl||null]") == ["Na", None]


def test_changing_the_element_by_tool_drops_a_typed_label(page):
    draw(page, "CCC")
    label(page, 1, "CH3")
    page.evaluate("pushUndo(); doc.atoms[1].el='Si'; changed();")  # any other way an atom changes
    assert bad(page) == [False, False, False] and page.evaluate("typedH(doc.atoms[1])") is None


def test_changing_the_atom_drops_a_typed_label(page):
    draw(page, "CCC")
    label(page, 1, "CH3")
    page.mouse.move(*atom_xy(page, 1)); page.keyboard.press("o")
    assert page.evaluate("[doc.atoms[1].el, doc.atoms[1].hl||null, !!doc.atoms[1].hs]") == ["O", None, False]
    assert bad(page) == [False, False, False]


def test_element_dialog_ch3_then_click_atoms(page):
    draw(page, "CCCC")
    page.evaluate("openElementDialog()")
    page.fill("#elIn", "CH3"); page.keyboard.press("Enter")
    for i in (0, 3):
        page.mouse.click(*atom_xy(page, i)); page.wait_for_timeout(450)
    assert shown(page) == ["CH3", "", "", "CH3"]
    page.evaluate("setTool('atom',{el:'N'})")
    page.mouse.click(*atom_xy(page, 0)); page.wait_for_timeout(450)
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[0].hl||null]") == ["N", None], "a palette element is plain, not CH3"


def right_click(page, i, cmd):
    page.mouse.click(*atom_xy(page, i), button="right")
    page.click(f'#ctxMenu [data-cmd="{cmd}"]')


def test_show_h_from_the_menu_on_one_atom_and_on_a_whole_structure(page):
    draw(page, "CC(O)C=O")
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)  # just this atom
    right_click(page, 1, "showh")
    assert shown(page) == ["", "CH", "OH", "", "O"]
    right_click(page, 1, "showh")  # again: off
    assert shown(page) == ["", "", "OH", "", "O"]
    page.keyboard.press("Escape")
    right_click(page, 0, "showh")  # the right-click picks the whole structure
    assert shown(page) == ["CH3", "CH", "OH", "CH", "O"]
    page.keyboard.press("Control+z")
    assert shown(page) == ["", "", "OH", "", "O"]


def test_draw_h_as_bonds_then_wedge_and_remove(page):
    draw(page, "CC(O)C=O")
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)
    right_click(page, 1, "addh")
    hs = page.evaluate("doc.atoms.filter(a=>a.el==='H').map(a=>a.id)")
    assert len(hs) == 1
    c, h = page.evaluate("[doc.atoms[1], doc.atoms.find(a=>a.el==='H')].map(a=>[a.x,a.y])")
    assert abs(((c[0]-h[0])**2 + (c[1]-h[1])**2) ** 0.5 - page.evaluate("L")) < 0.01, "a normal bond length"
    others = page.evaluate("doc.bonds.filter(b=>b.a===doc.atoms[1].id||b.b===doc.atoms[1].id).map(b=>{ const o=ix.atom.get(b.a===doc.atoms[1].id?b.b:b.a); return o.el; })")
    assert sorted(others) == ["C", "C", "H", "O"]
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H6O2", "the same molecule"
    # the new bond takes a wedge like any other
    page.evaluate("const b=doc.bonds.find(b=>ix.atom.get(b.b).el==='H'); pushUndo(); b.stereo='wedge'; changed();")
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).smiles").count("[C@") == 1, "it now sets the stereocentre"
    right_click(page, 1, "remh")
    assert page.evaluate("doc.atoms.filter(a=>a.el==='H').length") == 0
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H6O2"


def closest(page):
    """The closest two atoms, in bond lengths."""
    return page.evaluate("(()=>{ let m=1e9; for (const a of doc.atoms) for (const b of doc.atoms) if (a!==b) m=Math.min(m, Math.hypot(a.x-b.x,a.y-b.y)); return m/L; })()")


@pytest.mark.parametrize("smiles", ["C1CCCCC1", "CC(C)(C)C", "CCCC", "C1CC1", "c1ccccc1", "C1CC2CCC1C2", "CC(=O)N"])
def test_draw_h_as_bonds_never_puts_atoms_on_top_of_each_other(page, smiles):
    draw(page, smiles)
    right_click(page, 0, "addh")
    assert closest(page) > 0.45, f"{smiles}: atoms {closest(page):.2f} bond lengths apart"
    assert not any(bad(page))
    if smiles == "C1CCCCC1":  # each ring CH2 fans its two H out of the ring
        assert page.evaluate("(()=>{ const c={x:0,y:0}, ring=doc.atoms.filter(a=>a.el==='C'); ring.forEach(a=>{c.x+=a.x/6;c.y+=a.y/6;}); const r=Math.hypot(ring[0].x-c.x, ring[0].y-c.y); return doc.atoms.filter(a=>a.el==='H').every(h=>Math.hypot(h.x-c.x,h.y-c.y) > r); })()")


def test_draw_h_on_a_mistyped_atom_uses_the_bonds(page):
    draw(page, "CCC")
    label(page, 1, "CH3")
    page.evaluate("setTool('select'); sel.clear(); changed();")
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)
    page.mouse.click(*atom_xy(page, 1)); page.wait_for_timeout(500)
    right_click(page, 1, "addh")
    assert page.evaluate("doc.atoms.filter(a=>a.el==='H').length") == 2
    assert not any(bad(page))


def test_remove_h_bonds_leaves_h_that_would_not_come_back(page):
    page.evaluate("tryLoadText('[H][Fe][H].[H][H].C([H])([H])([H])[H]'); sel.clear(); setTool('select'); fit(); changed();")
    page.evaluate("sel.clear(); removeHBonds();")
    left = page.evaluate("doc.atoms.filter(a=>a.el==='H').map(a=>ix.atom.get(ix.adj.get(a.id)[0].o).el).sort()")
    assert left == ["Fe", "Fe", "H", "H"], "H on a metal and H2 stay; the methane H go"
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "CH8Fe", "methane's 4 H are implicit again; FeH2 and H2 unchanged"


def test_pasting_into_another_drawing_keeps_the_carbon_labels(page):
    draw(page, "CCO")
    page.select_option("#showCH", "end")
    page.evaluate("clip=subDoc(new Set(doc.atoms.map(a=>'a'+a.id))); doc.atoms=[]; doc.bonds=[]; delete doc.showCH; changed(); pasteDoc(clip, 0);")
    assert shown(page) == ["CH3", "", "OH"]


def test_draw_h_on_a_whole_structure_fills_every_atom(page):
    draw(page, "CCO")
    right_click(page, 0, "addh")
    assert page.evaluate("doc.atoms.filter(a=>a.el==='H').length") == 6
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C2H6O"
    assert not any(bad(page))


@pytest.mark.parametrize("mode,want", [("", ["", "", "OH"]), ("end", ["CH3", "", "OH"]), ("all", ["CH3", "CH2", "OH"])])
def test_whole_drawing_setting(page, mode, want):
    draw(page, "CCO")
    page.select_option("#showCH", mode)
    assert shown(page) == want
    assert page.evaluate("sanitizeDoc(JSON.parse(JSON.stringify(doc))).showCH || ''") == mode
    if mode:
        page.keyboard.press("Control+z")
        assert shown(page) == ["", "", "OH"]
        assert page.input_value("#showCH") == ""


def angle(page, center, a, b):
    return page.evaluate(f"(()=>{{ const c=doc.atoms[{center}], p=ix.atom.get({a}), q=ix.atom.get({b}); const u=Math.atan2(p.y-c.y,p.x-c.x), v=Math.atan2(q.y-c.y,q.x-c.x); let d=Math.abs(u-v)*180/Math.PI; return d>180? 360-d : d; }})()")


def test_h_bonds_on_one_bond_atoms_are_drawn_at_120_degrees(page):
    draw(page, "CO")  # methanol: CH3 and OH
    right_click(page, 0, "addh")
    c, o = page.evaluate("[doc.atoms[0].id, doc.atoms[1].id]")
    oh = page.evaluate(f"doc.atoms.find(a=>a.el==='H' && ix.adj.get(a.id)[0].o==={o}).id")
    assert abs(angle(page, 1, c, oh) - 120) < 1, "C–O–H zigzags"
    ch = page.evaluate(f"doc.atoms.filter(a=>a.el==='H' && ix.adj.get(a.id)[0].o==={c}).map(a=>a.id)")
    assert len(ch) == 3
    assert sorted(round(angle(page, 0, o, h)) for h in ch) == [120, 120, 180]


def test_h_bonds_on_a_chair_go_axial_and_equatorial(page):
    page.evaluate("insertFragments([{kind:'frag',f:chairFragment(false)}]); sel.clear(); setTool('select'); fit(); changed();")
    page.evaluate("sel=new Set(['a'+doc.atoms[0].id]); addHBonds();")
    dirs = page.evaluate("(()=>{ const a=doc.atoms[0], c=findChairs(doc,ix); const hs=doc.atoms.filter(h=>h.el==='H').map(h=>norm(sub(h,a))); return hs; })()")
    assert len(dirs) == 2
    vertical = [d for d in dirs if abs(d["x"]) < 0.05]
    assert len(vertical) == 1, "one axial H, straight up or down; the other equatorial"


def test_pasting_a_lone_carbon_does_not_make_it_a_label_for_good(page):
    page.evaluate("tryLoadText('C'); doc.showCH='all'; changed(); clip=subDoc(null); doc.atoms=[]; doc.bonds=[]; delete doc.showCH; changed(); pasteDoc(clip,0);")
    assert page.evaluate("!!doc.atoms[0].hs") is False


def test_the_dialog_takes_element_hydrogens_only_where_labels_do(page):
    page.evaluate("openElementDialog()")
    page.fill("#elIn", "NaH"); page.keyboard.press("Enter")
    assert page.evaluate("[tool.el, tool.lab||null]") == ["Na", None]


def test_hover_c_labels_a_carbon_then_shows_its_h_then_a_vertex(page):
    draw(page, "CCC")
    page.mouse.move(*atom_xy(page, 1)); page.wait_for_timeout(50)
    steps = []
    for _ in range(3):
        page.keyboard.press("c"); steps.append(shown(page)[1])
    assert steps == ["C", "CH2", ""]
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C3H8"
    page.keyboard.press("c"); page.keyboard.press("Control+z")
    assert shown(page)[1] == ""  # one undo step per press
    page.keyboard.press("n"); assert shown(page)[1] == "NH"
    page.keyboard.press("c"); assert shown(page)[1] == ""  # C on another atom makes it a carbon vertex, as before
    page.keyboard.press("Shift+C"); assert shown(page)[1] == "C"


def test_a_labeled_c_is_saved_and_beats_the_drawing_wide_h(page):
    draw(page, "CCC")
    page.mouse.move(*atom_xy(page, 1)); page.wait_for_timeout(50)
    page.keyboard.press("c")
    page.evaluate("doc.showCH='all'; changed();")
    assert shown(page) == ["CH3", "C", "CH3"]
    assert page.evaluate("sanitizeDoc(JSON.parse(JSON.stringify(doc))).atoms[1].lc") is True


def test_typing_c_over_a_vertex_labels_it(page):
    draw(page, "CCC")
    label(page, 1, "C")  # the editor opens showing C; typing C over it is still a label
    assert shown(page)[1] == "C"
    page.keyboard.press("Control+z")
    assert shown(page)[1] == ""
