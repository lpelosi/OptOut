# OptOut API — Remote Deployment Runbook

**Audience:** a Claude Code agent running *on the server* (`louispelosi.info` host). Your job
is to deploy the OptOut API (`server/`) and expose it at `https://api.optout.louispelosi.info`.

You are working on the same machine that already runs two apps. **Do not disturb them.**
Discover them first so you don't collide on ports, Apache config, or PM2 names.

| App | Repo dir (find it) | Port | Notes |
|---|---|---|---|
| Frozen Flamingos site | `frozen-flamingos-hockey` | 3000 | public website + `/api` |
| PinkSync API | (same server.js, PM2 `pinksync-api`) | 3001 | iOS stats API |
| **OptOut API (you)** | `OptOut/server` | **4000** | new — this deploy |

---

## 0. Recon (do this before changing anything)

Run and read the output; adapt later steps to what you find. Do **not** assume paths.

```bash
node -v && npm -v                      # need Node 18+
pm2 ls                                 # see existing processes + how they're named
psql --version                         # confirm Postgres client present
sudo -u postgres psql -c '\l'          # list databases (confirm server reachable)
apachectl -v 2>/dev/null || httpd -v   # Apache present? (Debian vs RHEL naming differs)
apachectl -M 2>/dev/null | grep proxy  # mod_proxy + mod_proxy_http must be loaded
which certbot                          # for TLS
ls -d ~/* /var/www/* 2>/dev/null | grep -iE 'flaming|pinksync'   # where do existing apps live?
```

Clone OptOut next to the existing apps (match their parent dir):

```bash
git clone git@github.com:lpelosi/OptOut.git        # or https:// if no SSH key on server
cd OptOut/server
```

---

## 1. Postgres: database + role

Create a dedicated DB and role. **Generate a strong password** (don't reuse the placeholder):

```bash
DB_PASS="$(node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))")"
echo "DB password (save into .env below): $DB_PASS"
sudo -u postgres psql <<SQL
CREATE ROLE optout LOGIN PASSWORD '${DB_PASS}';
CREATE DATABASE optout OWNER optout;
SQL
```

The schema needs the `pgcrypto` and `citext` extensions; `db/schema.sql` creates them with
`CREATE EXTENSION IF NOT EXISTS`. If the `optout` role lacks permission to create extensions,
run them once as superuser against the new DB:

```bash
sudo -u postgres psql -d optout -c 'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext;'
```

---

## 2. Install dependencies

```bash
npm ci          # uses the committed package-lock; no dev deps in this package
```

---

## 3. Environment file

```bash
cp .env.example .env
```

Fill in `.env`. Generate the two JWT secrets:

```bash
node -e "console.log('JWT_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
```

Set these values:

| Var | Value |
|---|---|
| `PORT` | `4000` |
| `PUBLIC_URL` | `https://api.optout.louispelosi.info` |
| `CORS_ORIGINS` | leave as-is (native app sends no Origin; only Expo web/dev needs it) |
| `DATABASE_URL` | `postgres://optout:<DB_PASS>@localhost:5432/optout` |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | the generated values |
| `APPLE_SERVICES_ID` | **`info.louispelosi.optout`** ⚠️ see note below |
| `GOOGLE_CLIENT_IDS` | leave empty for now (Google sign-in returns "not configured" until set) |
| `MAGIC_CODE_TTL_MIN` | `10` |
| `SMTP_*` | reuse the server's existing mail relay — see §3a |

> ⚠️ **Apple audience.** For native Sign in with Apple, the identity token's `aud` is the
> **app's bundle id**, `info.louispelosi.optout` → set `APPLE_SERVICES_ID` to exactly that
> (note: OptOut's bundle id is `info.louispelosi.optout` per `app/app.json` — copy it verbatim
> from there to avoid typos). This is a **different** Apple identifier than PinkSync's, so do
> NOT copy PinkSync's `APPLE_SERVICES_ID`. If the OptOut App ID isn't registered in the Apple
> Developer portal yet, leave `APPLE_SERVICES_ID` empty — the server then **refuses** Apple
> sign-in entirely (it never skips audience verification) so it can't be abused. Magic-link and
> password auth still work. Flag to the human that Apple sign-in stays disabled until the App
> ID is registered and this value is set.

### 3a. SMTP (reuse the existing relay)

The server already sends mail for Mattermost. Reuse the same relay. Find its settings:

```bash
# Mattermost stores SMTP under EmailSettings in its config.json — locate it:
sudo find / -name config.json -path '*mattermost*' 2>/dev/null
# then read: SMTPServer, SMTPPort, SMTPUsername, SMTPPassword, ConnectionSecurity, FeedbackEmail
```

Map them into `.env`: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and
`SMTP_SECURE` (`true` only if port 465 / implicit TLS; `false` for 587/STARTTLS).
`SMTP_FROM` is already `no-reply@louispelosi.info` — adjust to a deliverable from-address on
this domain. If you cannot locate credentials, leave SMTP blank: magic-link codes then print
to the PM2 logs instead of emailing — note this to the human.

---

## 4. Migrate + smoke test

```bash
npm run migrate     # applies db/schema.sql; idempotent — safe to re-run
# verify:
sudo -u postgres psql -d optout -c "SELECT name FROM categories WHERE user_id IS NULL ORDER BY sort_order;"
# expect the 8 seeded default categories (Dining out, Coffee, ...)
```

Boot once in the foreground to confirm it starts cleanly, then Ctrl-C:

```bash
npm run start &      # should log: "OptOut API listening on 127.0.0.1:4000"
sleep 2
curl -s localhost:4000/health     # expect {"ok":true}  ← proves DB connection works
kill %1
```

If `/health` returns `{"ok":false}` the DB connection is wrong — recheck `DATABASE_URL`.

---

## 5. Run under PM2

```bash
pm2 start src/index.js --name optout-api --node-args="--env-file=.env"
pm2 save                          # persist across reboots (pm2 startup already configured on this box)
pm2 logs optout-api --lines 20    # confirm the listening line, no crashes
```

---

## 6. Apache reverse proxy + TLS

**DNS first:** `api.optout.louispelosi.info` must resolve to this server's public IP
(A/AAAA record). You likely cannot create DNS from the shell — if `dig +short
api.optout.louispelosi.info` is empty, **stop and tell the human to add the record**, then
resume. certbot will fail without it.

Create the vhost. File location depends on the distro — match how the existing sites are
configured (check `/etc/apache2/sites-available/` on Debian/Ubuntu or
`/etc/httpd/conf.d/` on RHEL). Start with a plain HTTP vhost so certbot can upgrade it:

```apache
# /etc/apache2/sites-available/api.optout.louispelosi.info.conf
<VirtualHost *:80>
    ServerName api.optout.louispelosi.info
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:4000/
    ProxyPassReverse / http://127.0.0.1:4000/
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http      # Debian/Ubuntu; skip if already enabled
sudo a2ensite api.optout.louispelosi.info.conf
sudo apachectl configtest && sudo systemctl reload apache2
sudo certbot --apache -d api.optout.louispelosi.info     # provisions + installs TLS, adds :443 vhost
```

---

## 7. End-to-end verification

```bash
curl -s https://api.optout.louispelosi.info/health                       # {"ok":true}
curl -s https://api.optout.louispelosi.info/api/entries                  # {"success":false,"message":"Missing bearer token"} (auth works)
curl -s -X POST https://api.optout.louispelosi.info/api/auth/magic/request \
  -H 'Content-Type: application/json' -d '{"email":"lrpelosi@gmail.com"}'   # {"success":true}; check inbox or PM2 logs for the code
```

Confirm the existing apps are still healthy:

```bash
pm2 ls                                  # flamingos + pinksync-api still "online"
curl -s localhost:3001/api/health 2>/dev/null || true
```

---

## 8. Report back to the human

Summarize: DB created, migration applied (✓ default categories), PM2 process up,
Apache vhost + TLS live, `/health` green. Then explicitly list anything still blocking
full functionality:

- **DNS** record for `api.optout.louispelosi.info` (if you had to request it).
- **Apple**: whether `APPLE_SERVICES_ID` is set to the real OptOut App ID, or left blank
  pending Apple Developer portal registration.
- **Google**: `GOOGLE_CLIENT_IDS` still empty — Google sign-in disabled until the human
  creates OAuth client IDs and provides them.
- **SMTP**: whether real relay creds were found, or magic-link codes are logging to PM2.

## Safety rules

- Bind stays `127.0.0.1` — never expose port 4000 to the internet directly; all traffic
  goes through Apache/HTTPS. Do not open 4000 in the firewall.
- Never commit `.env` or print secrets into the repo. `.env` is gitignored.
- `npm run migrate` and `db/schema.sql` are idempotent; re-running is safe.
- If anything conflicts with the flamingos (3000) or PinkSync (3001) services, **stop and
  ask** rather than reconfiguring their resources.
