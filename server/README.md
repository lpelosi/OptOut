# OptOut API

Node/Express + Postgres backend for OptOut. JWT auth (Apple, Google, magic-link, password),
opt-out entries, categories, goal jars, and savings stats.

## Setup

```bash
cd server
npm install
cp .env.example .env        # fill in DATABASE_URL, JWT secrets, SMTP, provider IDs
npm run migrate             # apply db/schema.sql (idempotent)
npm run dev                 # watch mode on PORT (default 4000)
```

Generate JWT secrets:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Create the database + role once:

```sql
CREATE ROLE optout LOGIN PASSWORD 'optout';
CREATE DATABASE optout OWNER optout;
```

## Auth flows

| Endpoint | Body | Notes |
|---|---|---|
| `POST /api/auth/apple` | `{ identityToken, fullName? }` | verifies Apple JWT via JWKS |
| `POST /api/auth/google` | `{ idToken }` | verifies against `GOOGLE_CLIENT_IDS` |
| `POST /api/auth/magic/request` | `{ email }` | emails a 6-digit code (SMTP) |
| `POST /api/auth/magic/verify` | `{ email, code }` | creates user on first sign-in |
| `POST /api/auth/register` / `login` | `{ email, password, ... }` | optional password path |
| `POST /api/auth/refresh` | `{ refreshToken }` | rotates the refresh token |
| `POST /api/auth/logout` | `{ refreshToken }` | revokes it |

All other `/api/*` routes require `Authorization: Bearer <accessToken>`.

## Deploy (matches the flamingos / PinkSync server)

Same machine as the existing apps. Conventions confirmed from that server:
Express binds to **127.0.0.1 only**, **PM2** runs it, **Apache** reverse-proxies over HTTPS.
Ports already in use there: 3000 (site), 3001 (pinksync-api). OptOut uses **4000**.

```bash
# Start under PM2 (env via an ecosystem file or --env-file)
pm2 start src/index.js --name optout-api --node-args="--env-file=.env"
pm2 save
```

Apache vhost for the `api.optout.louispelosi.info` subdomain (needs `mod_proxy` + `mod_proxy_http`,
plus TLS via your existing certbot/SSL setup):

```apache
<VirtualHost *:443>
    ServerName api.optout.louispelosi.info
    ProxyPreserveHost On
    ProxyPass        / http://127.0.0.1:4000/
    ProxyPassReverse / http://127.0.0.1:4000/
    # SSLEngine on + certificate paths (managed by your existing SSL config)
</VirtualHost>
```

- `app.set('trust proxy', 'loopback')` is set so `req.ip` is the real client behind Apache.
- Health check: `GET /health`.

> The flamingos/PinkSync server proxies a *path* (`/api`) on the main domain. OptOut uses a
> dedicated subdomain instead, so the vhost proxies `/` rather than `/api`.
