"""Edge cases found by exploratory testing: multi-record SD files, odd Insert input, salts, isotope labels, phone toolbars."""
import json


def insert(page, text, wait=600):
    page.click("#bSmiles"); page.fill("#smIn", text); page.click("#smGo"); page.wait_for_timeout(wait)


def test_sd_file_opens_every_record(page, tmp_path):
    mols = page.evaluate("['CCO','c1ccccc1','CC(=O)O'].map(s=>{ const m=OCL.Molecule.fromSmiles(s); m.inventCoordinates(); return m.toMolfile(); })")
    f = tmp_path / "three.sdf"; f.write_text("".join(m + "\n$$$$\n" for m in mols))
    page.set_input_files("#fileIn", str(f)); page.wait_for_timeout(600)
    assert page.evaluate("doc.atoms.length") == 3 + 6 + 4
    assert page.evaluate("components(doc, ix).length") == 3
    assert "Opened 3 structures" in page.inner_text("#toast")
    # the app's own SD export of a two-structure page reads back whole
    sdf = page.evaluate("FORMATS.write('sdf', doc)")
    page.evaluate("doc.atoms=[]; doc.bonds=[]; changed()")
    assert page.evaluate("t=>tryLoadText(t)", sdf)
    assert page.evaluate("components(doc, ix).length") == 3


def test_insert_rejects_empty_reaction_and_oversized_smiles(page):
    page.route("**/pubchem.ncbi.nlm.nih.gov/**", lambda r: r.abort())  # offline: no name lookup either
    insert(page, ">>")
    assert page.evaluate("doc.arrows.length") == 0, "a lone arrow is not inserted"
    assert "valid SMILES" in page.inner_text("#smErr")
    page.keyboard.press("Escape")
    insert(page, "C" * 3500, wait=200)
    assert "can draw up to 3,000" in page.inner_text("#smErr")
    assert page.evaluate("doc.atoms.length") == 0


def test_mass_spectrum_of_a_salt_shows_the_organic_ion_and_says_so(page):
    page.evaluate("tryLoadText('[Na+].CC(=O)[O-]')")
    page.click("#bMs"); page.wait_for_timeout(300)
    text = page.inner_text("#dialog")
    assert "C2H3O2" in text.replace("\n", "")
    assert "largest of 2 structures" in text


def test_isotope_labels_reach_the_mass_spectrum(page):
    page.evaluate("tryLoadText('[2H]C([2H])([2H])C(=O)C([2H])([2H])[2H]')")
    page.click("#bMs"); page.wait_for_timeout(300)
    text = page.inner_text("#dialog")
    assert "C3D6O" in text and "64.0795" in text, "acetone-d6 formula and monoisotopic mass"
    page.keyboard.press("Escape")
    page.click("#bNmr"); page.wait_for_timeout(500)
    assert "No ¹H" in page.inner_text("#dialog") or page.evaluate("NMR.predict(toOCL(doc, ix, null, {skipH:true}).mol).H1.length") == 0


def test_typed_d_label_is_deuterium(page):
    page.evaluate("tryLoadText('CC(=O)C')")
    page.evaluate("const a=doc.atoms[0]; setLabel(a, typedLabel('D', a)); changed()")
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[0].iso]") == ["H", 2]
    assert page.evaluate("atomSymbol(doc.atoms[0])") == "D"
    page.evaluate("const a=doc.atoms[0]; setLabel(a, typedLabel('C', a)); changed()")
    assert page.evaluate("[doc.atoms[0].el, doc.atoms[0].iso ?? null]") == ["C", None]


def test_phone_toolbars_keep_full_size_buttons_and_show_there_is_more(mobile):
    sizes = mobile.evaluate("['#bUndo','#bRedo'].map(s=>{ const r=document.querySelector(s).getBoundingClientRect(); return [r.width, r.height]; })")
    assert all(w >= 40 and h >= 40 for w, h in sizes), sizes
    assert mobile.evaluate("document.querySelector('nav.tools').classList.contains('more-r')")
    assert mobile.evaluate("document.querySelector('header.top').classList.contains('more-r')")
    mobile.evaluate("const t=document.querySelector('nav.tools'); t.scrollLeft=t.scrollWidth")
    mobile.wait_for_timeout(100)
    cls = mobile.evaluate("[...document.querySelector('nav.tools').classList]")
    assert "more-l" in cls and "more-r" not in cls, json.dumps(cls)
