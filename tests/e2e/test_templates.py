"""The Templates panel: SMILES templates, and the two cyclohexane chairs drawn with fixed coordinates."""

SHAPE = """(()=>{ const a=doc.atoms, n=a.length;
  const v=i=>({x:a[(i+1)%n].x-a[i].x, y:a[(i+1)%n].y-a[i].y});
  const len=[...Array(n)].map((_,i)=>Math.hypot(v(i).x,v(i).y));
  const par=[0,1,2].every(i=>Math.abs(v(i).x*v(i+3).y-v(i).y*v(i+3).x)<1e-6);
  const l=a.reduce((m,p)=>p.x<m.x?p:m), r=a.reduce((m,p)=>p.x>m.x?p:m);
  return {n, bonds:doc.bonds.length, even:Math.max(...len)-Math.min(...len)<1e-6, len:len[0], par, leftLower:l.y>r.y}; })()"""


def tpl(page, name):
    page.click(f'#tpl button:text-is("{name}")')


def test_the_two_chairs_are_in_the_templates_panel(page):
    names = page.eval_on_selector_all("#tpl button", "bs=>bs.map(b=>b.textContent)")
    assert "Chair cyclohexane" in names and "Chair, ring-flipped" in names


def test_a_chair_is_drawn_as_a_chair_not_a_hexagon(page):
    tpl(page, "Chair cyclohexane")
    s = page.evaluate(SHAPE)
    assert s["n"] == 6 and s["bonds"] == 6
    assert s["even"] and abs(s["len"] - page.evaluate("L")) < 1e-6, "every bond one bond length"
    assert s["par"], "opposite bonds parallel"
    assert s["leftLower"], "foot down on the left, head up on the right"
    assert page.evaluate("sel.size") == 6, "the new chair is selected, ready to move"
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms.length") == 0


def test_the_ring_flipped_chair_is_the_mirror_image(page):
    tpl(page, "Chair, ring-flipped")
    s = page.evaluate(SHAPE)
    assert s["n"] == 6 and s["even"] and s["par"] and not s["leftLower"]


def test_both_chairs_side_by_side_and_smiles_still_work(page):
    tpl(page, "Chair cyclohexane")
    tpl(page, "Chair, ring-flipped")
    assert page.evaluate("doc.atoms.length") == 12
    # the second goes to the right of the first, without overlapping it
    assert page.evaluate("Math.min(...doc.atoms.slice(6).map(a=>a.x)) > Math.max(...doc.atoms.slice(0,6).map(a=>a.x))")
    tpl(page, "Benzene")
    assert page.evaluate("doc.atoms.length") == 18
    assert page.evaluate("doc.bonds.filter(b=>b.order===2).length") == 3


def test_a_chair_exports_as_cyclohexane(page):
    tpl(page, "Chair cyclohexane")
    assert page.evaluate("toOCL(doc, ix).mol.toSmiles()") == "C1CCCCC1"
    svg = page.evaluate("exportSVG(doc).svg")
    assert svg.count("<line") + svg.count("<path") >= 6
