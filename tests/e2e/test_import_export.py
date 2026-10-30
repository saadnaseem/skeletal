"""ChemDraw files open with their meaning and look intact, and image/PDF exports say when they can't do what was asked."""
from conftest import _wait

# an RSC-style ChemDraw document: red O, a hydrogen bond to water, a bracket Lone Pair can't represent
RSC_CDXML = """<?xml version="1.0"?><CDXML BondLength="12.2" LineWidth="0.45" BoldWidth="1.6" BondSpacing="20" HashSpacing="1.75" MarginWidth="1.25" LabelSize="7">
<colortable><color r="1" g="1" b="1"/><color r="0" g="0" b="0"/><color r="0.8196" g="0.1373" b="0.1216"/></colortable>
<page><fragment><n id="1" p="0 0"/><n id="2" p="12.2 0" Element="8" color="4"/><n id="3" p="24.4 0" Element="1"/><n id="4" p="36.6 0" Element="8"/>
<b id="5" B="1" E="2"/><b id="6" B="2" E="3"/><b id="7" B="3" E="4" Order="hydrogen"/></fragment>
<graphic id="8" BoundingBox="-5 -10 -5 10" GraphicType="Bracket"/></page></CDXML>"""


def open_cdxml(page, text, name):
    page.evaluate("([t,n])=>insertForeign(FORMATS.read('cdxml', t), n)", [text, name])


def test_chemdraw_file_keeps_style_colours_and_hydrogen_bonds(page):
    open_cdxml(page, RSC_CDXML, "scheme.cdxml")
    assert page.evaluate("doc.style") == "rsc"
    assert page.evaluate("doc.atoms.find(a=>a.el==='O').color") == "#d1231f"
    assert page.evaluate("doc.bonds.map(b=>b.kind||'-').join()") == "-,-,hbond"
    assert "stroke-dasharray" in page.evaluate("exportSVG(subDoc(null)).svg")
    toast = page.inner_text("#toast")
    assert "Opened scheme.cdxml" in toast and "left out: 1 bracket" in toast
    assert page.get_attribute("#presetSeg button[data-p='rsc']", "aria-pressed") == "true"  # the style panel follows
    # the formula still has its hydrogens: water across the H-bond stays H2O
    assert page.evaluate("(()=>{ const o=doc.atoms.filter(a=>a.el==='O')[1]; return implicitH(o, bondSum(ix,o.id)); })()") == 2
    assert page.errors == []


def test_chemdraw_file_added_to_a_drawing_takes_the_drawings_style(page):
    page.evaluate("tryLoadText('c1ccccc1')")
    assert page.evaluate("doc.style") == "acs"
    open_cdxml(page, RSC_CDXML, "scheme.cdxml")
    assert page.evaluate("doc.style") == "acs"
    # the RSC bonds (12.2 pt) are scaled to this drawing's 14.4 pt bonds
    length = page.evaluate("(()=>{ const b=doc.bonds.find(b=>b.kind==='hbond'), A=ix.atom.get(b.a), B=ix.atom.get(b.b); return Math.hypot(A.x-B.x, A.y-B.y); })()")
    assert abs(length - 14.4) < 0.05


def test_png_export_retries_smaller_when_the_browser_refuses_a_big_canvas(page):
    page.evaluate("tryLoadText('CCO')")
    # like iOS Safari: anything over 16.7 megapixels can't be drawn
    out = page.evaluate("""(async()=>{ makePng.draw=(svg,w,h,t)=> w*h>16.7e6 ? Promise.reject(new Error('canvas too large')) : svgToPngBlob(svg,w,h,t);
      const {blob}=await makePng(subDoc(null), 250, false, null); const bm=await createImageBitmap(blob); return [bm.width*bm.height, makePng.reduced]; })()""")
    assert 0 < out[0] <= 16.7e6 and out[1] > 0


def test_png_export_that_cannot_be_drawn_says_so(page):
    page.evaluate("tryLoadText('CCO')")
    page.evaluate("(async()=>{ makePng.draw=()=>Promise.reject(new Error('no canvas')); await downloadPng(); })()")
    assert "too large for a PNG" in page.inner_text("#toast")


def test_pdf_export_names_characters_it_cannot_show(page):
    page.evaluate("tryLoadText('CCO'); doc.texts.push({id:nid(),x:0,y:-40,text:'∆H in 溶媒, 10⁴ cm⁻¹'}); sel.clear(); changed();")
    with page.expect_download() as dl:
        page.evaluate("exportPdf('page','crop')")
    assert dl.value.suggested_filename.endswith(".pdf")
    _wait(page, "document.querySelector('#toast').textContent.includes('can’t be shown')")
    toast = page.inner_text("#toast")
    assert "溶 媒" in toast and "∆" not in toast and "⁴" not in toast  # ∆, ⁴ and ⁻¹ have stand-ins; only the CJK is lost
