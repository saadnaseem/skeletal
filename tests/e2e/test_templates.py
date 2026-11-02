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


def screen(page, x, y):
    return page.evaluate("([x,y])=>{ const r=cv.getBoundingClientRect(); return [r.left+view.ox+x*view.z, r.top+view.oy+y*view.z]; }", [x, y])


def chair_with_bond_tool(page):
    tpl(page, "Chair cyclohexane")
    page.evaluate("sel.clear(); fit(); setTool('bond'); tool.bond={order:1,stereo:'none'}; render()")


def new_bond_dir(page, ring_id):
    """Unit vector of the newest bond from ring atom ring_id."""
    return page.evaluate(f"""(()=>{{ const b=doc.bonds[doc.bonds.length-1], a=ix.atom.get({ring_id}), o=ix.atom.get(b.a==={ring_id}?b.b:b.a);
      const l=Math.hypot(o.x-a.x,o.y-a.y); return [(o.x-a.x)/l, (o.y-a.y)/l, l]; }})()""")


def test_clicking_a_chair_carbon_adds_the_axial_bond_then_the_equatorial_one(page):
    chair_with_bond_tool(page)
    a = page.evaluate("doc.atoms[0].id")  # the foot: a lowered corner, so axial points down
    page.mouse.click(*screen(page, *page.evaluate("[doc.atoms[0].x, doc.atoms[0].y]")))
    x, y, l = new_bond_dir(page, a)
    assert abs(x) < 1e-6 and abs(y - 1) < 1e-6, "axial: straight down"
    assert abs(l - page.evaluate("L")) < 1e-6
    page.mouse.click(*screen(page, *page.evaluate("[doc.atoms[0].x, doc.atoms[0].y]")))
    x, y, _ = new_bond_dir(page, a)
    # equatorial: parallel to the ring bond between atoms 2 and 3, out to the left
    par = page.evaluate(f"(()=>{{ const A=doc.atoms, b={{x:A[2].x-A[1].x, y:A[2].y-A[1].y}}; return Math.abs(({x})*b.y-({y})*b.x)/Math.hypot(b.x,b.y); }})()")
    assert par < 1e-6 and x < 0
    assert page.evaluate("doc.atoms.length") == 8
    # a raised corner gets its axial bond pointing up
    b = page.evaluate("doc.atoms[3].id")
    page.mouse.click(*screen(page, *page.evaluate("[doc.atoms[3].x, doc.atoms[3].y]")))
    x, y, _ = new_bond_dir(page, b)
    assert abs(x) < 1e-6 and abs(y + 1) < 1e-6


def test_a_bond_dragged_from_a_chair_carbon_snaps_to_axial(page):
    chair_with_bond_tool(page)
    a = page.evaluate("[doc.atoms[3].x, doc.atoms[3].y, doc.atoms[3].id]")
    # drag up and a little to the right (about 10° off vertical)
    sx, sy = screen(page, a[0], a[1]); ex, ey = screen(page, a[0] + 3, a[1] - 17)
    page.mouse.move(sx, sy); page.mouse.down(); page.mouse.move(ex, ey, steps=5); page.mouse.up()
    x, y, _ = new_bond_dir(page, a[2])
    assert abs(x) < 1e-6 and abs(y + 1) < 1e-6, (x, y)


def test_clean_up_keeps_the_chair_and_its_axial_and_equatorial_groups(page):
    chair_with_bond_tool(page)
    # an axial methyl on the foot, and an equatorial ethyl on the head
    page.evaluate("""(()=>{ const A=doc.atoms, s=findChairs(doc,ix);
      const add=(r,v,n)=>{ let p=r; for (let k=0;k<n;k++){ const q=addAtom(p.x+v.x*L, p.y+v.y*L); addBond(p.id,q.id,1); p=q; v={x:v.x*Math.cos(1.05)-v.y*Math.sin(1.05), y:v.x*Math.sin(1.05)+v.y*Math.cos(1.05)}; } };
      add(A[0], s.get(A[0].id).ax, 1); add(A[3], s.get(A[3].id).eq, 2); changed(); })()""")
    before = page.evaluate("doc.atoms.slice(0,6).map(a=>[a.x,a.y])")
    # mess the drawing up a little, then clean it up
    page.evaluate("doc.atoms[7].x+=5; doc.atoms[8].y-=4; changed(); cleanUp();")
    assert page.evaluate("findChairs(doc,ix).size") == 6, "still a chair"
    after = page.evaluate("doc.atoms.slice(0,6).map(a=>[a.x,a.y])")
    d = [after[i][0] - before[i][0] for i in range(6)], [after[i][1] - before[i][1] for i in range(6)]
    assert max(d[0]) - min(d[0]) < 1e-6 and max(d[1]) - min(d[1]) < 1e-6, "same chair, same way up"
    def slot_of(r, o):
        return page.evaluate(f"""(()=>{{ const a=ix.atom.get({r}), b=ix.atom.get({o}), s=findChairs(doc,ix).get({r}), l=Math.hypot(b.x-a.x,b.y-a.y), u={{x:(b.x-a.x)/l,y:(b.y-a.y)/l}};
          return [u.x*s.ax.x+u.y*s.ax.y, u.x*s.eq.x+u.y*s.eq.y, l]; }})()""")
    ids = page.evaluate("doc.atoms.map(a=>a.id)")
    ax = slot_of(ids[0], ids[6]); eq = slot_of(ids[3], ids[7])
    assert ax[0] > 0.9999 and eq[1] > 0.9999, (ax, eq)
    Lv = page.evaluate("L")
    assert all(abs(x - Lv) < 0.02 * Lv for x in page.evaluate("doc.bonds.map(b=>{ const p=ix.atom.get(b.a), q=ix.atom.get(b.b); return Math.hypot(p.x-q.x,p.y-q.y); })"))
    assert page.evaluate("toOCL(doc, ix).mol.toSmiles()") in ("CCC1CCC(C)CC1", "CC1CCC(CC)CC1")
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms[7].x") != page.evaluate("doc.atoms[3].x")


def test_clean_up_of_a_plain_ring_still_gives_a_hexagon_and_linked_chairs_are_left_alone(page):
    page.evaluate("tryLoadText('C1CCCCC1'); cleanUp();")
    assert page.evaluate("findChairs(doc,ix).size") == 0
    page.evaluate("doc.atoms=[]; doc.bonds=[]; changed();")
    tpl(page, "Chair cyclohexane"); tpl(page, "Chair, ring-flipped")
    page.evaluate("addBond(doc.atoms[3].id, doc.atoms[6].id, 1); changed();")
    before = page.evaluate("JSON.stringify(doc.atoms.map(a=>[a.x,a.y]))")
    page.evaluate("sel.clear(); cleanUp();")
    assert page.evaluate("JSON.stringify(doc.atoms.map(a=>[a.x,a.y]))") == before
    assert "left as drawn" in page.text_content("#toast")
