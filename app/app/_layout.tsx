import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { queryClient, persister } from '@/api/query';
import { useColors } from '@/theme';

// Redirects between the auth stack and the app based on session state.
function Gate() {
  const { ready, signedIn } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (!signedIn && !inAuth) router.replace('/(auth)/sign-in');
    else if (signedIn && inAuth) router.replace('/(tabs)');
  }, [ready, signedIn, segments]);

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(auth)/sign-in" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="add-entry" options={{ presentation: 'modal' }} />
      <Stack.Screen name="scan-receipt" options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 * 14 }}
        onSuccess={() => {
          // Replay any writes that were queued while offline / before the last quit.
          queryClient.resumePausedMutations();
        }}
      >
        <AuthProvider>
          <StatusBar style="auto" />
          <Gate />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}
