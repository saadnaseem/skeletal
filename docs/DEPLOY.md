# Putting Lone Pair on lonepair.app (Cloudflare)

This puts Lone Pair on **lonepair.app**, with **lone-pair.com** forwarding to it. It takes about 20 minutes.

**Cost at Cloudflare's at-cost prices (October 2026):**
- First year: lonepair.app $8.20 + lone-pair.com $10.46 = **$18.66**.
- Renewal: $14.20 + $10.46 = $24.66 per year.

Hosting on Cloudflare Pages is free.

Menu names are as of October 2026; Cloudflare sometimes moves things around.

## 0. Before you start

- Merge the rename pull request (`rename/lone-pair`) into `main`, so the site deploys with the new name.
- **Optional: rename the GitHub repo** to `lonepair` (GitHub → repo → Settings → Repository name). If you want to, do it **before** step 2, because the Cloudflare connection is set up against the repo name.

## 1. Buy the two domains

1. Sign in at <https://dash.cloudflare.com> and open **Domain Registration → Register Domains**.
2. Search **lonepair.app**, check that the price is about $8.20, and choose **Purchase**.
   - One year, auto-renew on.
   - Leave WHOIS privacy on; it's free and the default.
   - You need a payment method on file.
3. Repeat for **lone-pair.com** (about $10.46).
4. **Watch your email.** For .com, the registry sends a contact-verification email. Click it within 15 days, or the domain is suspended.

Both domains now appear under **Websites** (your list of domains), already using Cloudflare DNS.

## 2. Create the Pages site from GitHub

1. Open **Workers & Pages → Create** and choose the **Pages** tab. If only Workers is offered, look for the "Looking to deploy Pages? Get started" link.
2. Choose **Connect to Git** (or **Import an existing Git repository**). Allow access to GitHub and pick **saadnaseem/skeletal**.
3. Fill in the build settings:

   | Setting | Value |
   | --- | --- |
   | Project name | `lonepair` (the temporary address becomes `lonepair.pages.dev`) |
   | Production branch | `main` |
   | Framework preset | **None** |
   | Build command | `npm run build:pages` |
   | Build output directory | `site` |
   | Root directory | leave empty |

   The Node version comes from the repo's `.node-version` file (22). No environment variables are needed.
4. Choose **Save and Deploy**. The first build takes 2–3 minutes.
5. Open **https://lonepair.pages.dev** and try the app: draw something, press **Analyze**, and save a project.

From now on, every push to `main` redeploys automatically, and every pull request gets its own preview address.

## 3. Attach lonepair.app

1. In the **lonepair** Pages project, open **Custom domains → Set up a custom domain**.
2. Enter `lonepair.app`, then choose **Continue → Activate domain**. The domain is in the same Cloudflare account, so the DNS record is created for you.
3. Wait a few minutes for the certificate; the status changes to **Active**.
4. Optional: repeat for `www.lonepair.app`.

## 4. Forward lone-pair.com to lonepair.app

The redirect runs on Cloudflare's servers. The domain needs a placeholder DNS record to receive the traffic.

1. Open **lone-pair.com → DNS → Records → Add record**:
   - Type **A**, Name `@`, IPv4 `192.0.2.1`, Proxy status **Proxied** (orange cloud). `192.0.2.1` is a reserved dummy address; with the record proxied, Cloudflare answers the request itself.
   - Add the same record again with Name `www`.
2. Open **lone-pair.com → Rules → Create rule → Redirect Rule**. Choosing the template "Redirect from one domain to another" fills most of this in.
   - Rule name: `to lonepair.app`
   - When incoming requests match: **All incoming requests**
   - Then: Type **Dynamic**, Expression `concat("https://lonepair.app", http.request.uri.path)`, Status code **301**, **Preserve query string** checked.
   - Choose **Deploy**.
3. Test it:

   ```bash
   curl -sI https://lone-pair.com/some/path
   ```

   It should show `301` and `location: https://lonepair.app/some/path`.

## 5. Check the live site

```bash
curl -sI https://lonepair.app
```

The response should include `content-security-policy`, `x-content-type-options: nosniff` and `cache-control: public, max-age=0, must-revalidate`, which come from `site/_headers`.

Also check that:
- Copy image works (it needs HTTPS, which you now have).
- Name/CAS lookup works.
- A saved `.html` project opens.

## 6. Turn on "Sign in with Google" (optional, about 20 minutes)

Signing in is never required: people can use everything without an account. Until you finish these steps, the site works and the Sign in button stays hidden.

**a. Create the accounts database** (on your Mac, in the repo folder):

```bash
npx wrangler login
```

```bash
npx wrangler d1 create lonepair
```

Copy the `database_id` it prints into `wrangler.toml` (replacing the zeros), commit it, then create the tables:

```bash
npx wrangler d1 migrations apply lonepair --remote
```

Wrangler needs Node 22. Check with `node --version`.

**b. Create the Google sign-in client.** Go to <https://console.cloud.google.com>, create a project called "Lone Pair", then:

1. **APIs & Services → OAuth consent screen** (also called **Google Auth Platform → Branding**). Fill in:
   - App name: **Lone Pair**
   - Support email: your Gmail
   - App domain / home page: `https://lonepair.app`
   - Privacy policy: `https://lonepair.app/privacy.html`
   - Authorized domain: `lonepair.app`
2. **Audience:** External. Choose **Publish app**, so anyone with a Google account can sign in and not just test users. The app only asks for name and email (`openid email profile`), which doesn't need Google's security review.
3. **Clients → Create client → Web application.** Name it "lonepair.app". Under **Authorized redirect URIs**, add:
   - `https://lonepair.app/api/auth/google/callback`
   - `https://lonepair.pages.dev/api/auth/google/callback` (so the temporary address works too)
4. Copy the **Client ID** and **Client secret**.

**c. Connect them to the site.** In Cloudflare, open **Workers & Pages → lonepair → Settings**:

1. **Bindings → Add → D1 database.** Variable name `DB`, database `lonepair`.
2. **Variables and Secrets → Add:**
   - `GOOGLE_CLIENT_ID` (type: Text) = the client ID
   - `GOOGLE_CLIENT_SECRET` (type: **Secret**) = the client secret
3. Do this for **Production**, and for **Preview** too if you want sign-in on preview links.
4. Open **Deployments**, then **Retry deployment** on the latest one, so it picks up the settings.

**d. Test it.** Open <https://lonepair.app>, click **Sign in with Google**, and pick your account. You should come back signed in, with your initials in the top bar.

**e. Set up the privacy contact.** The privacy page lists `privacy@lonepair.app`. Create it for free under **lonepair.app → Email → Email Routing**, forwarding to your Gmail.

## 7. See who signed up

All sign-ins:

```bash
npx wrangler d1 execute lonepair --remote --command "SELECT name, email, datetime(created_at/1000,'unixepoch') AS joined, datetime(last_seen_at/1000,'unixepoch') AS last_seen, sign_ins FROM users ORDER BY created_at DESC"
```

Sign-ups per day:

```bash
npx wrangler d1 execute lonepair --remote --command "SELECT date(created_at/1000,'unixepoch') AS day, COUNT(*) AS signups FROM users GROUP BY day ORDER BY day DESC"
```

You can also run these queries in the dashboard: **Workers & Pages → D1 → lonepair → Console**.

The email addresses are for knowing your users and contacting them about the service. Before sending newsletters or marketing, ask people to opt in; the privacy page promises that. For visit counts that include people who don't sign in, turn on **Web Analytics** in the Pages project's **Metrics** tab. The site's security policy already allows it, and it uses no cookies.

## Optional extras

- **Cloudflare Web Analytics** (privacy-friendly, no cookies). The security policy already allows it: turn it on in the Pages project under **Metrics**.
- **Social handles:** reserve @lonepair or @lonepairapp before announcing.
- **Trademark:** search "Lone Pair" in software classes 9 and 42 at <https://tmsearch.uspto.gov/> before you put money into branding.

## If something goes wrong

- **Build fails:**
  1. Open the deployment log in the Pages project.
  2. Check that the build command is `npm run build:pages` and the output directory is `site`.
  3. Locally, `npm ci && npm run build:pages` must succeed.
- **Custom domain stuck on "Pending":** make sure there's no other DNS record named `lonepair.app` in the zone, then retry.
- **Old link `…/skeletal.html`:** it forwards to `/` automatically, via `site/_redirects`.
