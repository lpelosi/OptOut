// QueryClient wired for offline-first: NetInfo drives React Query's online state
// (so writes pause offline and auto-resume on reconnect), and the cache is
// persisted to AsyncStorage so reads + queued writes survive app restarts.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, onlineManager } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { registerMutationDefaults } from './mutations';

// Treat the device as online whenever it has a usable connection.
onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => setOnline(!!state.isConnected))
);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24 * 14, // keep 14d so persisted offline data isn't garbage-collected
    },
    mutations: {
      // Don't drop a queued write on transient failure while syncing.
      retry: 2,
    },
  },
});

registerMutationDefaults(queryClient);

export const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'optout.cache',
  throttleTime: 1000,
});
