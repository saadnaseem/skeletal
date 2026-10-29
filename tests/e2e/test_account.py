"""Google sign-in, end to end: the real Pages Functions (server/auth.js) under `wrangler pages dev` with a local D1
database, and a fake Google that issues codes and ID tokens and checks the PKCE proof.
Needs Node 22 for wrangler. Set WRANGLER to the command if `npx wrangler` won't do, e.g. "npx -y node@22 node_modules/wrangler/bin/wrangler.js".
Skipped when site/ hasn't been built (npm run build:pages)."""
import base64, hashlib, json, os, pathlib, shlex, socket, subprocess, tempfile, threading, time, urllib.parse, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import pytest

ROOT = pathlib.Path(__file__).resolve().parents[2]
WRANGLER = shlex.split(os.environ.get("WRANGLER", "npx wrangler"))
CLIENT_ID, CLIENT_SECRET, ISSUER = "test-client.apps.googleusercontent.com", "test-secret", "https://fake-google.test"
USER = {"sub": "g-1234567890", "email": "ada@example.com", "email_verified": True, "name": "Ada Lovelace"}


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


class FakeGoogle(BaseHTTPRequestHandler):
    challenges, token_requests = {}, []

    def log_message(self, *a): pass

    def do_GET(self):  # the consent screen: approve at once (or refuse, when the test asks for it)
        q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
        if q.get("client_id") != CLIENT_ID or q.get("code_challenge_method") != "S256" or "openid" not in q.get("scope", ""):
            self.send_response(400); self.end_headers(); return
        if FakeGoogle.refuse:
            back = q["redirect_uri"] + "?" + urllib.parse.urlencode({"error": "access_denied", "state": q["state"]})
        else:
            code = "code-" + q["state"][:8]; FakeGoogle.challenges[code] = q["code_challenge"]
            back = q["redirect_uri"] + "?" + urllib.parse.urlencode({"code": code, "state": q["state"]})
        self.send_response(302); self.send_header("location", back); self.end_headers()

    def do_POST(self):  # the token endpoint
        form = dict(urllib.parse.parse_qsl(self.rfile.read(int(self.headers["content-length"])).decode()))
        FakeGoogle.token_requests.append(form)
        proof = base64.urlsafe_b64encode(hashlib.sha256(form.get("code_verifier", "").encode()).digest()).rstrip(b"=").decode()
        if form.get("client_secret") != CLIENT_SECRET or FakeGoogle.challenges.get(form.get("code")) != proof:
            self.send_response(400); self.end_headers(); return
        b = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).rstrip(b"=").decode()
        claims = {**USER, "iss": ISSUER, "aud": CLIENT_ID, "exp": int(time.time()) + 3600}
        body = json.dumps({"id_token": b({"alg": "RS256"}) + "." + b(claims) + ".sig", "access_token": "x"}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)


FakeGoogle.refuse = False


@pytest.fixture(scope="module")
def server():
    if not (ROOT / "site" / "index.html").exists():
        pytest.skip("site/ not built; run npm run build:pages")
    gport, wport, state = free_port(), free_port(), tempfile.mkdtemp(prefix="lp-d1-")
    g = ThreadingHTTPServer(("127.0.0.1", gport), FakeGoogle); threading.Thread(target=g.serve_forever, daemon=True).start()
    w = lambda *a, **kw: subprocess.run([*WRANGLER, *a], cwd=ROOT, capture_output=True, text=True, timeout=180, **kw)
    r = w("d1", "migrations", "apply", "lonepair", "--config", "wrangler.local.toml", "--local", "--persist-to", state)
    if r.returncode: pytest.skip("wrangler not usable here (needs Node 22): " + (r.stderr or r.stdout)[-300:])
    binds = {"GOOGLE_CLIENT_ID": CLIENT_ID, "GOOGLE_CLIENT_SECRET": CLIENT_SECRET, "GOOGLE_ISSUER": ISSUER,
             "GOOGLE_AUTH_URL": f"http://127.0.0.1:{gport}/auth", "GOOGLE_TOKEN_URL": f"http://127.0.0.1:{gport}/token"}
    # Production wrangler.toml has no database. The placeholder id used by local tests is in wrangler.local.toml.
    db_id = next(l.split('"')[1] for l in (ROOT / "wrangler.local.toml").read_text().splitlines() if l.strip().startswith("database_id"))
    args = [*WRANGLER, "pages", "dev", "site", "--port", str(wport), "--ip", "127.0.0.1", "--persist-to", state, "--d1", f"DB={db_id}", "--compatibility-date", "2026-09-01"]
    for k, v in binds.items(): args += ["--binding", f"{k}={v}"]
    proc = subprocess.Popen(args, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    base = f"http://127.0.0.1:{wport}"
    for _ in range(120):
        try:
            if json.load(urllib.request.urlopen(base + "/api/me", timeout=2)).get("available"): break
        except Exception: time.sleep(0.5)
    else:
        proc.kill(); pytest.fail("wrangler pages dev did not start:\n" + proc.stdout.read()[-2000:])
    sql = lambda q: json.loads(w("d1", "execute", "lonepair", "--config", "wrangler.local.toml", "--local", "--persist-to", state, "--json", "--command", q).stdout)[0]["results"]
    yield {"base": base, "sql": sql}
    proc.terminate(); g.shutdown()


def open_app(browser, base):
    ctx = browser.new_context(viewport={"width": 1400, "height": 900}); pg = ctx.new_page(); pg.errors = []
    pg.on("pageerror", lambda e: pg.errors.append(str(e)))
    pg.on("console", lambda m: pg.errors.append(m.text) if m.type == "error" and "ERR_FAILED" not in m.text else None)
    pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    pg.goto(base + "/")
    pg.wait_for_selector("#bAccount:not([hidden])")
    return ctx, pg


def test_sign_in_saves_the_account_and_keeps_the_drawing(server, browser):
    ctx, pg = open_app(browser, server["base"])
    assert "Sign in with Google" in pg.inner_text("#bAccount")
    pg.evaluate("tryLoadText('CC(=O)Oc1ccccc1C(=O)O')")  # work in progress survives the trip to Google and back
    pg.click("#bAccount")
    pg.wait_for_url(server["base"] + "/")  # back home, ?signin=ok removed
    pg.wait_for_selector("#bAccount .avatar")
    assert "Ada" in pg.inner_text("#bAccount") and pg.evaluate("doc.atoms.length") == 13
    rows = server["sql"]("SELECT id, email, name, sign_ins FROM users")
    assert rows == [{"id": USER["sub"], "email": USER["email"], "name": USER["name"], "sign_ins": 1}]
    assert len(server["sql"]("SELECT id FROM sessions")) == 1
    # the cookie is HttpOnly and the session id stored is a hash, not the cookie value
    cookie = next(c for c in ctx.cookies() if c["name"] == "lp_session")
    assert cookie["httpOnly"] and cookie["sameSite"] == "Lax"
    assert server["sql"]("SELECT id FROM sessions")[0]["id"] != cookie["value"]
    pg.reload(); pg.wait_for_selector("#bAccount .avatar")  # still signed in
    # sign out, sign in again: same account, counter goes up
    pg.click("#bAccount"); pg.click("#acOut"); pg.wait_for_selector("#bAccount:not(:has(.avatar))")
    assert pg.evaluate("fetch('/api/me').then(r=>r.json()).then(j=>j.signedIn)") is False
    pg.click("#bAccount"); pg.wait_for_selector("#bAccount .avatar")
    assert server["sql"]("SELECT sign_ins FROM users")[0]["sign_ins"] == 2
    assert pg.errors == [], pg.errors
    ctx.close()


def test_delete_account_removes_the_data(server, browser):
    ctx, pg = open_app(browser, server["base"])
    if not pg.locator("#bAccount .avatar").count():
        pg.click("#bAccount"); pg.wait_for_selector("#bAccount .avatar")
    pg.click("#bAccount"); pg.click("#acDel"); pg.click("#acDelGo")
    pg.wait_for_selector("#bAccount:not(:has(.avatar))")
    assert server["sql"]("SELECT COUNT(*) AS n FROM users")[0]["n"] == 0
    assert server["sql"]("SELECT COUNT(*) AS n FROM sessions")[0]["n"] == 0
    ctx.close()


def test_refused_or_forged_sign_ins_are_rejected(server, browser):
    ctx, pg = open_app(browser, server["base"])
    FakeGoogle.refuse = True
    try:
        pg.click("#bAccount"); pg.wait_for_selector("#toast.show")
        assert "cancelled" in pg.inner_text("#toast")
    finally:
        FakeGoogle.refuse = False
    # a callback whose state doesn't match the browser's cookie (CSRF / replay) is refused
    pg.goto(server["base"] + "/api/auth/google/callback?code=x&state=forged"); pg.wait_for_selector("#bAccount:not([hidden])")
    assert "didn" in pg.inner_text("#toast") and server["sql"]("SELECT COUNT(*) AS n FROM users")[0]["n"] == 0
    # state-changing calls from another site are refused
    req = urllib.request.Request(server["base"] + "/api/auth/logout", method="POST", headers={"origin": "https://evil.example"})
    with pytest.raises(urllib.error.HTTPError) as e: urllib.request.urlopen(req)
    assert e.value.code == 403
    ctx.close()
