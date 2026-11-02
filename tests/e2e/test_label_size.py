"""The Text panel's size and color on atom labels: a selected label (NH2) takes its own size, kept through undo, saving,
copy and paste and ChemDraw files; the controls that labels do not have are greyed out rather than silently changing new text."""


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def amine(page):
    """Cyclohexylamine, with the select tool and nothing selected; returns the index of the N."""
    page.evaluate("tryLoadText('NC1CCCCC1'); sel.clear(); setTool('select'); fit(); changed();")
    return page.evaluate("doc.atoms.findIndex(a=>a.el==='N')")


def click_atom(page, i):
    page.mouse.click(*screen(page, *page.evaluate(f"[doc.atoms[{i}].x, doc.atoms[{i}].y]")))
    page.wait_for_timeout(450)  # not a double-click


def label_size(page, i):
    return page.evaluate(f"(()=>{{ const a=doc.atoms[{i}], it=layoutLabel(doc,ix,a).items; return it.length ? it[0].size : null; }})()")


def test_size_box_changes_a_selected_label(page):
    n = amine(page)
    click_atom(page, n)  # the first click selects the structure, the second just the atom
    click_atom(page, n)
    assert page.evaluate("[...sel]") == [f"a{page.evaluate(f'doc.atoms[{n}].id')}"]
    assert "NH2" in page.text_content("#textScope")
    before = label_size(page, n)
    page.select_option("#tSize", "14")
    assert page.evaluate(f"doc.atoms[{n}].size") == 14
    assert label_size(page, n) == 14 and before != 14
    assert page.input_value("#tSize") == "14", "the box shows the label's size"
    assert page.evaluate("Object.keys(tool.textStyle).length") == 0, "new-text settings are untouched"
    # the subscript 2 grows with it
    assert page.evaluate(f"layoutLabel(doc,ix,doc.atoms[{n}]).items.find(i=>i.t==='2').size") < 14
    page.keyboard.press("Control+z")
    assert page.evaluate(f"doc.atoms[{n}].size") is None
    page.keyboard.press("Control+Shift+z")
    assert page.evaluate(f"doc.atoms[{n}].size") == 14
    # Auto goes back to the drawing's label size
    page.evaluate(f"sel=new Set(['a'+doc.atoms[{n}].id]); changed();")
    page.select_option("#tSize", "")
    assert page.evaluate(f"doc.atoms[{n}].size") is None and label_size(page, n) == page.evaluate("S().fontSize")


def test_a_bigger_label_pushes_its_bond_back(page):
    n = amine(page)
    gap = lambda: page.evaluate(f"(()=>{{ const b=layoutLabel(doc,ix,doc.atoms[{n}]).box; return b.x1-b.x0; }})()")
    g0 = gap()
    page.evaluate(f"sel=new Set(['a'+doc.atoms[{n}].id]); changed();")
    page.select_option("#tSize", "24")
    assert gap() > g0 * 1.8
    svg = page.evaluate("exportSVG(doc).svg")
    assert 'font-size="24"' in svg


def test_label_controls_it_does_not_have_are_greyed_out(page):
    n = amine(page)
    page.evaluate(f"sel=new Set(['a'+doc.atoms[{n}].id]); changed();")
    for s in ["#tFont", "#tBold", "#tItal", '[data-al="left"]']:
        assert page.is_disabled(s), s
    assert page.is_enabled("#tSize") and page.is_enabled("#tSub")
    # a text selected: everything works again
    page.evaluate("doc.texts.push({id:nid(), x:0, y:-60, text:'pH 7'}); sel=new Set(['t'+doc.texts[0].id]); changed();")
    for s in ["#tFont", "#tBold", "#tItal", '[data-al="left"]']:
        assert page.is_enabled(s), s
    assert page.get_attribute("#tBold", "title") == "Bold"
    # nothing selected: the panel sets up new text, as before
    page.evaluate("sel.clear(); changed();")
    assert page.is_enabled("#tBold") and page.text_content("#textScope") == "Settings for new text"
    page.select_option("#tSize", "12")
    assert page.evaluate("tool.textStyle.size") == 12 and page.evaluate(f"doc.atoms[{n}].size") is None


def test_color_swatch_colors_a_selected_label(page):
    n = amine(page)
    page.evaluate(f"sel=new Set(['a'+doc.atoms[{n}].id]); changed();")
    page.click('#tSwatches [data-c="#2a52d6"], #tSwatches .sw:nth-child(2)')
    c = page.evaluate(f"doc.atoms[{n}].color")
    assert c and c != "#000000"
    assert c in page.evaluate("exportSVG(doc).svg")


def test_whole_structure_and_mixed_selection(page):
    page.evaluate("tryLoadText('OC(=O)CN'); setTool('select'); doc.texts.push({id:nid(), x:0, y:-60, text:'glycine'}); sel=new Set([...doc.atoms.map(a=>'a'+a.id), 't'+doc.texts[0].id]); changed();")
    assert "3 labels (OH, O, H2N)" in page.text_content("#textScope")
    page.select_option("#tSize", "16")
    assert page.evaluate("doc.atoms.filter(a=>a.el!=='C').every(a=>a.size===16)") and page.evaluate("doc.texts[0].size") == 16
    assert page.evaluate("doc.atoms.filter(a=>a.el==='C').every(a=>a.size==null)"), "hidden carbons get no size"
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms.every(a=>a.size==null)") and page.evaluate("doc.texts[0].size") is None, "one undo step for all"


def test_size_while_typing_a_label(page):
    n = amine(page)
    sx, sy = screen(page, *page.evaluate(f"[doc.atoms[{n}].x, doc.atoms[{n}].y]"))
    page.mouse.dblclick(sx, sy)
    page.wait_for_selector("#texted:not([hidden])")
    f0 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('texted')).fontSize)")
    page.select_option("#tSize", "20")
    f1 = page.evaluate("parseFloat(getComputedStyle(document.getElementById('texted')).fontSize)")
    assert f1 > f0 * 1.5, (f0, f1)
    page.click("#texted")
    page.keyboard.press("End")
    page.keyboard.type("Me")  # the label being typed is N (its H is implicit)
    page.keyboard.press("Enter")
    assert page.evaluate(f"[doc.atoms[{n}].el, doc.atoms[{n}].size]") == ["NMe", 20]


def test_label_size_is_kept_when_saved_copied_and_through_chemdraw(page):
    n = amine(page)
    page.evaluate(f"doc.atoms[{n}].size=14; changed();")
    assert page.evaluate(f"normalizeDoc(JSON.parse(JSON.stringify(doc))).atoms[{n}].size") == 14
    for f in ("cdxml", "cdx"):
        assert page.evaluate(f"FORMATS.read('{f}', FORMATS.write('{f}', doc)).atoms.find(a=>a.el==='N').size") == 14, f
        assert page.evaluate(f"FORMATS.read('{f}', FORMATS.write('{f}', doc)).atoms.filter(a=>a.size).length") == 1, f
    page.evaluate(f"sel=new Set(doc.atoms.map(a=>'a'+a.id)); changed();")
    page.keyboard.press("Control+d")
    assert page.evaluate("doc.atoms.filter(a=>a.size===14).length") == 2


def test_style_label_size_changes_the_others_but_not_a_label_with_its_own_size(page):
    page.evaluate("tryLoadText('NCCO'); changed();")
    page.evaluate("doc.atoms[0].size=18; changed();")
    page.select_option("#labelSize", "12")
    sizes = page.evaluate("doc.atoms.filter(a=>a.el!=='C').map(a=>layoutLabel(doc,ix,a).items[0].size)")
    assert sizes == [18, 12]


def test_resizing_the_label_being_typed_leaves_the_rest_of_the_selection_alone(page):
    n = amine(page)
    page.evaluate("sel=new Set(doc.atoms.map(a=>'a'+a.id)); changed();")  # the whole structure selected, as after one click
    sx, sy = screen(page, *page.evaluate(f"[doc.atoms[{n}].x, doc.atoms[{n}].y]"))
    page.mouse.dblclick(sx, sy)
    page.wait_for_selector("#texted:not([hidden])")
    assert page.text_content("#textScope") == "Size and color apply to the label NH2"
    page.select_option("#tSize", "18")
    page.click("#texted"); page.keyboard.press("Enter")
    assert page.evaluate("doc.atoms.filter(a=>a.size).map(a=>[a.el,a.size])") == [["N", 18]]


def test_a_big_label_can_be_clicked_anywhere_on_its_letters(page):
    n = amine(page)
    page.evaluate(f"doc.atoms[{n}].size=24; changed();")
    for k in (0, 1, 2):  # N, H, 2
        p = page.evaluate(f"(()=>{{ const it=layoutLabel(doc,ix,doc.atoms[{n}]).items[{k}]; return [it.x, it.y-it.size*0.3]; }})()")
        assert page.evaluate(f"hitTest(V({p[0]},{p[1]}))") == {"type": "atom", "id": page.evaluate(f"doc.atoms[{n}].id")}, k
    # a hidden carbon is not made any bigger to click
    assert page.evaluate("hitTest(V(doc.atoms[3].x+8, doc.atoms[3].y+8))") is None or page.evaluate("hitTest(V(doc.atoms[3].x+8, doc.atoms[3].y+8)).type") != "atom"


def test_a_journal_style_resets_label_sizes(page):
    n = amine(page)
    page.evaluate(f"doc.atoms[{n}].size=24; changed();")
    page.click('#presetSeg [data-p="rsc"]')
    assert page.evaluate(f"doc.atoms[{n}].size") is None
    assert page.evaluate(f"layoutLabel(doc,ix,doc.atoms[{n}]).items[0].size") == 7
    page.keyboard.press("Control+z")
    assert page.evaluate(f"doc.atoms[{n}].size") == 24
