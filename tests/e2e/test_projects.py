"""Projects across tabs: each tab edits its own project, every project with content is kept in the browser's project
library, and earlier projects reopen from the Projects dialog. Pages in one Playwright context share storage, like
tabs in one browser."""
from conftest import _wait

READY = "window.libReady===true"


def tab(page):
    """Another tab of the same browser (same storage), opened on the app."""
    pg = page.context.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    pg.goto(page.url.split("#")[0]); _wait(pg, READY)
    return pg


def draw(pg, smiles, name):
    """Replace the current page with one structure, name the project, and autosave now."""
    pg.evaluate(f"(async()=>{{ setDoc(newDoc()); tryLoadText('{smiles}'); project.name='{name}'; $('#projName').value='{name}'; await saveNow(); }})()")


def reload(pg):
    pg.reload(); _wait(pg, READY)


def library(pg):
    return pg.evaluate("projectStore.list().then(l=>l.map(m=>m.name))")


def test_new_tab_starts_blank(page):
    _wait(page, READY)
    draw(page, "CCO", "Ethanol")
    t2 = tab(page)
    assert t2.evaluate("doc.atoms.length") == 0 and t2.evaluate("project.name") == "Untitled project"
    assert t2.evaluate("project.uid") != page.evaluate("project.uid")
    assert page.evaluate("doc.atoms.length") == 3
    assert t2.errors == []


def test_reload_reopens_this_tabs_project(page):
    _wait(page, READY)
    draw(page, "CCO", "Ethanol")
    uid = page.evaluate("project.uid")
    reload(page)
    assert page.evaluate("project.uid") == uid and page.evaluate("doc.atoms.length") == 3 and page.evaluate("project.name") == "Ethanol"


def test_two_tabs_never_overwrite_each_other(page):
    _wait(page, READY)
    t2 = tab(page)
    draw(page, "CCO", "Ethanol")
    draw(t2, "c1ccccc1", "Benzene")
    draw(page, "CCOC", "Ethyl methyl ether")  # edit tab 1 after tab 2 saved
    reload(page); reload(t2)
    assert page.evaluate("[project.name, doc.atoms.length]") == ["Ethyl methyl ether", 4]
    assert t2.evaluate("[project.name, doc.atoms.length]") == ["Benzene", 6]
    assert sorted(library(page)) == ["Benzene", "Ethyl methyl ether"]


def test_blank_tabs_add_nothing_to_the_library(page):
    _wait(page, READY)
    t2 = tab(page)
    page.evaluate("saveNow()"); t2.evaluate("saveNow()")
    reload(page)
    assert library(page) == []


def test_projects_dialog_lists_and_reopens_earlier_projects(page):
    _wait(page, READY)
    draw(page, "CCO", "First")
    page.click("#bNew")  # no "you won't be able to reopen" warning: First stays in the library
    _wait(page, "doc.atoms.length===0")
    assert not page.is_visible("#modal.open")
    draw(page, "c1ccccc1", "Second")
    page.click("#bProjects")
    _wait(page, "document.querySelectorAll('#plist li[data-uid]').length===2")
    assert page.eval_on_selector_all("#plist li[data-uid] .pn", "els=>els.map(e=>e.textContent)") == ["Second", "First"]
    assert page.locator("#plist li.current").count() == 1  # the open project is marked, and can't be deleted from here
    page.click("#plist li:not(.current) [data-open]")
    _wait(page, "project.name==='First'")
    assert page.evaluate("doc.atoms.length") == 3
    # the recent list in the panel shows both too
    _wait(page, "document.querySelectorAll('#recent li[data-uid]').length===2")
    # delete Second
    page.click("#bProjects"); _wait(page, "document.querySelectorAll('#plist li[data-uid]').length===2")
    page.click("#plist li:not(.current) [data-del]"); page.click("#plDelGo")
    _wait(page, "projectStore.list().then(l=>l.length===1)")
    assert library(page) == ["First"]


def test_opening_a_project_held_by_another_tab_offers_a_copy(page):
    _wait(page, READY)
    draw(page, "CCO", "Shared")
    uid = page.evaluate("project.uid")
    t2 = tab(page)
    t2.click("#bProjects"); _wait(t2, "document.querySelectorAll('#plist li[data-uid]').length===1")
    t2.click("#plist [data-open]")
    _wait(t2, "!!document.querySelector('#plCopy')")
    assert "open in another tab" in t2.inner_text("#dialog")
    t2.click("#plCopy")
    _wait(t2, "project.name==='Shared (copy)'")
    assert t2.evaluate("project.uid") != uid and t2.evaluate("doc.atoms.length") == 3
    assert page.evaluate("project.uid") == uid  # tab 1 keeps the original


def test_duplicated_tab_gets_a_copy(page):
    _wait(page, READY)
    draw(page, "CCO", "Dup")
    uid = page.evaluate("project.uid")
    t2 = tab(page)
    t2.evaluate(f"sessionStorage.setItem('lonepair.tab', '{uid}')")  # what Duplicate Tab copies over
    reload(t2)
    assert t2.evaluate("project.uid") != uid and t2.evaluate("project.name") == "Dup (copy)" and t2.evaluate("doc.atoms.length") == 3


def test_old_autosaves_move_into_the_library(page):
    _wait(page, READY)
    page.evaluate("""(()=>{ const mk=(name,el,t)=>{ const p=newProject(); p.name=name; p.modified=t; p.pages[0].doc.atoms=[{id:1,x:0,y:0,el,charge:0,lp:0,rad:0}]; p.pages[0].doc.nid=2; return p; };
      const a=mk('Older',  'N', 1000), b=mk('Latest', 'O', 2000);
      for (const p of [a,b]) localStorage.setItem('skeletal.p.'+p.uid, JSON.stringify(p));
      localStorage.setItem('skeletal.last', b.uid); sessionStorage.clear(); })()""")
    reload(page)
    assert page.evaluate("[project.name, doc.atoms[0].el]") == ["Latest", "O"]  # the last one opens once, so nothing looks lost
    assert sorted(library(page)) == ["Latest", "Older"]
    assert page.evaluate("Object.keys(localStorage).filter(k=>k.startsWith('skeletal.p.')||k==='skeletal.last')") == []
    assert tab(page).evaluate("doc.atoms.length") == 0  # later tabs start blank


def test_quota_failure_warns_and_keeps_other_projects(page):
    _wait(page, READY)
    draw(page, "CCO", "Keep me")
    page.click("#bNew")
    page.evaluate("""(async()=>{ const real=projectStore.put; projectStore.put=()=>Promise.reject(Object.assign(new Error('full'),{name:'QuotaExceededError'}));
      tryLoadText('c1ccccc1'); await saveNow(); projectStore.put=real; })()""")
    assert "isn’t being saved" in page.inner_text("#toast")
    assert library(page) == ["Keep me"]


def test_closing_the_tab_right_after_an_edit_keeps_it(page):
    _wait(page, READY)
    page.evaluate("(async()=>{ tryLoadText('CCO'); project.name='Quick'; await saveNow(); })()")
    uid = page.evaluate("project.uid")
    t2 = tab(page)
    # an edit, then the tab goes away before the autosave delay; the IndexedDB write is blocked to mimic it being cut off
    page.evaluate("(()=>{ tryLoadText('c1ccccc1'); projectStore.put=()=>new Promise(()=>{}); window.dispatchEvent(new Event('pagehide')); })()")
    page.close()
    t2.evaluate(f"sessionStorage.setItem('lonepair.tab', '{uid}')")
    reload(t2)
    assert t2.evaluate("[project.name, doc.atoms.length]") == ["Quick", 9]
