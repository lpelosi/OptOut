// React Query hooks over the OptOut API.
// Mutations are offline-capable: their mutationFn + optimistic logic live in
// src/api/mutations.ts as registered defaults, so writes made offline are queued
// and replayed on reconnect. Hooks here reference them by mutationKey.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { keys, type CreateEntryInput, type UpdateEntryInput, type CreateJarInput, type AllocateInput } from './mutations';

export type Direction = 'saved' | 'spent';

export type Category = {
  id: string;
  is_default?: boolean;
  name: string;
  icon: string;
  color: string;
  default_amount: number | null;
};

export type Entry = {
  id: string;
  amount: number;
  direction: Direction;
  note: string | null;
  occurred_at: string;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  jar_id: string | null;
  jar_name: string | null;
  pending?: boolean; // optimistic / not yet synced to the VM
};

export type Jar = {
  id: string;
  name: string;
  icon: string;
  color: string;
  target_amount: number;
  balance: number;
  progress: number;
  completed_at: string | null;
  pending?: boolean;
};

export type Summary = {
  lifetime: number; // lifetime saved
  spent: number;
  net: number;
  lifetime_count: number;
  spent_count: number;
  month: number; // saved this month
  week: number; // saved this week
  spent_month: number;
  spent_week: number;
};
export type CategoryStat = { category_id: string | null; name: string; color: string; total: number; count: number };

// ── Queries ─────────────────────────────────────────────────────
export const useSummary = () =>
  useQuery({ queryKey: ['summary'], queryFn: () => api<{ summary: Summary }>('/api/stats/summary').then((r) => r.summary) });

export const useCategories = () =>
  useQuery({ queryKey: ['categories'], queryFn: () => api<{ categories: Category[] }>('/api/categories').then((r) => r.categories) });

export const useEntries = () =>
  useQuery({ queryKey: ['entries'], queryFn: () => api<{ entries: Entry[] }>('/api/entries?limit=100').then((r) => r.entries) });

export const useJars = () =>
  useQuery({ queryKey: ['jars'], queryFn: () => api<{ jars: Jar[] }>('/api/jars').then((r) => r.jars) });

export const useCategoryStats = (direction: Direction = 'saved') =>
  useQuery({
    queryKey: ['stats', 'category', direction],
    queryFn: () => api<{ categories: CategoryStat[] }>(`/api/stats/by-category?direction=${direction}`).then((r) => r.categories),
  });

// Single entry from the cached list (no GET-by-id endpoint; the edited entry
// always originates from the already-loaded list).
export const useEntry = (id?: string): Entry | undefined => {
  const qc = useQueryClient();
  if (!id) return undefined;
  const list = qc.getQueryData<Entry[]>(['entries']);
  return list?.find((e) => e.id === id);
};

// ── Mutations (offline-queued; defaults registered in mutations.ts) ──
export const useCreateEntry = () => useMutation<{ entry: Entry }, Error, CreateEntryInput>({ mutationKey: keys.entryCreate });
export const useUpdateEntry = () => useMutation<{ entry: Entry }, Error, UpdateEntryInput>({ mutationKey: keys.entryUpdate });
export const useDeleteEntry = () => useMutation<void, Error, string>({ mutationKey: keys.entryDelete });
export const useCreateJar = () => useMutation<{ jar: Jar }, Error, CreateJarInput>({ mutationKey: keys.jarCreate });
export const useAllocate = () => useMutation<unknown, Error, AllocateInput>({ mutationKey: keys.jarAllocate });
