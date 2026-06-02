import { Redirect } from 'expo-router';

// Entry point — the Gate in _layout handles auth redirects; default into the app.
export default function Index() {
  return <Redirect href="/(tabs)" />;
}
