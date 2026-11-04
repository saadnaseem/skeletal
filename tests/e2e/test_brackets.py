"""Brackets: wrap a selection or drag a pair, label it (charge, ‡, n), resize, and keep it through undo, files and exports."""
import json
import pytest

SQUARE = '#tools button[title^="Square brackets"]'
CURLY = '#tools button[title^="Curly braces"]'
ROUND = '#tools button[title^="Round brackets"]'
SELECT = '#tools button[title^="Select and move"]'


def screen(page, x, y):
    """Page coordinates of a drawing point."""
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def bracket(page, i=0):
    return page.evaluate(f"doc.brackets[{i}] && JSON.parse(JSON.stringify(doc.brackets[{i}]))")


def test_select_a_structure_and_click_a_tool_to_bracket_it_then_label_it(page):
    page.evaluate("tryLoadText('C[N+](C)(C)C'); selectAllSilent(); render()")
    page.click(SQUARE)
    q = bracket(page)
    assert q and q["type"] == "square"
    # every atom is inside, clear of the hooks
    inside = page.evaluate("(()=>{ const q=doc.brackets[0]; return doc.atoms.every(a=>Math.abs(a.x-q.x)<q.w/2-L*0.2 && Math.abs(a.y-q.y)<q.h/2); })()")
    assert inside
    assert page.evaluate("sel.size") == 0, "the new brackets are not left selected"
    # double-click the right bracket to label it
    x, y = screen(page, q["x"] + q["w"] / 2, q["y"])
    page.mouse.dblclick(x, y)
    page.wait_for_selector("#bkSup")
    page.click('[data-sup="2-"]'); page.click('[data-sub="n"]')
    assert "2−" in page.inner_html("#bkPrev")
    page.click('#dialog [data-t="curly"]')
    page.click("#bkGo")
    q = bracket(page)
    assert (q["type"], q["sup"], q["sub"]) == ("curly", "2-", "n")
    svg = page.evaluate("exportSVG(doc).svg")
    assert ">2−</text>" in svg and ">n</text>" in svg
    # one undo takes the labels back off, another removes the brackets
    page.keyboard.press("Control+z")
    assert "sup" not in bracket(page)
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.brackets.length") == 0


def test_drag_draws_brackets_and_a_tool_click_changes_the_selected_ones(page):
    page.click(ROUND)
    x0, y0 = screen(page, 0, 0)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x0 + 160, y0 + 110, steps=6); page.mouse.up()
    q = bracket(page)
    assert q["type"] == "round" and q["w"] > 20 and q["h"] > 20
    # brackets you select yourself change type when you click another bracket tool
    page.click(SELECT); page.mouse.click(*screen(page, q["x"] + q["w"] / 2, q["y"]))
    assert page.evaluate("[...sel].join()") == f"k{q['id']}"
    page.click(SQUARE)
    assert page.evaluate("doc.brackets.map(q=>q.type).join()") == "square"
    # a click with nothing selected explains how to use the tool
    page.evaluate("sel.clear(); setTool('bracket',{btype:'curly'})")
    page.mouse.click(x0 + 400, y0 + 300)
    assert "Drag across a structure" in page.inner_text("#toast")
    assert page.evaluate("doc.brackets.length") == 1


def test_resize_with_a_corner_handle_move_copy_and_delete(page):
    page.evaluate("doc.brackets.push({id:nid(), type:'square', x:0, y:0, w:60, h:40}); sel=new Set(['k'+doc.brackets[0].id]); setTool('select'); changed()")
    x, y = screen(page, 30, 20)  # bottom-right handle
    page.mouse.move(x, y); page.mouse.down(); page.mouse.move(x + 3 * 20, y + 3 * 10, steps=5); page.mouse.up()
    q = bracket(page)
    z = page.evaluate("view.z")
    assert abs(q["w"] - (60 + 60 / z)) < 1.5 and abs(q["h"] - (40 + 30 / z)) < 1.5, q
    assert abs((q["x"] - q["w"] / 2) - (-30)) < 0.5, "the opposite corner stays put"
    page.keyboard.press("ArrowRight")
    assert bracket(page)["x"] > q["x"]
    page.keyboard.press("Control+d")  # duplicate: the same copy and paste path as Ctrl+C, Ctrl+V
    assert page.evaluate("doc.brackets.length") == 2
    page.keyboard.press("Delete")
    assert page.evaluate("doc.brackets.length") == 1


def test_brackets_survive_save_reopen_chemdraw_and_exports(page):
    page.evaluate("tryLoadText('CC'); doc.brackets.push({id:nid(), type:'square', x:7, y:0, w:40, h:30, sup:'+', sub:'n'}); changed()")
    saved = page.evaluate("JSON.stringify(doc)")
    page.evaluate(f"setDoc(normalizeDoc(JSON.parse({json.dumps(saved)}))); changed()")
    assert bracket(page)["sup"] == "+"
    cdxml = page.evaluate("FORMATS.write('cdxml', doc)")
    assert 'BracketType="Square"' in cdxml and "<bracketedgroup" in cdxml  # half-brackets linked by a group, as ChemDraw writes them (spec 003)
    back = page.evaluate("(t=>{ const d=FORMATS.read('cdxml',t); return d.brackets.map(q=>[q.type,q.sup,q.sub]); })", cdxml)
    assert back == [["square", "+", "n"]]
    # PDF and PNG are drawn from the same picture
    # the PDF has the bracket strokes (curves for the round pair) and its labels
    page.evaluate("doc.brackets.push({id:nid(), type:'round', x:90, y:0, w:30, h:30, sup:'\u2021'}); changed()")
    pdf = page.evaluate("(()=>{ PDF.takeMissing(); const b=PDF.build([exportSVG(doc).svg]); return {n:b.length, lost:PDF.takeMissing(), eps:new TextDecoder('latin1').decode(PDF.eps(exportSVG(doc).svg))}; })()")
    assert pdf["n"] > 500 and pdf["lost"] == [], pdf["lost"]
    assert pdf["eps"].count("curveto") + pdf["eps"].count(" c\n") > 0, "the round brackets are curves in EPS too"
    png = page.evaluate("(async()=>{ const r=await makePng(doc, 2, true, null); return r.blob.size; })()")
    assert png > 500
    assert page.errors == []


def test_long_press_on_a_phone_opens_the_bracket_dialog(mobile):
    mobile.evaluate("doc.brackets.push({id:nid(), type:'square', x:0, y:0, w:60, h:40}); changed(); fit()")
    x, y = screen(mobile, 30, 0)
    cdp = mobile.context.new_cdp_session(mobile)  # a real held touch: there is no double-click on a phone
    cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
    mobile.wait_for_timeout(800)
    cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    assert mobile.is_visible("#bkSup")
    assert mobile.evaluate("doc.brackets.length") == 1, "holding still neither moves nor duplicates the bracket"


def _drag(page, x, y):
    sx, sy = screen(page, x, y)
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(sx + 120, sy + 90, steps=5); page.mouse.up()


def _types(page):
    return page.evaluate("doc.brackets.map(q=>q.type)")


@pytest.mark.parametrize("first,first_tool,second,second_tool,between", [
    ("curly", CURLY, "square", SQUARE, []),
    ("square", SQUARE, "curly", CURLY, []),
    ("curly", CURLY, "round", ROUND, ["empty"]),          # click empty canvas with the bracket tool still on
    ("round", ROUND, "square", SQUARE, ["select"]),       # switch to Select, then pick another bracket tool
    ("curly", CURLY, "square", SQUARE, ["select", "empty"]),
])
def test_picking_another_bracket_tool_after_drawing_starts_a_new_pair(page, first, first_tool, second, second_tool, between):
    page.click(first_tool); _drag(page, 0, 0)
    for step in between:
        if step == "select": page.click(SELECT)
        if step == "empty": page.mouse.click(*screen(page, 20, 110))
    page.click(second_tool)
    assert _types(page) == [first], "the bracket already drawn keeps its type"
    assert page.evaluate("tool.id+'/'+tool.btype") == f"bracket/{second}"
    _drag(page, 70, 0)
    assert _types(page) == [first, second], "the next drag draws the newly picked type"
