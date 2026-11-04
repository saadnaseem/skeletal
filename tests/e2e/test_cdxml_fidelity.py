"""Spec 003 (CDXML fidelity): dashed and hashed bond styles in the bond tool, kept through saving, undo, ChemDraw files and
exports; ChemDraw half-brackets open as a pair. Checks CK-07 and M-3 of sdd/specs/003-cdxml-fidelity/validation.md."""
import json
import pytest

RESET = "loadProject(newProject()); sel.clear(); changed();"


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


@pytest.mark.parametrize("style,label", [("dashed", "Dashed bond"), ("hashed", "Hashed bond")])
def test_FR_006_draw_save_reopen_undo(page, style, label):
    page.evaluate(RESET + " view.z=2; view.ox=300; view.oy=300; render();")
    page.click(f'#tools button[aria-label^="{label}"]')
    assert page.evaluate("[tool.id, tool.bond.order, tool.bond.stereo]") == ["bond", 1, style]
    x0, y0 = screen(page, 0, 0); x1, y1 = screen(page, 40, -20)
    page.mouse.move(x0, y0); page.mouse.down(); page.mouse.move(x1, y1, steps=5); page.mouse.up()
    assert page.evaluate("doc.bonds.map(b=>[b.order,b.stereo])") == [[1, style]]
    # formula: a single bond (ethane)
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula") == "C2H6"
    saved = page.evaluate("JSON.stringify(doc)")
    page.evaluate(f"setDoc(normalizeDoc(JSON.parse({json.dumps(saved)}))); changed()")
    assert page.evaluate("doc.bonds[0].stereo") == style
    svg = page.evaluate("exportSVG(doc).svg")
    assert ("stroke-dasharray" in svg) == (style == "dashed")
    page.evaluate("undo()")
    assert page.evaluate("doc.bonds.length") == 0


def test_FR_006_pressing_2_on_a_dashed_bond_makes_a_plain_double_bond(page):
    page.evaluate(RESET + " tryLoadText('CC'); doc.bonds[0].stereo='dashed'; sel.clear(); fit(); setTool('select'); changed();")
    b = page.evaluate("[ix.atom.get(doc.bonds[0].a), ix.atom.get(doc.bonds[0].b)].map(a=>[a.x,a.y])")
    page.mouse.move(*screen(page, (b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2))
    page.keyboard.press("2")
    assert page.evaluate("[doc.bonds[0].order, doc.bonds[0].stereo]") == [2, "none"]


def test_FR_007_008_chemdraw_round_trip_and_exports(page):
    page.evaluate(RESET + " tryLoadText('CCCC'); doc.bonds[0].stereo='dashed'; doc.bonds[2].stereo='hashed'; changed();")
    cdxml = page.evaluate("FORMATS.write('cdxml', doc)")
    assert 'Display="Dash"' in cdxml and 'Display="Hash"' in cdxml
    assert page.evaluate("t=>FORMATS.read('cdxml',t).bonds.map(b=>b.stereo).sort()", cdxml) == ["dashed", "hashed", "none"]
    assert page.evaluate("FORMATS.read('cdx', FORMATS.write('cdx', doc)).bonds.map(b=>b.stereo).sort()") == ["dashed", "hashed", "none"]
    mol = page.evaluate("toOCL(doc, ix).mol.toMolfile()")
    assert "  1  2  1  0" in mol or "  2  1  1  0" in mol  # a plain single bond in the molfile
    pdf = page.evaluate("(()=>{ PDF.takeMissing(); const b=PDF.build([exportSVG(doc).svg]); return {n:b.length, lost:PDF.takeMissing()}; })()")
    assert pdf["n"] > 500 and pdf["lost"] == [], pdf["lost"]
    png = page.evaluate("(async()=>{ const r=await makePng(doc, 2, true, null); return r.blob.size; })()")
    assert png > 500


def test_M3_chemdraw_half_brackets_open_as_one_pair_with_charge(page, tmp_path):
    x = """<?xml version="1.0"?><CDXML BondLength="14.4"><page><fragment id="1"><n id="2" p="80 300"/><n id="3" p="94.4 300"/><b id="4" B="2" E="3"/></fragment>
<graphic id="21" BoundingBox="110 280 110 320" GraphicType="Bracket" BracketType="Square" LipSize="60"/>
<graphic id="20" BoundingBox="64 320 64 280" GraphicType="Bracket" BracketType="Square" LipSize="60"/>
<bracketedgroup id="30" BracketedObjectIDs="2 3 4"><bracketattachment id="31" GraphicID="21"/><bracketattachment id="32" GraphicID="20"/></bracketedgroup>
<t id="40" p="112 285" BoundingBox="112 279 120 286"><s font="3" size="7.5" face="0">2–</s></t></page></CDXML>"""
    f = tmp_path / "complex.cdxml"; f.write_text(x)
    page.evaluate(RESET)
    page.set_input_files("#fileIn", str(f))
    for _ in range(50):
        if page.evaluate("doc.atoms.length"): break
        page.wait_for_timeout(50)
    assert page.evaluate("doc.brackets.map(q=>[q.type,q.sup])") == [["square", "2–"]]
    assert "left out" not in page.inner_text("#toast")
