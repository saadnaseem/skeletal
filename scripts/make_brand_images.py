"""Draws the link-preview card and app icons in assets/ from the Lone Pair logo (pyridine, its nitrogen's lone pair in blue).
Run after changing the logo: python scripts/make_brand_images.py (needs Playwright: pip install -r requirements-dev.txt).
build_pages.mjs copies the PNGs into site/."""
import pathlib
from playwright.sync_api import sync_playwright

OUT = pathlib.Path(__file__).resolve().parents[1] / "assets"
INK, ACCENT, SOFT = "#18212b", "#2459a8", "#56626f"
# the logo in a 32-unit box, as in the favicon (src/shell.html)
MARK = f'''<path d="M20.2 10.8L24.7 13.4L24.7 23.4L16 28.4L7.3 23.4L7.3 13.4L11.8 10.8M19.2 13L21.2 14.2M21.2 22.6L17 25M9.8 20.8L9.8 16" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
<text x="16" y="11.5" text-anchor="middle" font-size="8.6" font-weight="700" fill="{INK}" font-family="Arial, Helvetica, sans-serif">N</text>
<circle cx="14" cy="3" r="1.5" fill="{ACCENT}"/><circle cx="18" cy="3" r="1.5" fill="{ACCENT}"/>'''


def icon(size, radius):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="{size}" height="{size}">
<rect width="32" height="32" rx="{radius}" fill="#ffffff"/><g transform="translate(16 16) scale(.86) translate(-16 -16.6)">{MARK}</g></svg>'''


# faint benzoic acid and a curly arrow behind the text, drawn like the editor's ACS style
DECOR = '''<g fill="none" stroke="#18212b" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".09">
<path d="M930 120L982 150V210L930 240L878 210V150Z"/>
<path d="M930 131L972.6 155.4M972.6 204.6L930 229.2M887.4 204.6V155.4"/>
<path d="M982 150L1034 120L1080 146.5M1029 117V70M1039 117V70"/>
<path d="M820 470C860 400 960 400 1000 450"/><path d="M1013 467l-24-5 15-17z" fill="#18212b"/></g>
<g fill="#18212b" opacity=".09" font-family="Arial, Helvetica, sans-serif" font-size="30" text-anchor="middle"><text x="1034" y="62">O</text><text x="1108" y="161">OH</text></g>'''

CARD = f'''<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:1200px;height:630px;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:{INK}}}
.wrap{{position:absolute;inset:0;overflow:hidden;background:linear-gradient(135deg,#ffffff 0%,#f3f5f7 100%)}}
.bar{{position:absolute;left:0;top:0;bottom:0;width:14px;background:{ACCENT}}}
.decor{{position:absolute;inset:0}}
.logo{{position:absolute;left:92px;top:150px;width:220px;height:220px;border-radius:44px;overflow:hidden;background:#fff;box-shadow:0 10px 40px rgba(24,33,43,.12)}}
.text{{position:absolute;left:360px;top:152px;right:80px}}
h1{{margin:0;font-size:104px;line-height:1;letter-spacing:-2px;font-weight:700}}
.tag{{margin-top:26px;font-size:38px;line-height:1.25;color:{SOFT}}}
.url{{position:absolute;left:92px;bottom:64px;font-size:30px;font-weight:700;color:{ACCENT};letter-spacing:.5px}}
.feat{{position:absolute;right:80px;bottom:66px;font-size:25px;color:{SOFT}}}
</style></head><body><div class="wrap"><div class="bar"></div>
<svg class="decor" viewBox="0 0 1200 630" width="1200" height="630">{DECOR}</svg>
<div class="logo">{icon(220, 0)}</div>
<div class="text"><h1>Lone Pair</h1><div class="tag">Chemical structure editor for<br>publication-quality figures</div></div>
<div class="url">lonepair.app</div><div class="feat">Free &middot; In the browser &middot; ChemDraw export &middot; NMR &amp; MS</div>
</div></body></html>'''


def main():
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1200, "height": 630})
        pg.set_content(CARD); pg.screenshot(path=str(OUT / "og-image.png"))
        for name, size, radius in [("apple-touch-icon.png", 180, 0), ("icon-512.png", 512, 7), ("icon-192.png", 192, 7), ("favicon-32.png", 32, 7)]:
            pg = b.new_page(viewport={"width": size, "height": size})
            pg.set_content(f'<html><body style="margin:0;background:transparent">{icon(size, radius)}</body></html>')
            pg.screenshot(path=str(OUT / name), omit_background=True, clip={"x": 0, "y": 0, "width": size, "height": size})
        b.close()
    print("wrote", ", ".join(sorted(f.name for f in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
