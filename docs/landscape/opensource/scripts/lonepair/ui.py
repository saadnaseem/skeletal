"""Section B/C/E checks on Lone Pair through the real UI (mouse, keyboard) where possible."""
import json, sys, pathlib
from playwright.sync_api import sync_playwright
DIST = sys.argv[1]
out = {}

def W(page, expr, n=100):
    for _ in range(n):
        if page.evaluate(expr): return True
        page.wait_for_timeout(100)
    return False

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={"width": 1400, "height": 900})
    page = ctx.new_page(); errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    page.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    page.goto(pathlib.Path(DIST).resolve().as_uri()); W(page, "typeof tryLoadText==='function' && document.querySelectorAll('#tools .tool').length")
    clear = "setDoc(newDoc()); sel.clear(); changed(); document.querySelector('#toast').textContent=''"

    # A19: invalid input, not quiet: what does the user see?
    for s in ["xyz", "C1CC", "c1cccc1", "C(C)(C)(C)(C)C"]:
        page.evaluate(clear); r = page.evaluate("s=>tryLoadText(s)", s); page.wait_for_timeout(150)
        out["A19 " + s] = {"returned": r, "toast": page.inner_text("#toast"), "atoms": page.evaluate("doc.atoms.length"), "radicals": page.evaluate("doc.atoms.filter(a=>a.rad).length")}
    # paste path (what a user does)
    page.evaluate(clear)
    page.evaluate("""s=>{const dt=new DataTransfer(); dt.setData('text/plain',s); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));}""", "xyz")
    page.wait_for_timeout(200); out["A19 paste xyz"] = page.inner_text("#toast")
    page.evaluate(clear)
    page.evaluate("""s=>{const dt=new DataTransfer(); dt.setData('text/plain',s); document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true}));}""", "c1cccc1")
    page.wait_for_timeout(200); out["A19 paste c1cccc1"] = {"toast": page.inner_text("#toast"), "radicals": page.evaluate("doc.atoms.filter(a=>a.rad).length")}

    # B4: pentavalent carbon: what does the editor show?
    page.evaluate(clear); page.evaluate("tryLoadText('C(C)(C)(C)C', true)")
    out["B4 neopentane formula"] = page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula")
    # add a 5th bond to the centre via the model API the tools use
    c5 = page.evaluate("""(()=>{ const c=doc.atoms.find(a=>doc.bonds.filter(b=>b.a===a.id||b.b===a.id).length===4); pushUndo(); const n={id:nid(),el:'C',x:c.x+L,y:c.y+L,charge:0,lp:0,rad:0}; doc.atoms.push(n); doc.bonds.push({id:nid(),a:c.id,b:n.id,order:1,stereo:'none'}); changed();
        const svg=exportSVG(subDoc(null)).svg; return {formula: (()=>{try{return analysisFor(doc.atoms.map(a=>a.id)).formula}catch(e){return 'ERR '+e.message}})(), flaggedRed: /#d1231f|#e00|red|#c00/i.test(svg), problems: document.querySelector('#props')?.innerText.slice(0,200)}; })()""")
    out["B4 pentavalent C"] = c5

    # B8: undo/redo 20 steps returns to same state
    page.evaluate(clear); page.evaluate("tryLoadText('c1ccccc1', true)")
    s0 = page.evaluate("JSON.stringify(doc.atoms.map(a=>[a.el,a.x.toFixed(2),a.y.toFixed(2)]))")
    for i in range(20): page.evaluate("tryLoadText('C', true)")
    for i in range(20): page.keyboard.press("Meta+z")
    s1 = page.evaluate("JSON.stringify(doc.atoms.map(a=>[a.el,a.x.toFixed(2),a.y.toFixed(2)]))")
    for i in range(20): page.keyboard.press("Meta+Shift+z")
    out["B8 undo/redo"] = {"undo_back_to_start": s0 == s1, "atoms_after_redo": page.evaluate("doc.atoms.length")}

    # B6: OMe drawn leftwards flips
    page.evaluate(clear); page.evaluate("tryLoadText('c1ccccc1OC', true)")
    out["B5 nickname formula (anisole)"] = page.evaluate("analysisFor(doc.atoms.map(a=>a.id)).formula")

    # C7 InChIKey through the UI's exporter for alanine drawn by SMILES
    page.evaluate(clear); page.evaluate("tryLoadText('C[C@H](N)C(=O)O', true)")
    out["C7 alanine key"] = page.evaluate("(async()=> (await exportData('inchikey')).data.trim())()")
    # flip the drawing (mirror) and check the stereo follows the picture
    out["B7 flip changes enantiomer"] = page.evaluate("""(()=>{ const before=analysisFor(doc.atoms.map(a=>a.id)).smiles; sel.clear(); doc.atoms.forEach(a=>sel.add('a'+a.id));
        const fn=['flipH','flipHorizontal','flip'].find(f=>typeof window[f]==='function'); if(!fn) return 'no flip fn found';
        try{ window[fn]('h'); }catch(e){ try{ window[fn](); }catch(e2){ return 'flip threw '+e2.message; } }
        const after=analysisFor(doc.atoms.map(a=>a.id)).smiles; return {fn, before, after}; })()""")
    # D3 CIP: is R/S shown anywhere?
    page.evaluate("analyzeNow && analyzeNow()")
    out["D3 R/S shown in analysis"] = "(S)" in page.inner_text("#props") or " S" in page.inner_text("#props")

    # E4: phone width, no horizontal scroll
    m = b.new_context(viewport={"width": 390, "height": 800}, is_mobile=True, has_touch=True).new_page()
    m.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    m.goto(pathlib.Path(DIST).resolve().as_uri()); W(m, "typeof tryLoadText==='function'")
    out["E4 mobile"] = m.evaluate("({scrollW: document.documentElement.scrollWidth, w: innerWidth, tools: document.querySelectorAll('#tools .tool').length})")
    m.screenshot(path=str(pathlib.Path(DIST).parent / "../../.lp-mobile.png")) if False else None

    # E7: buttons without accessible names
    out["E7 unnamed buttons"] = page.evaluate("""[...document.querySelectorAll('button')].filter(b=>b.offsetParent && !(b.getAttribute('aria-label')||b.title||b.textContent.trim())).length""")
    out["E7 total visible buttons"] = page.evaluate("[...document.querySelectorAll('button')].filter(b=>b.offsetParent).length")
    # E6 page weight / load
    out["E6 load ms"] = page.evaluate("Math.round(performance.getEntriesByType('navigation')[0].loadEventEnd)")
    out["errors"] = errs
    b.close()
print(json.dumps(out, indent=1, ensure_ascii=False))
