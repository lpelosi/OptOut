// Mutation defaults registered on the QueryClient. Keeping mutationFn + optimistic
// logic here (rather than inline in hooks) lets React Query *resume paused mutations*
// after an offline period or a cold start — the engine of offline-first writes.
import type { QueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Category, Direction, Entry, Jar, Summary } from './hooks';

export const keys = {
  entryCreate: ['entry', 'create'] as const,
  entryUpdate: ['entry', 'update'] as const,
  entryDelete: ['entry', 'delete'] as const,
  jarCreate: ['jar', 'create'] as const,
  jarAllocate: ['jar', 'allocate'] as const,
};

export type CreateEntryInput = {
  amount: number;
  categoryId?: string;
  note?: string;
  occurredAt?: string;
  jarId?: string;
  direction?: Direction;
};
export type UpdateEntryInput = {
  id: string;
  body: Partial<{ amount: number; categoryId: string | null; note: string | null; occurredAt: string; jarId: string | null; direction: Direction }>;
};
export type CreateJarInput = { name: string; targetAmount: number; icon?: string; color?: string };
export type AllocateInput = { jarId: string; entryIds: string[] };

// ── time helpers (optimistic month/week buckets; server reconciles on sync) ──
const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};
const startOfWeek = () => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0, matching Postgres date_trunc('week')
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return monday.getTime();
};

// Apply a single entry's contribution (sign = +1 add, -1 remove) to a summary.
function applyDelta(s: Summary, e: Pick<Entry, 'amount' | 'direction' | 'occurred_at'>, sign: 1 | -1): Summary {
  const n = { ...s };
  const occ = new Date(e.occurred_at).getTime();
  const inMonth = occ >= startOfMonth();
  const inWeek = occ >= startOfWeek();
  const a = sign * e.amount;
  if (e.direction === 'saved') {
    n.lifetime += a;
    n.lifetime_count += sign;
    if (inMonth) n.month += a;
    if (inWeek) n.week += a;
  } else {
    n.spent += a;
    n.spent_count += sign;
    if (inMonth) n.spent_month += a;
    if (inWeek) n.spent_week += a;
  }
  n.net = n.lifetime - n.spent;
  return n;
}

const EMPTY_SUMMARY: Summary = {
  lifetime: 0, spent: 0, net: 0, lifetime_count: 0, spent_count: 0,
  month: 0, week: 0, spent_month: 0, spent_week: 0,
};

function patchSummary(qc: QueryClient, e: Pick<Entry, 'amount' | 'direction' | 'occurred_at'>, sign: 1 | -1) {
  qc.setQueryData<Summary>(['summary'], (s) => applyDelta(s ?? EMPTY_SUMMARY, e, sign));
}

// Build a display-ready optimistic entry by enriching the input from cached
// categories/jars so the new row renders fully before the server responds.
function optimisticEntry(qc: QueryClient, input: CreateEntryInput, id: string): Entry {
  const cat = input.categoryId ? qc.getQueryData<Category[]>(['categories'])?.find((c) => c.id === input.categoryId) : undefined;
  const jar = input.jarId ? qc.getQueryData<Jar[]>(['jars'])?.find((j) => j.id === input.jarId) : undefined;
  return {
    id,
    amount: input.amount,
    direction: input.direction ?? 'saved',
    note: input.note ?? null,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    category_id: input.categoryId ?? null,
    category_name: cat?.name ?? null,
    category_icon: cat?.icon ?? null,
    category_color: cat?.color ?? null,
    jar_id: input.jarId ?? null,
    jar_name: jar?.name ?? null,
    pending: true,
  };
}

const setList = (qc: QueryClient, fn: (l: Entry[]) => Entry[]) =>
  qc.setQueryData<Entry[]>(['entries'], (l) => fn(l ?? []));

// Invalidate everything an entry touches so it refetches once back online.
function invalidateAll(qc: QueryClient) {
  qc.invalidateQueries({ predicate: (q) => ['entries', 'summary', 'jars', 'stats'].includes(q.queryKey[0] as string) });
}

export function registerMutationDefaults(qc: QueryClient) {
  // CREATE ENTRY
  qc.setMutationDefaults(keys.entryCreate, {
    mutationFn: (input: CreateEntryInput) => api<{ entry: Entry }>('/api/entries', { method: 'POST', body: input }),
    onMutate: async (input: CreateEntryInput) => {
      await qc.cancelQueries({ queryKey: ['entries'] });
      const prevEntries = qc.getQueryData<Entry[]>(['entries']);
      const prevSummary = qc.getQueryData<Summary>(['summary']);
      const tempId = `temp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      const entry = optimisticEntry(qc, input, tempId);
      setList(qc, (l) => [entry, ...l]);
      patchSummary(qc, entry, 1);
      return { prevEntries, prevSummary, tempId };
    },
    onError: (_e: unknown, _v: CreateEntryInput, ctx: any) => {
      if (ctx?.prevEntries) qc.setQueryData(['entries'], ctx.prevEntries);
      if (ctx?.prevSummary) qc.setQueryData(['summary'], ctx.prevSummary);
    },
    onSuccess: (data: { entry: Entry }, _v: CreateEntryInput, ctx: any) => {
      // Swap the temp row for the server's real entry.
      setList(qc, (l) => l.map((e) => (e.id === ctx?.tempId ? data.entry : e)));
    },
    onSettled: () => invalidateAll(qc),
  });

  // UPDATE ENTRY
  qc.setMutationDefaults(keys.entryUpdate, {
    mutationFn: ({ id, body }: UpdateEntryInput) => api<{ entry: Entry }>(`/api/entries/${id}`, { method: 'PATCH', body }),
    onMutate: async ({ id, body }: UpdateEntryInput) => {
      await qc.cancelQueries({ queryKey: ['entries'] });
      const prevEntries = qc.getQueryData<Entry[]>(['entries']);
      const prevSummary = qc.getQueryData<Summary>(['summary']);
      const old = prevEntries?.find((e) => e.id === id);
      if (old) {
        const cat = 'categoryId' in body ? qc.getQueryData<Category[]>(['categories'])?.find((c) => c.id === body.categoryId) : undefined;
        const jar = 'jarId' in body ? qc.getQueryData<Jar[]>(['jars'])?.find((j) => j.id === body.jarId) : undefined;
        const next: Entry = {
          ...old,
          ...(body.amount != null && { amount: body.amount }),
          ...('note' in body && { note: body.note ?? null }),
          ...('occurredAt' in body && body.occurredAt && { occurred_at: body.occurredAt }),
          ...('direction' in body && body.direction && { direction: body.direction }),
          ...('categoryId' in body && { category_id: body.categoryId ?? null, category_name: cat?.name ?? null, category_icon: cat?.icon ?? null, category_color: cat?.color ?? null }),
          ...('jarId' in body && { jar_id: body.jarId ?? null, jar_name: jar?.name ?? null }),
          pending: true,
        };
        setList(qc, (l) => l.map((e) => (e.id === id ? next : e)));
        patchSummary(qc, old, -1);
        patchSummary(qc, next, 1);
      }
      return { prevEntries, prevSummary };
    },
    onError: (_e: unknown, _v: UpdateEntryInput, ctx: any) => {
      if (ctx?.prevEntries) qc.setQueryData(['entries'], ctx.prevEntries);
      if (ctx?.prevSummary) qc.setQueryData(['summary'], ctx.prevSummary);
    },
    onSuccess: (data: { entry: Entry }) => {
      setList(qc, (l) => l.map((e) => (e.id === data.entry.id ? data.entry : e)));
    },
    onSettled: () => invalidateAll(qc),
  });

  // DELETE ENTRY
  qc.setMutationDefaults(keys.entryDelete, {
    mutationFn: (id: string) => api(`/api/entries/${id}`, { method: 'DELETE' }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['entries'] });
      const prevEntries = qc.getQueryData<Entry[]>(['entries']);
      const prevSummary = qc.getQueryData<Summary>(['summary']);
      const old = prevEntries?.find((e) => e.id === id);
      setList(qc, (l) => l.filter((e) => e.id !== id));
      if (old) patchSummary(qc, old, -1);
      return { prevEntries, prevSummary };
    },
    onError: (_e: unknown, _v: string, ctx: any) => {
      if (ctx?.prevEntries) qc.setQueryData(['entries'], ctx.prevEntries);
      if (ctx?.prevSummary) qc.setQueryData(['summary'], ctx.prevSummary);
    },
    onSettled: () => invalidateAll(qc),
  });

  // CREATE JAR
  qc.setMutationDefaults(keys.jarCreate, {
    mutationFn: (input: CreateJarInput) => api<{ jar: Jar }>('/api/jars', { method: 'POST', body: input }),
    onMutate: async (input: CreateJarInput) => {
      await qc.cancelQueries({ queryKey: ['jars'] });
      const prevJars = qc.getQueryData<Jar[]>(['jars']);
      const tempId = `temp-${Date.now()}`;
      const jar: Jar = {
        id: tempId, name: input.name, icon: input.icon ?? 'piggy-bank', color: input.color ?? '#4F8A8B',
        target_amount: input.targetAmount, balance: 0, progress: 0, completed_at: null, pending: true,
      };
      qc.setQueryData<Jar[]>(['jars'], (l) => [jar, ...(l ?? [])]);
      return { prevJars, tempId };
    },
    onError: (_e: unknown, _v: CreateJarInput, ctx: any) => {
      if (ctx?.prevJars) qc.setQueryData(['jars'], ctx.prevJars);
    },
    onSuccess: (data: { jar: Jar }, _v: CreateJarInput, ctx: any) => {
      qc.setQueryData<Jar[]>(['jars'], (l) => (l ?? []).map((j) => (j.id === ctx?.tempId ? data.jar : j)));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['jars'] }),
  });

  // ALLOCATE ENTRIES TO JAR
  qc.setMutationDefaults(keys.jarAllocate, {
    mutationFn: ({ jarId, entryIds }: AllocateInput) => api(`/api/jars/${jarId}/allocate`, { method: 'POST', body: { entryIds } }),
    onSettled: () => invalidateAll(qc),
  });
}
