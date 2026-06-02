# OptOut — Spec (v1)

Track money you *chose not to spend* — made food instead of eating out, skipped a costume, walked instead of an Uber — log it, watch your saved total grow, and funnel that money into virtual goal jars.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Platform | iOS + Android, one codebase |
| Mobile stack | Expo (React Native) + TypeScript + expo-router |
| Amount entry | Category presets (editable default) + manual override |
| Storage | Postgres (on existing personal server) |
| Backend | New Node/Express service, new subdomain `api.optout.louispelosi.info` |
| Auth | Sign in with Apple + Google + magic-link (email code). Password optional. |
| Email | nodemailer → existing server SMTP (shared with Mattermost) |
| Motivation features | Lifetime/period totals + stats, goal jars, allocate savings to jars |
| Allocation | Virtual jars in-app only (no real bank movement) |
| Design | Clean & minimal — one accent color, big numerals, generous whitespace |

Reference: the existing `frozen-flamingos-hockey` Express app already implements JWT
(15m access / 30d refresh) + bcrypt + Apple JWKS verification + per-email login rate
limiting. OptOut lifts that auth approach and swaps flat-file storage for Postgres.

## Data model (Postgres)

```
users        id uuid pk, email citext unique, display_name, password_hash null,
             apple_user_id null unique, google_user_id null unique,
             is_active bool, created_at, updated_at

categories   id uuid pk, user_id uuid null (null = built-in default),
             name, icon, color, default_amount numeric(10,2) null, sort_order int

jars         id uuid pk, user_id uuid, name, icon, color,
             target_amount numeric(10,2), created_at, completed_at null

entries      id uuid pk, user_id uuid, category_id uuid null,
             jar_id uuid null, amount numeric(10,2), note text null,
             occurred_at timestamptz, created_at
             -- entry tagged to a jar contributes its amount to that jar's balance

refresh_tokens  token_hash text pk, user_id uuid, expires_at, created_at
login_codes     email citext, code_hash text, expires_at, attempts int  -- magic link
```

Jar balance = `SUM(entries.amount) WHERE jar_id = :jar`. Allocation = set/clear an
entry's `jar_id`. Built-in categories seeded once; users can add custom ones.

Default categories: Dining out, Coffee, Costume/Event, Impulse buy, Subscription,
Rideshare, Snacks, Other.

## REST API

All under `/api`. JWT Bearer auth except the public auth endpoints.

```
POST /auth/apple              { identityToken, fullName? }            -> tokens
POST /auth/google             { idToken }                             -> tokens
POST /auth/magic/request      { email }                              -> 200 (sends code)
POST /auth/magic/verify       { email, code }                        -> tokens
POST /auth/register           { email, displayName, password }        -> tokens
POST /auth/login              { email, password }                     -> tokens
POST /auth/refresh            { refreshToken }                        -> tokens
POST /auth/logout             { refreshToken }                        -> 204
DELETE /auth/delete-account   (Bearer)                               -> 204  (App Store req.)
GET  /me                                                              -> user

GET    /categories                                                   -> list (defaults + own)
POST   /categories            { name, icon, color, defaultAmount? }   -> category
PATCH  /categories/:id
DELETE /categories/:id

GET    /entries?from=&to=&category=&jar=&limit=&cursor=              -> paged entries
POST   /entries               { amount, categoryId?, note?, occurredAt?, jarId? }
PATCH  /entries/:id
DELETE /entries/:id

GET    /jars                                                         -> jars w/ balances
POST   /jars                  { name, targetAmount, icon, color }
PATCH  /jars/:id
DELETE /jars/:id
POST   /jars/:id/allocate     { entryIds: [] }                       -> tag entries to jar

GET    /stats/summary                                                -> lifetime, month, week
GET    /stats/by-category?from=&to=
GET    /stats/timeline?bucket=day|week|month&from=&to=
```

Token response shape: `{ accessToken, refreshToken, user }`.

## Mobile screens

1. **Auth** — Apple / Google / "email me a code" buttons. Minimal, logo + tagline.
2. **Dashboard** — big lifetime saved total, this-month figure, recent opt-outs list,
   floating "+" to add. Pull-to-refresh.
3. **Add opt-out** (bottom sheet) — category grid (tap fills default amount, editable)
   → amount → optional note → date (defaults now) → optional jar. Save.
4. **Stats** — donut by category, line/bar over time, week/month/all toggle.
5. **Jars** — cards with progress bars toward target, create/edit, allocate entries,
   subtle celebration when a jar hits 100%.
6. **Settings** — profile, manage custom categories, sign out, delete account.

### Mobile libraries
- `expo-router` (file-based nav), `@tanstack/react-query` (server state + cache)
- `expo-secure-store` (token storage), `axios` w/ refresh interceptor
- `expo-apple-authentication`, `expo-auth-session` (Google)
- `react-native-gifted-charts` (donut + line/bar)
- Theme: single accent, system font, 8pt spacing scale, light + dark.

## Deployment

Conventions confirmed from the PinkSync iOS client + flamingos server on the same box:
- Express binds to **127.0.0.1 only**; **PM2** runs it; **Apache** (`mod_proxy`,
  `mod_proxy_http`) reverse-proxies over HTTPS. No Docker.
- Ports in use there: 3000 (site), 3001 (pinksync-api). OptOut uses **4000**.
- Apache vhost for `api.optout.louispelosi.info` proxies `/` → `127.0.0.1:4000` (the existing apps
  proxy a `/api` *path* on the main domain; OptOut gets its own subdomain instead).
- Postgres: dedicated `optout` database + role. Schema applied via `db/schema.sql`.
- SMTP: reuse existing server mail relay (host/port/user/pass via env). NOTE: the shared
  server's own auth (PinkSync) uses only Apple + password — magic-link/Google are new to
  OptOut, but OptOut is a separate service so there's no contract conflict.
- Secrets via env: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `APPLE_SERVICES_ID`,
  `GOOGLE_CLIENT_IDS`, `SMTP_*`, `APP_NAME`, `MAGIC_CODE_TTL_MIN`.

## Build phases

1. ✅ Spec
2. **Backend** — schema, pool, auth (all methods), entries/categories/jars/stats, mailer.
   Local Postgres + `npm test` smoke. ← scaffolding now
3. **Mobile** — Expo app, auth flow, dashboard, add sheet, stats, jars, settings. ← scaffolding now
4. Wire app → real API, test on device via Expo Go.
5. Polish: empty states, errors, offline cache, app icons/splash.
6. Store prep: Apple Developer + Google Play, privacy policy, screenshots, builds via EAS.

## Open items (need from you later)
- Actual domain for the `api.optout.louispelosi.info` subdomain + DNS.
- Apple: Services ID + key for Sign in with Apple (you already have one for flamingos).
- Google: OAuth client IDs (iOS, Android, web) from Google Cloud console.
- SMTP host/port/user/pass for the server relay.
- Postgres connection string for the new `optout` DB.
