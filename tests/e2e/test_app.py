import base64, json, struct, time

def atom_xy(page, js_pred):
    box = page.locator("#cv").bounding_box()
    x, y = page.evaluate(f"(()=>{{const a=doc.atoms.find({js_pred}); return [a.x*view.z+view.ox, a.y*view.z+view.oy]}})()")
    return box["x"] + x, box["y"] + y

def smiles(page):
    page.wait_for_timeout(200)
    return page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).smiles")


def test_loads_cleanly(page):
    assert page.locator("#tools .tool").count() == 43
    assert page.locator("#empty").is_visible()


def test_draw_chain_by_clicking_and_undo_redo(page):
    box = page.locator("#cv").bounding_box()
    page.mouse.click(box["x"] + 300, box["y"] + 300)
    for _ in range(3):
        x, y = atom_xy(page, "(a,i,arr)=>i===arr.length-1")
        page.mouse.click(x, y)
    assert page.evaluate("doc.atoms.length") == 5
    assert smiles(page) == "CCCCC"
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms.length") == 4
    page.keyboard.press("Control+Shift+z")
    assert page.evaluate("doc.atoms.length") == 5


def test_hover_hotkey_changes_element(page):
    box = page.locator("#cv").bounding_box()
    page.mouse.click(box["x"] + 300, box["y"] + 300)
    x, y = atom_xy(page, "(a,i)=>i===1")
    page.mouse.move(x, y); page.keyboard.press("o")
    assert smiles(page) in ("CO", "OC")


def test_insert_smiles_dialog_and_analysis(page):
    page.click("#bSmiles")
    page.fill("#smIn", "CC(=O)Oc1ccccc1C(=O)O")
    page.click("#smGo")
    page.wait_for_timeout(300)
    assert "C9H8O4" in page.inner_text("#props").replace("\n", "")
    assert "180.16" in page.inner_text("#props")


def test_invalid_smiles_shows_error(page):
    page.click("#bSmiles"); page.fill("#smIn", "C1CC(("); page.click("#smGo")
    assert "valid SMILES" in page.inner_text("#smErr")


def test_benzene_fusion_gives_naphthalene(page):
    page.evaluate("setTool('ring',{ring:6,arom:true})")
    box = page.locator("#cv").bounding_box()
    page.mouse.click(box["x"] + 400, box["y"] + 400)
    xy = page.evaluate("(()=>{const b=doc.bonds[0]; const A=ix.atom.get(b.a),B=ix.atom.get(b.b); return [((A.x+B.x)/2)*view.z+view.ox,((A.y+B.y)/2)*view.z+view.oy]})()")
    page.mouse.click(box["x"] + xy[0], box["y"] + xy[1])
    assert page.evaluate("doc.atoms.length") == 10
    assert page.evaluate("OCL.Molecule.fromSmiles(analysisFor(doc.atoms.map(a=>a.id)).smiles).getIDCode()") == page.evaluate("OCL.Molecule.fromSmiles('c1ccc2ccccc2c1').getIDCode()")


def test_clean_up_and_flip_keep_stereo(page):
    page.evaluate("tryLoadText('C[C@@H](C(=O)O)N')")
    before = page.evaluate("OCL.Molecule.fromSmiles(analysisFor(doc.atoms.map(a=>a.id)).smiles).getIDCode()")
    page.evaluate("cleanUp(); flip('h'); flip('v')")
    after = page.evaluate("OCL.Molecule.fromSmiles(analysisFor(doc.atoms.map(a=>a.id)).smiles).getIDCode()")
    assert before == after


def test_svg_export_embeds_drawing(page):
    page.evaluate("tryLoadText('c1ccncc1')")
    svg = page.evaluate("exportSVG(subDoc(null)).svg")
    assert svg.startswith("<svg") and 'id="skeletal-data"' in svg and "pt\"" in svg


def test_png_export_has_600_dpi_and_reopens(page):
    page.evaluate("tryLoadText('CCO')")
    data = page.evaluate("""async()=>{ const d=subDoc(null); const {blob}=await makePng(d,600/72,false); const b=await pngWithMeta(blob,600,JSON.stringify(d));
      const u=new Uint8Array(await b.arrayBuffer()); let s=''; for (const x of u) s+=String.fromCharCode(x); return [btoa(s), readPngMeta(u)!==null]; }""")
    raw = base64.b64decode(data[0])
    assert raw[:8] == b"\x89PNG\r\n\x1a\n" and data[1]
    i = raw.index(b"pHYs"); ppm = struct.unpack(">I", raw[i+4:i+8])[0]
    assert abs(ppm * 0.0254 - 600) < 1


def test_pdf_tiles_and_fonts(page):
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); doc.texts.push({id:nid(),x:0,y:-40,text:'β-lactam, 80 °C',font:'serif',italic:true}); changed();")
    page.evaluate("doc.page={preset:'letter',w:612,h:792,across:2,down:2,x:-600,y:-700}; changed();")
    b64 = page.evaluate("""()=>{ const by=PDF.build(pageExportSVG(doc,'tiles')); let s=''; for (const x of by) s+=String.fromCharCode(x); return btoa(s); }""")
    pdf = base64.b64decode(b64)
    assert pdf.startswith(b"%PDF-1.4") and pdf.rstrip().endswith(b"%%EOF")
    assert pdf.count(b"/Type /Page ") == 4
    assert b"/BaseFont /Times-Italic" in pdf and b"/Symbol" in pdf


def test_save_html_reopens_with_pages_and_versions(page, open_page, tmp_path):
    page.evaluate("tryLoadText('CCO'); saveVersion('v1'); addPage(); tryLoadText('c1ccccc1'); project.name='Round trip';")
    html = page.evaluate("buildProjectHtml()")
    f = tmp_path / "rt.html"; f.write_text(html, encoding="utf-8")
    p2 = open_page(f.as_uri())
    p2.wait_for_timeout(300)
    assert p2.evaluate("project.name") == "Round trip"
    assert p2.evaluate("project.pages.map(p=>p.doc.atoms.length)") == [3, 6]
    assert p2.evaluate("project.versions.length") == 1
    assert p2.errors == []


def test_malicious_file_does_not_inject_markup(page):
    payload = {"atoms":[{"id":1,"x":0,"y":0,"el":"C","color":"\"/><img src=x onerror=\"window.__pwned=1\">"}],
               "bonds":[], "texts":[{"id":2,"x":0,"y":20,"text":"<img src=x onerror=window.__pwned=2>","color":"red\" onmouseover=\"x"}]}
    page.evaluate(f"tryLoadText({json.dumps(json.dumps(payload))})")
    page.wait_for_timeout(300)
    assert page.evaluate("window.__pwned") is None
    assert page.locator("#cv img").count() == 0


def test_nmr_dialog(page):
    page.evaluate("tryLoadText('CCOC(C)=O')")
    page.click("#bNmr")
    assert page.locator("table.peaks tbody tr").count() == 3
    page.click("[data-tab=C]")
    assert page.locator("table.peaks tbody tr").count() == 4
    page.select_option("#nmSolv", "CDCl3")
    assert "CDCl" in page.inner_text(".nmrbox:nth-child(2)")


def test_solvent_table_lookup(page):
    page.click("#bSolv"); page.click("[data-st=h1]")
    page.fill("#svQ", "2.17")
    assert "acetone" in page.inner_text("table.peaks")


def test_pka_and_bde_cards(page):
    page.evaluate("tryLoadText('Cc1ccccc1'); setTool('pka')")
    x, y = atom_xy(page, "(a,i)=>i===0")
    page.mouse.click(x, y)
    assert "aryl" in page.inner_text("#infocard")
    page.evaluate("setTool('bde')")
    page.mouse.click(x, y)
    assert "89.8" in page.inner_text("#infocard")


def test_eraser_miss_does_not_add_undo_step(page):
    page.evaluate("tryLoadText('CCO'); setTool('erase')")
    n = page.evaluate("undoStack.length")
    box = page.locator("#cv").bounding_box()
    page.mouse.click(box["x"] + 20, box["y"] + 20)
    assert page.evaluate("undoStack.length") == n


def test_large_structure_renders_quickly(page):
    ms = page.evaluate("""()=>{ tryLoadText('C'.repeat(1)+'CC(C)'.repeat(60)+'c1ccc2ccccc2c1'); const t=performance.now(); for (let i=0;i<10;i++) render(); return (performance.now()-t)/10; }""")
    assert page.evaluate("doc.atoms.length") > 180
    assert ms < 120, f"render took {ms:.1f} ms"


def test_mobile_layout_fits_and_panel_opens(mobile):
    assert mobile.evaluate("document.documentElement.scrollWidth") <= 390
    assert mobile.locator("#bCopy").is_visible()
    mobile.tap("#bPanel"); mobile.wait_for_timeout(300)
    assert mobile.locator("#panel").evaluate("el=>el.classList.contains('open')")


def test_new_project_asks_before_replacing_work(page):
    page.evaluate("tryLoadText('CCO')")
    page.click("#bNew")
    assert "New project" in page.inner_text("#dialog")
    page.click("#npGo")
    assert page.evaluate("doc.atoms.length") == 0 and page.evaluate("project.pages.length") == 1


def test_align_menu_scheme_row_aligns_middles_and_spaces_evenly(page):
    page.evaluate("""(()=>{
      tryLoadText('CC(=O)c1ccccc1.OB(O)c1ccccc1>>O=C(C)c1ccc(cc1)-c1ccccc1');
      components(doc,ix).forEach((c,i)=>{ for (const id of c){ const a=ix.atom.get(id); a.y+=[-40,25,-15][i]; a.x+=i*12; } });
      const b=bboxOf(components(doc,ix)[0].map(id=>ix.atom.get(id)));
      doc.texts.push({id:nid(), x:(b.x0+b.x1)/2, y:b.y1+16, text:'1'});
      sel.clear(); changed();
    })()""")
    label_dy = page.evaluate("(()=>{ const t=doc.texts[0], a=ix.atom.get(components(doc,ix)[0][0]); return t.y-a.y })()")
    page.click("#bAlign")
    page.click("[data-align=row]")
    r = page.evaluate("""(()=>{
      const keys=new Set([...doc.atoms.map(a=>'a'+a.id),...doc.arrows.map(r=>'r'+r.id),...doc.texts.map(t=>'t'+t.id),...doc.pluses.map(p=>'p'+p.id)]);
      const u=layoutUnits(keys).sort((a,b)=>a.bb.x0-b.bb.x0);
      const t=doc.texts[0], a=ix.atom.get(components(doc,ix)[0][0]);
      return {mids:u.map(x=>(x.bb.y0+x.bb.y1)/2), gaps:u.slice(1).map((x,i)=>x.bb.x0-u[i].bb.x1), dy:t.y-a.y, n:u.length};
    })()""")
    assert r["n"] == 5  # 3 structures, a plus and an arrow; the label rides with structure 1
    assert max(r["mids"]) - min(r["mids"]) < 0.01
    assert max(r["gaps"]) - min(r["gaps"]) < 0.01 and min(r["gaps"]) > 0
    assert abs(r["dy"] - label_dy) < 0.01
    page.keyboard.press("Escape")
    page.keyboard.press("Control+z")
    assert page.evaluate("(()=>{ const c=components(doc,ix); return ix.atom.get(c[0][0]).y !== ix.atom.get(c[1][0]).y })()")


def test_align_needs_two_pieces(page):
    page.evaluate("tryLoadText('c1ccccc1')")
    page.click("#bAlign"); page.click("[data-align=left]")
    assert "two" in page.inner_text("#toast")
