// React Query hooks over the OptOut API.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

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
  note: string | null;
  occurred_at: string;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  jar_id: string | null;
  jar_name: string | null;
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
};

export type Summary = { lifetime: number; lifetime_count: number; month: number; week: number };
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

export const useCategoryStats = () =>
  useQuery({ queryKey: ['stats', 'category'], queryFn: () => api<{ categories: CategoryStat[] }>('/api/stats/by-category').then((r) => r.categories) });

// ── Mutations ───────────────────────────────────────────────────
// Invalidate everything that a new/changed entry affects.
function useRefetchAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ predicate: (q) => ['entries', 'summary', 'jars', 'stats'].includes(q.queryKey[0] as string) });
}

export function useCreateEntry() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: (body: { amount: number; categoryId?: string; note?: string; occurredAt?: string; jarId?: string }) =>
      api<{ entry: Entry }>('/api/entries', { method: 'POST', body }),
    onSuccess: refetch,
  });
}

export function useDeleteEntry() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: (id: string) => api(`/api/entries/${id}`, { method: 'DELETE' }),
    onSuccess: refetch,
  });
}

export function useCreateJar() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: (body: { name: string; targetAmount: number; icon?: string; color?: string }) =>
      api<{ jar: Jar }>('/api/jars', { method: 'POST', body }),
    onSuccess: refetch,
  });
}

export function useAllocate() {
  const refetch = useRefetchAll();
  return useMutation({
    mutationFn: ({ jarId, entryIds }: { jarId: string; entryIds: string[] }) =>
      api(`/api/jars/${jarId}/allocate`, { method: 'POST', body: { entryIds } }),
    onSuccess: refetch,
  });
}
