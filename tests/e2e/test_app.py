import base64, json, struct, time

def atom_xy(page, js_pred):
    box = page.locator("#cv").bounding_box()
    x, y = page.evaluate(f"(()=>{{const a=doc.atoms.find({js_pred}); return [a.x*view.z+view.ox, a.y*view.z+view.oy]}})()")
    return box["x"] + x, box["y"] + y

def wait_until(page, expr, timeout=10000):
    """Poll a JS expression via evaluate (wait_for_function uses eval(), which the site's CSP blocks)."""
    for _ in range(timeout // 100):
        if page.evaluate(expr): return
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {expr}")


def smiles(page):
    page.wait_for_timeout(200)
    return page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).smiles")


def test_loads_cleanly(page):
    assert page.locator("#tools .tool").count() == 44
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
    page.click("#bAnalyze")
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
    page.reload(); wait_until(page, "typeof OCL !== 'undefined'")
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
    wait_until(page, "doc.atoms.length > 0")
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


def test_stereo_drawn_from_smiles_is_not_mirrored(page):
    # L-alanine inserted from SMILES must be drawn as (S): read the screen geometry back through a molfile built here
    page.evaluate("tryLoadText('C[C@H](N)C(=O)O')")
    assert page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).smiles") == page.evaluate("OCL.Molecule.fromSmiles('C[C@H](N)C(=O)O').toIsomericSmiles()")
    mol = page.evaluate("""(()=>{ const ix2=buildIndex(doc), id=new Map(doc.atoms.map((a,i)=>[a.id,i+1]));
      const L2=['','x','',`${String(doc.atoms.length).padStart(3)}${String(doc.bonds.length).padStart(3)}  0  0  1  0  0  0  0  0999 V2000`]; // chiral flag set: absolute stereo
      for (const a of doc.atoms) L2.push(`${(a.x/14.4).toFixed(4).padStart(10)}${(-a.y/14.4).toFixed(4).padStart(10)}    0.0000 ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`);
      for (const b of doc.bonds) L2.push(`${String(id.get(b.a)).padStart(3)}${String(id.get(b.b)).padStart(3)}${String(b.order).padStart(3)}${String({wedge:1,hash:6}[b.stereo]||0).padStart(3)}`);
      L2.push('M  END'); return L2.join('\\n'); })()""")
    # a molfile with y up, as every other program expects: OCL must read the same configuration
    assert page.evaluate("(m)=>OCL.Molecule.fromMolfile(m).toIsomericSmiles()", mol) == page.evaluate("OCL.Molecule.fromSmiles('C[C@H](N)C(=O)O').toIsomericSmiles()")


def test_inchi_and_key_offline(page):
    page.evaluate("tryLoadText('C[C@H](N)C(=O)O'); sel.clear()")
    page.click("#bAnalyze")
    wait_until(page, "document.getElementById('anKey') && document.getElementById('anKey').textContent.length > 20")
    assert page.inner_text("#anKey").strip() == "QNAYBMKLOCPYGJ-REOHCLBHSA-N"
    page.evaluate("loadProject(newProject()); tryLoadText('InChI=1S/C8H10N4O2/c1-10-4-9-6-5(10)7(13)12(3)8(14)11(6)2/h4H,1-3H3')")
    wait_until(page, "doc.atoms.length===14")


def test_save_as_lists_formats_and_exports(page):
    page.evaluate("tryLoadText('CC(=O)O.OCC>>CC(=O)OCC'); sel.clear()")
    page.keyboard.press("Control+Shift+s")
    assert page.locator("#dialog table.fmt tr").count() >= 24
    out = page.evaluate("""(async()=>{ const r={}; for (const id of ['cdxml','cdx','mol','molV3','sdf','rxn','smiles','smarts','inchi','cml','mrv','jme','chemfig','eps','gif','jpeg']){
        try{ const x=(await exportData(id)).data; r[id] = typeof x==='string' ? x.slice(0,40) : (x.length ?? x.size); }catch(e){ r[id]='ERR '+e.message; } } return r; })()""")
    assert not [k for k, v in out.items() if str(v).startswith("ERR")], out
    assert out["cdxml"].startswith("<?xml") and out["rxn"].startswith("$RXN") and out["inchi"].startswith("InChI=1S/")
    cdx = page.evaluate("(async()=>Array.from((await exportData('cdx')).data.slice(0,8)))()")
    assert bytes(cdx) == b"VjCD0100"


def test_cdxml_and_cdx_round_trip_through_open(page):
    page.evaluate("tryLoadText('C[C@H](N)C(=O)O'); sel.clear()")
    want = smiles(page)
    for fmt in ("cdxml", "cdx", "cml", "mrv"):
        got = page.evaluate(f"""(()=>{{ const d=normalizeDoc({{...newDoc(), ...FORMATS.read('{fmt}', FORMATS.write('{fmt}', subDoc(null)))}}); const x=buildIndex(d);
          return toOCL(d,x,d.atoms.map(a=>a.id)).mol.toIsomericSmiles(); }})()""")
        assert got == want, fmt
    page.evaluate("loadProject(newProject())")
    page.evaluate("insertForeign(FORMATS.read('cdxml', `<?xml version=\"1.0\"?><CDXML><page><fragment><n id=\"1\" p=\"10 10\"/><n id=\"2\" p=\"24.4 10\" Element=\"8\"/><b B=\"1\" E=\"2\"/></fragment></page></CDXML>`),'t.cdxml')")
    assert smiles(page) == "CO"


def test_mass_spectrum_dialog(page):
    page.evaluate("tryLoadText('CC(=O)Nc1ccc(O)cc1'); sel.clear()")
    page.click("#bMs")
    assert "152.0706" in page.inner_text("#dialog")
    page.click("[data-mt=msms]")
    page.wait_for_selector("#dialog tr[data-peak]")
    assert "110.0600" in page.inner_text("#dialog")
    page.click("#dialog tr[data-peak]")
    assert page.locator('#dialog line[stroke="#d6336c"]').count() >= 1
    page.click("[data-mt=iso]")
    assert "M+1" in page.inner_text("#dialog")


def test_lasso_selects_inside_loop(page):
    page.evaluate("tryLoadText('c1ccccc1'); tryLoadText('CCO'); sel.clear(); fit()")
    page.keyboard.press("l")
    pts = page.evaluate("""(()=>{ const c=components(doc,ix); const b=bboxOf(c[0].map(i=>ix.atom.get(i))); const r=cv.getBoundingClientRect();
      const cx=(b.x0+b.x1)/2, cy=(b.y0+b.y1)/2, R=Math.max(b.x1-b.x0,b.y1-b.y0)*0.75;
      return [...Array(20).keys()].map(k=>[r.left+(cx+R*Math.cos(k/20*6.283))*view.z+view.ox, r.top+(cy+R*Math.sin(k/20*6.283))*view.z+view.oy]); })()""")
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p)
    page.mouse.up()
    assert page.evaluate("selAtoms().length") == 6


def test_find_in_databases_builds_links(page):
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); sel.clear()")
    page.click("#bFindDb")
    page.wait_for_selector("#dialog [data-u]")
    urls = page.evaluate("[...document.querySelectorAll('#dialog [data-u]')].map(b=>b.dataset.u)")
    assert any("pubchem.ncbi.nlm.nih.gov/#query=" in u and "tab=similarity" in u for u in urls)
    assert any(u.startswith("https://www.rcsb.org/search?request=") for u in urls)
    assert any("BSYNRYMUTXBXSQ-UHFFFAOYSA-N" in u for u in urls)


def test_3d_view_generates_conformer_offline(page):
    page.evaluate("tryLoadText('C[C@H](N)C(=O)O'); sel.clear()")
    page.click("#b3d")
    page.wait_for_selector("#v3cv", timeout=20000)
    r = page.evaluate("""(()=>{ const m=v3.model, d=(i,j)=>Math.hypot(m.atoms[i].x-m.atoms[j].x,m.atoms[i].y-m.atoms[j].y,m.atoms[i].z-m.atoms[j].z);
      const zs=m.atoms.map(a=>a.z); return {n:m.atoms.length, cc:m.bonds.filter(b=>m.atoms[b.a].el==='C'&&m.atoms[b.b].el==='C').map(b=>d(b.a,b.b)),
        flat:Math.max(...zs)-Math.min(...zs) < 0.1, smi:OCL.Molecule.fromMolfile(m.mol.toMolfile()).toIsomericSmiles()}; })()""")
    assert r["n"] == 13 and not r["flat"]  # 6 heavy atoms + 7 H, genuinely 3D
    assert all(1.45 < x < 1.6 for x in r["cc"])
    assert r["smi"] == page.evaluate("OCL.Molecule.fromSmiles('C[C@H](N)C(=O)O').toIsomericSmiles()")
    pdb = page.evaluate("(async()=> (await exportData('pdb')).data)()")
    assert pdb.startswith("HEADER") and "CONECT" in pdb


def test_journal_presets_set_bond_length_and_styles(page):
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); sel.clear()")
    mean = "(()=>{ const ls=doc.bonds.map(b=>{const A=ix.atom.get(b.a),B=ix.atom.get(b.b); return Math.hypot(A.x-B.x,A.y-B.y)}); return ls.reduce((a,b)=>a+b,0)/ls.length; })()"
    page.click("#presetSeg [data-p=rsc]")
    assert abs(page.evaluate(mean) - 12.2) < 0.01 and page.evaluate("S().lineWidth") == 0.45 and page.evaluate("S().fontSize") == 7
    assert 'BondLength="12.2' in page.evaluate("FORMATS.write('cdxml', subDoc(null))")
    page.fill("#ov_bondLength", "18"); page.dispatch_event("#ov_bondLength", "change")
    assert abs(page.evaluate(mean) - 18) < 0.01
    page.click("#presetSeg [data-p=nature]")  # a journal style replaces custom settings
    assert abs(page.evaluate(mean) - 10.8) < 0.01 and page.evaluate("doc.styleOv") is None and page.evaluate("S().fontSize") == 6
    page.keyboard.press("Control+z"); page.keyboard.press("Control+z"); page.keyboard.press("Control+z")
    assert abs(page.evaluate(mean) - 14.4) < 0.01 and page.evaluate("doc.style") == "acs"


def test_analysis_dialog_chemdraw_style(page):
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); sel.clear()")
    page.click("#bAddInfo")
    txt = page.inner_text("#anaPrev")
    assert "Chemical Formula: C9H8O4" in txt and "Exact Mass: 180.04" in txt and "Molecular Weight: 180.16" in txt
    assert "Elemental Analysis: C, 60.00; H, 4.48; O, 35.52" in txt and "m/z: 180.04 (100.0%)" in txt
    assert "Anal. Calcd for C9H8O4: C, 60.00; H, 4.48." in page.inner_text("#dialog")
    page.check("[data-ana=logs]")
    assert "LogS:" in page.inner_text("#anaPrev")
    page.click("#anaAdd")
    assert page.evaluate("(()=>{ const t=doc.texts[0], m=textMetrics(doc,t), b=bboxOf(fragPoints(doc.atoms.map(a=>a.id))); return t.y-m.h/2 > b.y1 })()")


def test_enhanced_stereo_groups(page):
    page.evaluate("tryLoadText('C[C@H](O)[C@@H](C)N'); sel.clear(); setTool('select'); fit()")
    x, y = atom_xy(page, "(a)=>a.id===stereoCentres(doc.atoms.map(a=>a.id))[0]")
    page.mouse.click(x, y, button="right")
    page.click("#ctxMenu [data-cmd=stereo]")
    page.click("#dialog [data-stg=and1]")
    assert page.evaluate("doc.atoms.filter(a=>a.stg).map(a=>a.stg)") == ["and1"]
    assert ">&amp;1<" in page.evaluate("cv.innerHTML")
    assert "MDLV30/STERAC1" in page.evaluate("FORMATS.write('molV3', subDoc(null))")
    for fmt in ("cdxml", "cdx"):
        assert page.evaluate(f"normalizeDoc({{...newDoc(),...FORMATS.read('{fmt}',FORMATS.write('{fmt}',subDoc(null)))}}).atoms.filter(a=>a.stg).map(a=>a.stg)") == ["and1"]
    assert page.evaluate("fromOCL(OCL.Molecule.fromMolfile(FORMATS.write('molV3', subDoc(null)))).atoms.filter(a=>a.stg).map(a=>a.stg)") == ["and1"]
    assert page.evaluate("sanitizeDoc({atoms:[{id:1,x:0,y:0,el:'C',stg:'<b>'},{id:2,x:0,y:0,el:'C',stg:'or3'}]}).atoms.map(a=>a.stg??null)") == [None, "or3"]


def test_tlc_plate_insert_edit_export(page):
    page.evaluate("tryLoadText('CC(=O)O'); sel.clear()")
    page.click("#bTlc")
    page.fill("#tlLanes", "SM: 0.6\nco: 0.6, 0.3\nRxn: 0.3, 0.05-0.15")
    page.check("#tlRf")
    page.click("#tlGo")
    q = page.evaluate("doc.plates[0]")
    assert [l["label"] for l in q["lanes"]] == ["SM", "co", "Rxn"]
    assert q["lanes"][2]["spots"][1] == {"rf": 0.05, "to": 0.15, "style": "fill"}
    assert page.evaluate("plateBBox(doc,doc.plates[0]).x0 > bboxOf(fragPoints(doc.atoms.map(a=>a.id))).x1")  # beside the structure
    svg = page.evaluate("exportSVG(subDoc(null),{transparent:true}).svg")
    assert ">0.30<" in svg and ">Rxn<" in svg and "stroke-dasharray" in svg
    assert page.evaluate("PDF.build([exportSVG(subDoc(null),{transparent:true}).svg]).length") > 500
    # double-click edits it
    xy = page.evaluate("(()=>{ const q=doc.plates[0], r=cv.getBoundingClientRect(); return [r.left+q.x*view.z+view.ox, r.top+q.y*view.z+view.oy]; })()")
    page.mouse.dblclick(*xy)
    page.fill("#tlSolv", "EtOAc")
    page.click("#tlGo")
    assert page.evaluate("doc.plates[0].solvent") == "EtOAc" and page.evaluate("doc.plates.length") == 1
    page.keyboard.press("Control+z")
    assert page.evaluate("doc.plates[0].solvent") == "30% EtOAc/hexanes"
    # survives save/load sanitising and copy-paste
    assert page.evaluate("normalizeDoc(JSON.parse(JSON.stringify(doc))).plates.length") == 1
    assert page.evaluate("sanitizeDoc({plates:[{id:1,x:0,y:0,w:1e9,h:-5,lanes:[{label:'<b>x</b>',spots:[{rf:7,style:'evil'}]}]}]}).plates[0].lanes[0].spots[0]") == {"rf": 1, "style": "fill"}


def test_real_double_click_edits_atom_label(page):
    # the first click re-renders the canvas, so the native dblclick event never fired; presses are paired instead
    page.evaluate("tryLoadText('CCO'); sel.clear(); setTool('select'); fit()")
    x, y = atom_xy(page, "(a)=>a.el==='O'")
    page.mouse.dblclick(x, y)
    page.wait_for_selector("#lbIn")
    page.fill("#lbIn", "OMe"); page.click("#lbGo")
    assert page.evaluate("doc.atoms.some(a=>a.el==='OMe')")


def test_analysis_runs_only_on_request(page):
    page.evaluate("window._n=0; const f=analysisFor; analysisFor=(...a)=>{ window._n++; return f(...a); }; 0")  # ending in a value: Playwright would call a returned function
    page.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O'); sel.clear()")
    box = page.locator("#cv").bounding_box()
    page.mouse.click(box["x"] + 100, box["y"] + 100)  # draw a bond
    page.wait_for_timeout(300)
    assert page.evaluate("window._n") == 0, "editing must not run the analysis"
    page.click("#bAnalyze")
    assert page.evaluate("window._n") >= 1 and "C9H8O4" in page.inner_text("#props")
    page.evaluate("tryLoadText('CCO')")
    assert "Press Analyze" in page.inner_text("#scope")
    assert page.evaluate("document.getElementById('props').classList.contains('stale')")


def test_valence_errors_are_marked(page):
    errs = "doc.atoms.map(a=>valenceError(a,ix)).filter(Boolean).map(e=>e.why)"
    page.evaluate("tryLoadText('CC(C)(C)C'); const c=doc.atoms.find(a=>ix.adj.get(a.id).length===4); placeBondFrom(c, nextDir(c), 1, 'none'); changed()")
    assert page.evaluate(errs) == ["C has 5 bonds; at most 4"]
    assert page.is_visible("#valWarn") and "at most 4" in page.inner_text("#valWarn")
    assert 'stroke="#e03131"' in page.evaluate("cv.innerHTML")
    assert "#e03131" not in page.evaluate("exportSVG(subDoc(null),{transparent:true}).svg")  # never exported
    page.click("#valWarn")
    assert page.evaluate("selAtoms().length") == 1
    for smi in ["C[N+](C)(C)C", "CS(=O)(=O)C", "C=C=C", "[CH2]C", "F[P-](F)(F)(F)(F)F"]:
        page.evaluate(f"loadProject(newProject()); tryLoadText('{smi}')")
        assert page.evaluate(errs) == [], smi
    page.keyboard.press("Control+z")
    assert page.is_hidden("#valWarn")


def test_nmr_solving_guide(page):
    page.click("#bGuide")
    assert "DBE = 5" in page.inner_text("#gcFout")
    # wait for each result to update rather than reading it at once (CI machines are slower)
    page.fill("#gcF", "C6H6"); wait_until(page, "document.getElementById('gcFout').innerText.includes('DBE = 4')")
    page.fill("#gc13", "88"); wait_until(page, "document.getElementById('gc13out').innerText.includes('C4H8O2')")
    page.fill("#gcI", "2, 3"); page.fill("#gcIH", "10"); wait_until(page, "document.getElementById('gcIout').innerText.startsWith('4H : 6H')")
    for tab in ["h1", "c13", "split", "aro", "methods", "examples", "sources"]:
        page.click(f"[data-gtab={tab}]")
        assert page.locator("#dialog .tabs [aria-pressed=true]").get_attribute("data-gtab") == tab
    page.click("[data-gtab=split]"); assert "1 : 6 : 15 : 20 : 15 : 6 : 1" in page.inner_text("#dialog")
    page.click("[data-gtab=aro]"); assert "H3: 7.89" in page.inner_text("#gzOut")  # 4'-methoxyacetophenone, Reich increments
    page.click("[data-gtab=examples]"); page.click("#dialog details summary >> nth=0"); page.click("[data-ex='0']")
    assert smiles(page) == page.evaluate("OCL.Molecule.fromSmiles('CCOC(C)=O').toIsomericSmiles()")


def test_renamed_to_lone_pair_and_old_saves_still_load(browser):
    from conftest import _open
    pg = _open(browser, {"width": 1200, "height": 800})
    assert pg.title() == "Lone Pair" and "Lone Pair" in pg.inner_text(".brand")
    assert pg.evaluate("buildProjectHtml()").count("– Lone Pair</title>") == 1
    assert "/Producer (Lone Pair)" in pg.evaluate("new TextDecoder().decode(PDF.build([exportSVG(subDoc(null),{}).svg]))")
    # an autosave written by the app under its old name (same storage keys) is restored on reload
    pg.evaluate("""(()=>{ const p=newProject(); p.name='Old Skeletal work'; p.pages[0].doc.atoms=[{id:1,x:0,y:0,el:'O',charge:0,lp:0,rad:0}]; p.pages[0].doc.nid=2;
      localStorage.setItem('skeletal.p.'+p.uid, JSON.stringify(p)); localStorage.setItem('skeletal.last', p.uid); })()""")
    pg.reload(); pg.wait_for_timeout(600)
    assert pg.evaluate("project.name") == "Old Skeletal work" and pg.evaluate("doc.atoms[0].el") == "O"
    pg.context.close()


def test_octet_error_for_extra_lone_pairs(page):
    # NH(NH2)2 with two lone pairs drawn on the central N: 3 bonds + 2 pairs = 10 electrons
    page.evaluate("""(()=>{ tryLoadText('N(N)N'); const c=doc.atoms.find(a=>ix.adj.get(a.id).length===2);
      const h={id:nid(), x:c.x, y:c.y-14.4, el:'H', charge:0, lp:0, rad:0}; doc.atoms.push(h); doc.bonds.push({id:nid(), a:c.id, b:h.id, order:1, stereo:'none'});
      c.lp=2; changed(); })()""")
    assert page.is_visible("#valWarn") and "10 electrons" in page.inner_text("#valWarn") and "octet" in page.inner_text("#valWarn")
    page.evaluate("doc.atoms.find(a=>a.lp===2).lp=1; changed()")
    assert page.is_hidden("#valWarn")


FAKE_FS = """(()=>{
  // stand-ins for Chrome's file pickers: a handle records what is written to it
  window._picks=0; window._writes=[];
  const mk=(name, content)=>({ name, content, kind:'file',
    async getFile(){ return new File([this.content], this.name); },
    async createWritable(){ const h=this; let buf=''; return { async write(b){ buf += typeof b==='string'? b : await b.text(); }, async close(){ h.content=buf; window._writes.push([h.name, buf.length]); } }; } });
  window._mk=mk; window._saveTarget=mk('my-project.html','');
  window.showSaveFilePicker=async()=>{ window._picks++; return window._saveTarget; };
  window.showOpenFilePicker=async()=>[window._openTarget];
})()"""


def test_ctrl_s_saves_back_to_the_same_file(page):
    page.evaluate(FAKE_FS)
    page.evaluate("tryLoadText('CCO'); project.name='Ethanol study'")
    page.keyboard.press("Control+s")
    wait_until(page, "window._writes.length===1")
    assert page.evaluate("window._picks") == 1 and "Save to my-project.html" in page.inner_text("#bSaveHtml")
    assert page.evaluate("window._saveTarget.content.includes('id=\"sk-project\"')")  # a full, reopenable project file
    page.evaluate("tryLoadText('c1ccccc1')")
    assert "Unsaved changes" in page.inner_text("#fileLink") and page.title().startswith("• my-project.html")
    page.focus("#projName"); page.keyboard.press("Control+s")  # works from inside a text field too
    wait_until(page, "window._writes.length===2")
    assert page.evaluate("window._picks") == 1, "the second save must not ask for a file again"
    assert "All changes saved" in page.inner_text("#fileLink") and page.title() == "my-project.html – Lone Pair"
    page.click("#bSaveHtml"); wait_until(page, "window._writes.length===3")  # panel button uses the same file
    page.click("#bSaveNew"); wait_until(page, "window._picks===2")           # 'Save as new file' asks again


def test_ctrl_o_opens_a_project_and_saves_back_to_it(page):
    page.evaluate(FAKE_FS)
    html = page.evaluate("(()=>{ tryLoadText('CC(=O)O'); project.name='Acetic'; return buildProjectHtml(); })()")
    page.evaluate("(h)=>{ window._openTarget=window._mk('acetic.html', h); loadProject(newProject()); }", html)
    page.keyboard.press("Control+o")
    wait_until(page, "project.name==='Acetic'")
    assert "Save to acetic.html" in page.inner_text("#bSaveHtml")
    page.evaluate("tryLoadText('CCO')"); page.keyboard.press("Control+s")
    wait_until(page, "window._writes.length===1")
    assert page.evaluate("window._picks") == 0 and page.evaluate("window._openTarget.content.includes('Acetic')")
    page.click("#bOpenTop"); wait_until(page, "document.querySelector('#dialog h3') && document.querySelector('#dialog h3').innerText.startsWith('Open')")  # header button; asks before replacing work


def test_save_without_file_access_downloads_a_copy(page):
    page.evaluate("delete window.showSaveFilePicker; delete window.showOpenFilePicker; window.showSaveFilePicker=undefined; window.showOpenFilePicker=undefined; tryLoadText('CCO')")
    with page.expect_download() as dl:
        page.keyboard.press("Control+s")
    assert dl.value.suggested_filename.endswith(".html")
    assert page.is_hidden("#bSaveNew")
