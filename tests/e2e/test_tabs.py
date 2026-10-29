"""Several tabs of the editor in one browser: each tab works on its own project, and none overwrites another's autosave."""
from conftest import URL, DIST, _wait

READY = "typeof OCL !== 'undefined' && document.querySelectorAll('#tools .tool').length > 0"


def tab(ctx, session=None):
    """A new tab in the same browser profile. session: sessionStorage to start with (what Duplicate tab copies)."""
    pg = ctx.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)
    if session:
        pg.add_init_script("(s=>{ if (!sessionStorage.getItem('lonepair.dup')){ sessionStorage.setItem('lonepair.dup','1'); for (const [k,v] of Object.entries(s)) sessionStorage.setItem(k,v); } })(%s)" % session)
    pg.goto(URL or DIST.as_uri()); _wait(pg, READY)
    return pg


def reload(pg):
    pg.reload(); _wait(pg, READY)


def state(pg):
    return pg.evaluate("[project.uid, project.name, doc.atoms.length]")


def draw(pg, smi, name):
    pg.evaluate(f"pushUndo(); setDoc({{...newDoc(), style:doc.style}}); tryLoadText('{smi}'); project.name='{name}'; saveNow()")


def ctx_for(browser):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900})
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    return ctx


def test_each_tab_has_its_own_project(browser):
    ctx = ctx_for(browser)
    a = tab(ctx); draw(a, "c1ccccc1", "Benzene")
    b = tab(ctx)
    assert state(b)[2] == 0 and state(b)[0] != state(a)[0], "a new tab must not reopen the project another tab has open"
    _wait(b, "document.getElementById('toast').innerText.includes('open in another tab')")
    draw(b, "CCO", "Ethanol")
    reload(a); reload(b)  # each tab keeps its own drawing across reloads
    assert state(a)[1:] == ["Benzene", 6] and state(b)[1:] == ["Ethanol", 3]
    # Benzene is listed in tab B as open elsewhere, so it can't be opened twice
    b.evaluate("renderRecent()"); _wait(b, "document.querySelector('#rlist').innerText.includes('Benzene')")
    assert "open in another tab" in b.inner_text("#rlist") and b.locator("#rlist [data-ro]").count() == 0
    assert a.errors == [] and b.errors == [], a.errors + b.errors
    ctx.close()


def test_duplicated_tab_gets_a_separate_copy(browser):
    ctx = ctx_for(browser)
    a = tab(ctx); draw(a, "c1ccccc1O", "Phenol")
    dup = tab(ctx, session=a.evaluate("JSON.stringify({...sessionStorage})"))  # Duplicate tab copies sessionStorage
    uid_a, uid_d = state(a)[0], state(dup)[0]
    assert uid_d != uid_a and state(dup)[1:] == ["Phenol (copy)", 7]
    draw(dup, "c1ccccc1OC", "Anisole")
    reload(a); reload(dup)
    assert state(a) == [uid_a, "Phenol", 7] and state(dup) == [uid_d, "Anisole", 8]
    ctx.close()


def test_closed_tab_project_can_be_reopened(browser):
    ctx = ctx_for(browser)
    a = tab(ctx); draw(a, "CC(=O)O", "Acetic acid")
    b = tab(ctx); assert state(b)[2] == 0
    a.close()
    b.evaluate("renderRecent()"); _wait(b, "document.querySelector('#rlist [data-ro]') !== null")
    b.click("#rlist [data-ro]"); _wait(b, "project.name === 'Acetic acid'")
    assert state(b)[1:] == ["Acetic acid", 4]
    # a fresh tab now gets a new project, because tab B has Acetic acid open
    c = tab(ctx); assert state(c)[2] == 0
    # with every tab closed, a new tab restores the last project, as before
    b.close(); c.close()
    d = tab(ctx); assert state(d)[1:] == ["Acetic acid", 4]
    ctx.close()


def test_opening_a_file_that_is_open_in_another_tab_makes_a_copy(browser):
    ctx = ctx_for(browser)
    a = tab(ctx); draw(a, "CCN", "Ethylamine")
    saved = a.evaluate("JSON.stringify(project)")
    b = tab(ctx)
    b.evaluate(f"confirmOpenProject(JSON.parse({saved!r}), null)")
    _wait(b, "project.name === 'Ethylamine (copy)'")
    assert state(b)[0] != state(a)[0]
    ctx.close()


def test_recent_project_can_be_removed(browser):
    ctx = ctx_for(browser)
    a = tab(ctx); draw(a, "CCCl", "Chloroethane")
    a.click("#bNew"); _wait(a, "document.querySelector('#rlist').innerText.includes('Chloroethane')")
    a.click("#rlist [data-rd]"); a.click("#rdGo")
    _wait(a, "!document.querySelector('#rlist').innerText.includes('Chloroethane')")
    assert not a.evaluate("storedProjects().some(r=>r.name==='Chloroethane')")
    ctx.close()
