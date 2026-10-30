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
        # raw UTF-8 like Google sends, not \u escapes, so non-ASCII names exercise the server's decoding
        b = lambda o: base64.urlsafe_b64encode(json.dumps(o, ensure_ascii=False).encode()).rstrip(b"=").decode()
        claims = {**FakeGoogle.user, "iss": ISSUER, "aud": CLIENT_ID, "exp": int(time.time()) + 3600}
        body = json.dumps({"id_token": b({"alg": "RS256"}) + "." + b(claims) + ".sig", "access_token": "x"}).encode()
        self.send_response(200); self.send_header("content-type", "application/json"); self.send_header("content-length", str(len(body))); self.end_headers(); self.wfile.write(body)


FakeGoogle.refuse = False
FakeGoogle.user = USER


@pytest.fixture(scope="module")
def server():
    if not (ROOT / "site" / "index.html").exists():
        pytest.skip("site/ not built; run npm run build:pages")
    gport, wport, state = free_port(), free_port(), tempfile.mkdtemp(prefix="lp-d1-")
    g = ThreadingHTTPServer(("127.0.0.1", gport), FakeGoogle); threading.Thread(target=g.serve_forever, daemon=True).start()
    w = lambda *a, **kw: subprocess.run([*WRANGLER, *a], cwd=ROOT, capture_output=True, text=True, timeout=180, **kw)
    r = w("d1", "migrations", "apply", "lonepair", "--local", "--persist-to", state)
    if r.returncode: pytest.skip("wrangler not usable here (needs Node 22): " + (r.stderr or r.stdout)[-300:])
    binds = {"GOOGLE_CLIENT_ID": CLIENT_ID, "GOOGLE_CLIENT_SECRET": CLIENT_SECRET, "GOOGLE_ISSUER": ISSUER,
             "GOOGLE_AUTH_URL": f"http://127.0.0.1:{gport}/auth", "GOOGLE_TOKEN_URL": f"http://127.0.0.1:{gport}/token", "FEEDBACK_LIMIT": "4"}
    # wrangler.toml isn't a Pages config (see its header), so the D1 binding is passed here, using the same local database
    db_id = next(l.split('"')[1] for l in (ROOT / "wrangler.toml").read_text().splitlines() if l.startswith("database_id"))
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
    sql = lambda q: json.loads(w("d1", "execute", "lonepair", "--local", "--persist-to", state, "--json", "--command", q).stdout)[0]["results"]
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
    for _ in range(100):  # the tab reopens its project from the library once it has loaded
        if pg.evaluate("window.libReady===true"): break
        pg.wait_for_timeout(100)
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


def test_non_ascii_names_and_stray_cookies(server, browser):
    jose = {**USER, "sub": "g-jose", "email": "jose@example.com", "name": "José Müller-Ødegård"}
    now_ms = int(time.time() * 1000)
    server["sql"](f"INSERT INTO users (id, email, name, created_at, last_seen_at) VALUES ('g-jose', 'jose@example.com', 'x', {now_ms}, {now_ms})")
    server["sql"]("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('old-expired', 'g-jose', 0, 1)")
    FakeGoogle.user = jose
    try:
        ctx, pg = open_app(browser, server["base"])
        pg.click("#bAccount"); pg.wait_for_selector("#bAccount .avatar")
        assert pg.inner_text("#bAccount .avatar") == "JM" and "José" in pg.inner_text("#bAccount")
        assert server["sql"]("SELECT name FROM users WHERE id = 'g-jose'")[0]["name"] == jose["name"]
        # signing in tidies that user's expired sessions
        assert server["sql"]("SELECT COUNT(*) AS n FROM sessions WHERE id = 'old-expired'")[0]["n"] == 0
        ctx.close()
    finally:
        FakeGoogle.user = USER
    # a cookie from another app on the domain that isn't valid percent-encoding must not break /api/me
    req = urllib.request.Request(server["base"] + "/api/me", headers={"cookie": "other=%E0%A4%A; lp_session=nope"})
    body = json.load(urllib.request.urlopen(req))
    assert body["available"] is True and body["signedIn"] is False


def post_feedback(base, body, origin=True):
    h = {"content-type": "application/json", **({"origin": base} if origin else {})}
    req = urllib.request.Request(base + "/api/feedback", data=json.dumps(body).encode(), method="POST", headers=h)
    try:
        r = urllib.request.urlopen(req); return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def test_feedback_is_stored_and_removed_with_the_account(server, browser):
    ctx, pg = open_app(browser, server["base"])
    if pg.locator("#bAccount .avatar").count():  # start signed out
        pg.click("#bAccount"); pg.click("#acOut"); pg.wait_for_selector("#bAccount:not(:has(.avatar))")
    pg.click("#bFeedback"); assert pg.inner_text("#fbGo") == "Send"
    pg.fill("#fbMsg", "Anonymous: the lasso misses small rings"); pg.fill("#fbEmail", "reply@example.com"); pg.click("#fbGo")
    pg.wait_for_selector("#toast.show"); assert "Thanks" in pg.inner_text("#toast")
    row = server["sql"]("SELECT message, email, user_id, context, ip_hash FROM feedback ORDER BY id DESC LIMIT 1")[0]
    assert (row["message"], row["email"], row["user_id"]) == ("Anonymous: the lasso misses small rings", "reply@example.com", None)
    assert "browser" in json.loads(row["context"]) and len(row["ip_hash"]) == 64
    # signed in: tied to the account, and the reply address defaults to the account email
    pg.click("#bAccount"); pg.wait_for_selector("#bAccount .avatar")
    pg.click("#bFeedback"); assert pg.input_value("#fbEmail") == USER["email"]
    pg.fill("#fbMsg", "Please add Fischer projections"); pg.click("#fbGo")
    pg.wait_for_selector("#modal.open", state="detached")
    row = server["sql"]("SELECT user_id, email FROM feedback ORDER BY id DESC LIMIT 1")[0]
    assert row == {"user_id": USER["sub"], "email": USER["email"]}
    # deleting the account deletes that person's feedback too
    pg.click("#bAccount"); pg.click("#acDel"); pg.click("#acDelGo"); pg.wait_for_selector("#bAccount:not(:has(.avatar))")
    assert server["sql"](f"SELECT COUNT(*) AS n FROM feedback WHERE user_id = '{USER['sub']}'")[0]["n"] == 0
    assert pg.errors == [], pg.errors
    ctx.close()


def test_feedback_api_rejects_bad_requests_and_floods(server):
    base = server["base"]
    assert post_feedback(base, {"message": "x"}, origin=False)[0] == 403       # other sites can't post
    assert post_feedback(base, {"message": "   "})[0] == 400                    # empty
    assert post_feedback(base, {"message": "x" * 5001})[0] == 400               # too long
    code, _ = post_feedback(base, {"message": "<script>alert(1)</script>", "email": "bad", "context": {"a b": 1, "ok": {"nested": 1}}})
    assert code == 200
    row = server["sql"]("SELECT email, context FROM feedback ORDER BY id DESC LIMIT 1")[0]
    assert row == {"email": None, "context": None}            # coerced, not trusted
    codes = [post_feedback(base, {"message": f"flood {i}"})[0] for i in range(6)]
    assert 429 in codes and codes[-1] == 429                                    # FEEDBACK_LIMIT=4 per 10 minutes per address
