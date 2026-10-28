"""Browser tests for dist/skeletal.html (run `npm run build` first)."""
import pathlib, pytest
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
DIST = ROOT / "dist" / "skeletal.html"


@pytest.fixture(scope="session")
def browser():
    if not DIST.exists():
        pytest.exit("dist/skeletal.html not found; run `npm run build` first", returncode=2)
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


def _open(browser, viewport, **kw):
    ctx = browser.new_context(viewport=viewport, **kw)
    page = ctx.new_page()
    page.errors = []
    page.on("pageerror", lambda e: page.errors.append(str(e)))
    page.on("console", lambda m: page.errors.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())  # keep tests offline
    page.goto(DIST.as_uri())
    page.wait_for_function("typeof OCL !== 'undefined' && document.querySelectorAll('#tools .tool').length > 0")
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
        pg.goto(url); pg.wait_for_function("typeof OCL !== 'undefined'")
        made.append(ctx); return pg
    yield make
    for c in made: c.close()
