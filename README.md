# OptOut

Track the money you *chose not to spend* — cooked instead of takeout, skipped a costume,
walked instead of an Uber — log it, watch your saved total grow, and funnel it into virtual
goal jars. iOS + Android.

See [SPEC.md](./SPEC.md) for the full product + technical spec.

## Layout

| Dir | What |
|---|---|
| [`app/`](./app) | Expo (React Native) mobile app — iOS + Android |
| [`server/`](./server) | Node/Express + Postgres API |

## Quick start

```bash
# 1. API
cd server && npm install && cp .env.example .env   # fill in env
npm run migrate && npm run dev                      # :4000

# 2. App (new terminal)
cd app && npm install && cp .env.example .env       # set EXPO_PUBLIC_API_URL
npx expo start
```

## Stack

- **App**: Expo, expo-router, TypeScript, React Query, expo-secure-store, gifted-charts
- **API**: Express, Postgres (`pg`), JWT (access + refresh), bcrypt, jose (Apple),
  google-auth-library, nodemailer (magic-link)
- **Auth**: Sign in with Apple, Google, magic-link email code, optional password
- **Deploy**: API under pm2/systemd behind a reverse proxy at `api.optout.louispelosi.info`

## Status

v0.1 scaffold — both ends build and the API boots & serves routes. Needs: a Postgres
instance, real provider credentials (Apple/Google), SMTP settings, and the API subdomain.
