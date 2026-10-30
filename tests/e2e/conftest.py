"""Browser tests for dist/lonepair.html (run `npm run build` first)."""
import os, pathlib, pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / "dist" / "lonepair.html"
# LONEPAIR_URL runs the suite against a served copy instead (e.g. scripts/serve_site.py, which applies the Pages headers)
URL = os.environ.get("LONEPAIR_URL")


@pytest.fixture(scope="session")
def browser():
    if not URL and not DIST.exists():
        pytest.exit("dist/lonepair.html not found; run `npm run build` first", returncode=2)
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _wait(page, expr, timeout=20000):
    # page.evaluate, not wait_for_function: its polling uses eval(), which the hosted site's CSP blocks
    for _ in range(timeout // 100):
        if page.evaluate(expr): return
        page.wait_for_timeout(100)
    raise AssertionError(f"timed out waiting for {expr}")


def _open(browser, viewport, **kw):
    ctx = browser.new_context(viewport=viewport, **kw)
    page = ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())  # keep tests offline
    page.goto(URL or DIST.as_uri())
    _wait(page, "typeof OCL !== 'undefined' && document.querySelectorAll('#tools .tool').length > 0 && window.libReady === true")
    return page


@pytest.fixture
def page(browser):
    pg = _open(browser, {"width": 1400, "height": 900})
    yield pg
    assert pg.errors == [], f"console errors: {pg.errors}"
    pg.context.close()


@pytest.fixture
def mobile(browser):
    pg = _open(browser, {"width": 390, "height": 800}, has_touch=True, is_mobile=True)
    yield pg
    pg.context.close()


@pytest.fixture
def open_page(browser):
    """Factory for extra pages, e.g. to reopen a saved file."""
    made = []
    def make(url):
        ctx = browser.new_context(viewport={"width": 1200, "height": 800})
        pg = ctx.new_page(); pg.errors = []
        pg.on("pageerror", lambda e: pg.errors.append(str(e)))
        pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
        pg.goto(url); _wait(pg, "typeof OCL !== 'undefined' && window.libReady === true")
        made.append(ctx); return pg
    yield make
    for c in made: c.close()
