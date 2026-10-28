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


def test_drawing_settings_change_bond_width_in_exports(page):
    page.evaluate("tryLoadText('CCO')")
    page.fill("#ov_lineWidth", "1.5"); page.dispatch_event("#ov_lineWidth", "change")
    page.fill("#ov_spacing", "30"); page.dispatch_event("#ov_spacing", "change")
    assert page.evaluate("doc.styleOv") == {"lineWidth": 1.5, "spacing": 0.3}
    assert page.evaluate("pageExportSVG(subDoc(null),'crop')[0].includes('stroke-width=\"1.5\"')")
    page.fill("#ov_lineWidth", "99"); page.dispatch_event("#ov_lineWidth", "change")
    assert page.evaluate("doc.styleOv.lineWidth") == 6  # clamped
    page.click("#bOvReset")
    assert page.evaluate("doc.styleOv") is None


def test_label_size_reaches_exports(page):
    page.evaluate("tryLoadText('CCO'); doc.labelSize=16; changed()")
    assert page.evaluate("S(subDoc(null)).fontSize") == 16


def test_group_selects_and_aligns_as_one(page):
    page.evaluate("""(()=>{ tryLoadText('c1ccccc1'); tryLoadText('CCO');
      const c=components(doc,ix); const b=bboxOf(c[0].map(id=>ix.atom.get(id)));
      doc.texts.push({id:nid(), x:(b.x0+b.x1)/2, y:b.y1+60, text:'1'}); changed();
      sel=new Set([...c[0].map(id=>'a'+id), 't'+doc.texts[0].id]); setTool('select'); })()""")
    page.keyboard.press("Control+g")
    assert page.evaluate("new Set(doc.atoms.filter(a=>a.g).map(a=>a.g)).size") == 1
    assert page.evaluate("withGroups(['a'+components(doc,ix)[0][0]]).length") == 7  # 6 atoms + label far away
    assert page.evaluate("layoutUnits(new Set([...doc.atoms.map(a=>'a'+a.id),'t'+doc.texts[0].id])).length") == 2
    page.keyboard.press("Control+Shift+g")
    assert page.evaluate("doc.atoms.some(a=>a.g)") is False


def test_delete_without_selection_does_not_erase_hovered_item(page):
    page.evaluate("tryLoadText('CCO'); sel.clear(); hover={type:'atom', id:doc.atoms[0].id}")
    page.keyboard.press("Delete")
    assert page.evaluate("doc.atoms.length") == 3
    assert "Select something" in page.inner_text("#toast")


def test_arrow_nudges_share_one_undo_step(page):
    page.evaluate("tryLoadText('CCO'); selectAll()")
    x0 = page.evaluate("doc.atoms[0].x"); n = page.evaluate("undoStack.length")
    for _ in range(5): page.keyboard.press("ArrowRight")
    assert page.evaluate("doc.atoms[0].x") == x0 + 5
    assert page.evaluate("undoStack.length") == n + 1
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.atoms[0].x") == x0


def test_drag_snaps_centers_with_smart_guide(page):
    page.evaluate("""(()=>{ tryLoadText('c1ccccc1'); tryLoadText('CC(=O)O');
      const c=components(doc,ix); for (const id of c[1]) ix.atom.get(id).y+=30; changed(); setTool('select'); fit();
      sel=new Set(c[1].map(i=>'a'+i)); render(); })()""")
    sx, sy = atom_xy(page, "(a)=>a.id===components(doc,ix)[1][0]")
    before = page.evaluate("(()=>{ const c=components(doc,ix), m=ids=>{const u=layoutUnits(new Set(ids.map(i=>'a'+i)))[0].bb; return (u.y0+u.y1)/2}; return m(c[1])-m(c[0]) })()")
    z = page.evaluate("view.z")
    page.mouse.move(sx, sy); page.mouse.down()
    off = before - 3 / z  # land 3 screen px from alignment, inside the 6 px snap distance
    page.mouse.move(sx + 20, sy - off * z / 2); page.mouse.move(sx + 40, sy - off * z)
    assert page.evaluate("!!(preview && preview.guides && preview.guides.length)")
    page.mouse.up()
    after = page.evaluate("(()=>{ const c=components(doc,ix), m=ids=>{const u=layoutUnits(new Set(ids.map(i=>'a'+i)))[0].bb; return (u.y0+u.y1)/2}; return m(c[1])-m(c[0]) })()")
    assert abs(after) < 0.01


def test_fixed_gap_spacing(page):
    page.evaluate("tryLoadText('c1ccccc1'); tryLoadText('CCO'); tryLoadText('CCN'); sel.clear()")
    page.click("#bAlign"); page.fill("#alignGap", "2"); page.dispatch_event("#alignGap", "change")
    page.click("[data-align=hspace]")
    gaps = page.evaluate("""(()=>{ const u=layoutUnits(new Set(doc.atoms.map(a=>'a'+a.id))).sort((a,b)=>a.bb.x0-b.bb.x0);
      return u.slice(1).map((x,i)=>x.bb.x0-u[i].bb.x1) })()""")
    assert all(abs(g - 2 * 14.4) < 0.01 for g in gaps)


def test_panel_sections_fold_and_remember(page):
    page.click(".panel section:nth-of-type(2) .sechead")
    assert page.evaluate("document.querySelector('.panel section:nth-of-type(2)').classList.contains('collapsed')")
    page.reload(); page.wait_for_function("typeof OCL !== 'undefined'")
    assert page.evaluate("document.querySelector('.panel section:nth-of-type(2)').classList.contains('collapsed')")


PUBCHEM_ASPIRIN = {
    "cids": {"IdentifierList": {"CID": [2244]}},
    "props": {"PropertyTable": {"Properties": [{"CID": 2244, "Title": "Aspirin", "IUPACName": "2-acetyloxybenzoic acid",
                                                 "InChIKey": "BSYNRYMUTXBXSQ-UHFFFAOYSA-N", "MolecularFormula": "C9H8O4"}]}},
    "syn": {"InformationList": {"Information": [{"CID": 2244, "Synonym": ["aspirin", "50-78-2", "acetylsalicylic acid", "11126-35-5", "12-34-5"]}]}},
    "name": {"PropertyTable": {"Properties": [{"CID": 2519, "SMILES": "CN1C=NC2=C1C(=O)N(C(=O)N2C)C"}]}},
}


def _mock_pubchem(page, calls):
    def handle(route):
        url = route.request.url; calls.append((route.request.method, url, route.request.post_data))
        body = (PUBCHEM_ASPIRIN["cids"] if "/smiles/cids" in url else PUBCHEM_ASPIRIN["props"] if "/property/Title" in url
                else PUBCHEM_ASPIRIN["syn"] if "/synonyms" in url else PUBCHEM_ASPIRIN["name"] if "/compound/name/" in url else None)
        if body is None: return route.fulfill(status=404, body="{}")
        route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body))
    page.route("https://pubchem.ncbi.nlm.nih.gov/**", handle)


def test_lookup_shows_name_and_valid_cas_only(page):
    calls = []; _mock_pubchem(page, calls)
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); sel.clear()")
    page.click("#bLookup")
    page.wait_for_selector("dl.lk")
    txt = page.inner_text("#lkOut")
    assert "Aspirin" in txt and "50-78-2" in txt and "12-34-5" not in txt  # bad check digit is dropped
    assert calls[0][0] == "POST" and "smiles=" in calls[0][2]  # SMILES goes in the body, not the URL
    page.click("#lkOut [data-add^='CAS']")
    assert page.evaluate("doc.texts.map(t=>t.text)") == ["CAS 50-78-2"]


def test_insert_dialog_resolves_names_via_pubchem(page):
    calls = []; _mock_pubchem(page, calls)
    page.click("#bSmiles"); page.fill("#smIn", "caffeine"); page.click("#smGo")
    page.wait_for_function("doc.atoms.length > 0")
    assert smiles(page) == page.evaluate("OCL.Molecule.fromSmiles('Cn1cnc2c1c(=O)n(C)c(=O)n2C').toIsomericSmiles()")


def test_context_menu_copy_smiles_and_lookup_selects_structure(page):
    page.evaluate("tryLoadText('c1ccccc1'); tryLoadText('CCO'); sel.clear(); setTool('select')")
    x, y = atom_xy(page, "(a)=>a.id===components(doc,ix)[1][0]")
    page.mouse.click(x, y, button="right")
    assert page.is_visible("#ctxMenu")
    assert page.evaluate("selAtoms().length") == 3
    page.click("#ctxMenu [data-cmd=smiles]")
    assert page.is_hidden("#ctxMenu")


def test_saved_html_keeps_menus(page, tmp_path, open_page):
    html = page.evaluate("buildProjectHtml()")
    assert 'id="alignMenu"' in html and 'id="ctxMenu"' in html
