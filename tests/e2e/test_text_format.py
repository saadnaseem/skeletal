"""Subscripts and superscripts in text: typed with Ctrl/⌘ = and Ctrl/⌘ Shift =, the x₂ x² bar, automatic formula subscripts, paste, re-editing and exports."""
import pytest

TEXT = '#tools button[title^="Text"]'
MOD = "Control"  # the editor accepts Ctrl or ⌘ on every platform


def focused(page):
    page.wait_for_selector("#texted:not([hidden])")
    for _ in range(50):
        if page.evaluate("document.activeElement.id") == "texted": return
        page.wait_for_timeout(20)
    raise AssertionError("the text editor did not take the focus")


def new_text(page, x=700, y=400):
    page.click(TEXT)
    page.mouse.click(x, y)
    focused(page)


def stored(page, i=0):
    return page.evaluate(f"doc.texts[{i}] && doc.texts[{i}].text")


def editor_html(page):
    return page.inner_html("#texted")


def runs(page, i=0):
    return page.evaluate(f"textRuns(doc.texts[{i}].text).map(r=>[r.t,r.m])")


def test_type_a_subscript_and_back_with_the_keyboard(page):
    new_text(page)
    page.keyboard.type("pK")
    page.keyboard.press(f"{MOD}+Equal")
    assert page.get_attribute('#tedBar [data-m="sub"]', "aria-pressed") == "true", "the bar shows the subscript is on"
    page.keyboard.type("a")
    page.keyboard.press(f"{MOD}+Equal")
    page.keyboard.type(" = 4.8")
    assert "<sub>a</sub>" in editor_html(page), "the editor shows the subscript as you type"
    page.keyboard.press("Enter")
    assert stored(page) == "pK_{a} = 4.8"
    assert runs(page) == [["pK", "n"], ["a", "sub"], [" = 4.8", "n"]]
    assert page.is_hidden("#texted") and page.is_hidden("#tedBar")


def test_superscript_with_shift(page):
    new_text(page)
    page.keyboard.type("Fe")
    page.keyboard.press(f"{MOD}+Shift+Equal")
    page.keyboard.type("III")
    page.keyboard.press(f"{MOD}+Shift+Equal")
    page.keyboard.type(" complex")
    page.keyboard.press("Enter")
    assert stored(page) == "Fe^{III} complex"


def test_formula_digits_subscript_as_you_type(page):
    new_text(page)
    page.keyboard.type("H2SO4, 80 °C")
    assert editor_html(page).count("<sub data-a=\"\">") == 2, editor_html(page)
    page.keyboard.press("Enter")
    assert stored(page) == "H2SO4, 80 °C", "formula digits are stored plainly, as before"
    assert [r for r in runs(page) if r[1] == "sub"] == [["2", "sub"], ["4", "sub"]]


def test_select_text_and_click_the_bar(page):
    new_text(page)
    page.keyboard.type("SN2 reaction")
    # select the N (characters 1-2) and make it a subscript with the bar; the 2 after it is then normal (S_N2)
    page.evaluate("tedSetSel(1,2)")
    page.click('#tedBar [data-m="sub"]')
    assert page.evaluate("document.activeElement.id") == "texted", "the bar keeps the caret in the text"
    page.keyboard.press("Enter")
    assert stored(page) == "S_{N}2 reaction"
    assert runs(page)[:3] == [["S", "n"], ["N", "sub"], ["2 reaction", "n"]]


def test_toggling_an_automatic_subscript_off_keeps_the_digit_normal(page):
    new_text(page)
    page.keyboard.type("E2")
    page.keyboard.press("Shift+ArrowLeft")
    page.keyboard.press(f"{MOD}+Equal")
    assert "<sub" not in editor_html(page)
    page.keyboard.type("1")  # replaces the selected 2 and stays normal
    page.keyboard.press("Enter")
    assert runs(page) == [["E1", "n"]]
    assert stored(page) == "E\\1"


def test_re_editing_shows_the_formatting_and_an_unchanged_edit_adds_no_undo_step(page):
    page.evaluate("doc.texts.push({id:nid(), x:0, y:0, text:'^13C NMR, SO4^2-'}); changed();")
    n = page.evaluate("undoStack.length")
    page.evaluate("startTextEdit(doc.texts[0])")
    focused(page)
    html = editor_html(page)
    assert "<sup>13</sup>" in html and "<sup>2−</sup>" in html and '<sub data-a="">4</sub>' in html
    page.keyboard.press("End"); page.keyboard.press("Enter")
    assert stored(page) == "^13C NMR, SO4^2-", "the text is kept exactly as written"
    assert page.evaluate("undoStack.length") == n


def test_edit_then_undo_restores_the_old_text(page):
    page.evaluate("doc.texts.push({id:nid(), x:0, y:0, text:'H2O'}); changed();")
    page.evaluate("startTextEdit(doc.texts[0])")
    focused(page)
    page.keyboard.press("End")
    page.keyboard.press(f"{MOD}+Shift+Equal")
    page.keyboard.type("+")
    page.keyboard.press("Enter")
    assert stored(page) == "H2O^{+}"
    page.keyboard.press(f"{MOD}+z")
    assert stored(page) == "H2O"


def test_undo_inside_the_editor_and_backspace_across_a_subscript(page):
    new_text(page)
    page.keyboard.type("pK")
    page.keyboard.press(f"{MOD}+Equal")
    page.keyboard.type("a")
    page.keyboard.press(f"{MOD}+z")  # undoes the a, not the drawing
    assert page.evaluate("tedMarkup()") == "pK"
    page.keyboard.press(f"{MOD}+Equal")
    page.keyboard.type("aH")
    assert page.evaluate("tedMarkup()") == "pK_{aH}"
    page.keyboard.press("Backspace")
    assert page.evaluate("tedMarkup()") == "pK_{a}"
    page.keyboard.press("Backspace"); page.keyboard.press("Backspace")
    assert page.evaluate("tedMarkup()") == "p"
    page.keyboard.press("Escape")
    assert page.evaluate("doc.texts.length") == 0, "Escape on a new text removes it"


def test_shift_enter_makes_a_second_line(page):
    new_text(page)
    page.keyboard.type("CO2")
    page.keyboard.press("Shift+Enter")
    page.keyboard.type("1 atm")
    page.keyboard.press("Enter")
    assert stored(page) == "CO2\n1 atm"
    assert page.evaluate("textMetrics(doc, doc.texts[0]).lines.length") == 2


@pytest.mark.parametrize("html,plain,want", [
    ("<p>H<sub>2</sub>SO<sub>4</sub> in Et<sub>2</sub>O</p>", "H2SO4 in Et2O", "H2SO4 in Et2O"),
    ('<span>K</span><span style="vertical-align:sub">a</span>', "Ka", "K_{a}"),
    ("<b>Pd<sup>II</sup></b>", "PdII", "Pd^{II}"),
    ("", "ν 1720 cm⁻¹, H₂O", "ν 1720 cm^{-1}, H2O"),
    ("", "Fe^{III}", "Fe^{III}"),
])
def test_paste_keeps_subscripts_and_superscripts(page, html, plain, want):
    new_text(page)
    page.evaluate("""([h,p])=>{ const dt=new DataTransfer(); if (h) dt.setData('text/html',h); dt.setData('text/plain',p);
      document.getElementById('texted').dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt, bubbles:true, cancelable:true})); }""", [html, plain])
    page.keyboard.press("Enter")
    assert stored(page) == want
    assert page.evaluate("doc.atoms.length") == 0, "pasting into text does not paste a structure"


def test_exports_draw_the_formatting_not_the_markup(page):
    page.evaluate("doc.texts.push({id:nid(), x:0, y:0, text:'pK_{a} 4.8, Fe^{III}, S_{N}2'}); changed();")
    svg = page.evaluate("exportSVG(doc).svg")
    assert "_{" not in svg and "^{" not in svg
    assert 'font-size' in svg and '>a</tspan>' in svg and '>III</tspan>' in svg
    cdxml = page.evaluate("FORMATS.write('cdxml', doc)")
    assert 'face="32"' in cdxml and 'face="64"' in cdxml
    assert page.evaluate("FORMATS.read('cdxml', FORMATS.write('cdxml', doc)).texts[0].text") == "pK_{a} 4.8, Fe^{III}, S_{N}2"
    pdf_ok = page.evaluate("(async()=>{ const b=await PDF.build([exportSVG(doc).svg]); return b.length>500; })()")
    assert pdf_ok


def test_typing_on_a_phone_sized_screen(mobile):
    page = mobile
    page.evaluate("setTool('text')")
    page.evaluate("doc.texts.push({id:nid(), x:0, y:0, text:''}); changed(); startTextEdit(doc.texts[0], true)")
    focused(page)
    page.keyboard.type("CH3")
    page.tap('#tedBar [data-m="sup"]')
    page.keyboard.type("+")
    page.keyboard.press("Enter")
    assert page.evaluate("doc.texts[0].text") == "CH3^{+}"


def test_text_panel_buttons_work_while_typing_and_on_a_selected_text(page):
    # while typing: the panel's x₂ works like Ctrl/⌘ = and keeps the caret in the text
    new_text(page)
    page.keyboard.type("pK")
    page.click("#tSub")
    assert page.get_attribute("#tSub", "aria-pressed") == "true"
    assert page.evaluate("document.activeElement.id") == "texted"
    page.keyboard.type("a")
    page.keyboard.press("Enter")
    assert stored(page) == "pK_{a}"
    # not typing: x² makes the whole selected text a superscript, and again turns it back
    page.evaluate("doc.texts.push({id:nid(), x:0, y:80, text:'‡'}); sel=new Set(['t'+doc.texts[1].id]); changed();")
    page.click("#tSup")
    assert stored(page, 1) == "^{‡}"
    assert page.get_attribute("#tSup", "aria-pressed") == "true"
    page.click("#tSup")
    assert stored(page, 1) == "‡"
    # nothing selected: a hint, no change
    page.evaluate("sel.clear(); changed();")
    page.click("#tSub")
    assert [stored(page, 0), stored(page, 1)] == ["pK_{a}", "‡"]
