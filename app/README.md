# OptOut app

Expo (React Native) + expo-router + TypeScript client for OptOut.

## Setup

```bash
cd app
npm install
npx expo install   # reconcile native module versions to the installed Expo SDK
cp .env.example .env   # set EXPO_PUBLIC_API_URL + EXPO_PUBLIC_GOOGLE_CLIENT_ID
npx expo start
```

For a physical device, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP
(e.g. `http://192.168.1.20:4000`), not `localhost`.

## Structure

```
app/                  expo-router routes (file-based)
  _layout.tsx         providers (React Query, Auth) + auth gate
  (auth)/sign-in.tsx  Apple / Google / magic-link
  (tabs)/             Home, Stats, Jars, Settings
  add-entry.tsx       new opt-out (modal)
src/
  api/client.ts       fetch wrapper + token refresh + SecureStore
  api/hooks.ts        React Query hooks
  auth/AuthContext.tsx
  components/ui.tsx    Card, Button, Field, …
  theme.ts            colors, spacing, money()
```

## Auth notes

- **Apple**: iOS only; needs an Apple Developer account + the bundle id's Sign in with
  Apple capability. `usesAppleSignIn` is set in `app.json`.
- **Google**: set `EXPO_PUBLIC_GOOGLE_CLIENT_ID` (web client id). For standalone builds add
  the iOS/Android client ids and a custom URL scheme.
- **Magic link**: works against any email; the server emails a 6-digit code.

## Native builds

Apple/Google sign-in require a development build (not Expo Go for production OAuth).
Use EAS: `npx eas build --profile development`.
