"""Serve site/ locally with the headers from site/_headers, the way Cloudflare Pages applies them.
Usage: python scripts/serve_site.py [port]   (then open http://localhost:PORT/, or run the browser tests with
LONEPAIR_URL=http://localhost:PORT/ python -m pytest tests/e2e)"""
import http.server, pathlib, sys
SITE = pathlib.Path(__file__).resolve().parents[1] / "site"

def parse_headers():
    rules, cur = [], None
    for line in (SITE / "_headers").read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("#"): continue
        if not line[0].isspace(): cur = (line.strip(), []); rules.append(cur)
        else: k, v = line.strip().split(":", 1); cur[1].append((k.strip(), v.strip()))
    return rules

def matches(pattern, path):
    return path.startswith(pattern[:-1]) if pattern.endswith("*") else path == pattern

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=str(SITE), **k)
    def do_GET(self):
        # stand-in for the Pages Functions when sign-in isn't configured (no Google secrets): same answer as server/auth.js
        if self.path.split("?")[0] == "/api/me":
            body = b'{"available": false, "signedIn": false}'
            self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body); return
        super().do_GET()
    def end_headers(self):
        path = self.path.split("?")[0]
        for pattern, hs in parse_headers():
            if matches(pattern, path):
                for k, v in hs: self.send_header(k, v)
        super().end_headers()
    def log_message(self, *a): pass

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8788
    print(f"Serving {SITE} on http://localhost:{port}/")
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
