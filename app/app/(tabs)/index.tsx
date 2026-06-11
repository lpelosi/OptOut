import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEntries, useSummary, type Entry } from '@/api/hooks';
import { Card, Empty } from '@/components/ui';
import { money, radius, spacing, useColors } from '@/theme';

function EntryRow({ e }: { e: Entry }) {
  const c = useColors();
  const router = useRouter();
  const date = new Date(e.occurred_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const spent = e.direction === 'spent';
  const meta = [date, e.note, e.jar_name, e.pending ? 'syncing…' : null].filter(Boolean).join(' · ');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/add-entry', params: { id: e.id } })}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md, opacity: e.pending ? 0.55 : pressed ? 0.6 : 1 })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: radius.md,
          backgroundColor: (e.category_color ?? c.accent) + '22',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16 }}>{spent ? '🧾' : '💸'}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: '600' }}>{e.category_name ?? (spent ? 'Expense' : 'Opt-out')}</Text>
        <Text style={{ color: c.textMuted, fontSize: 13 }} numberOfLines={1}>
          {meta}
        </Text>
      </View>
      <Text style={{ color: spent ? c.danger : c.positive, fontSize: 17, fontWeight: '700' }}>
        {spent ? '−' : '+'}
        {money(e.amount)}
      </Text>
    </Pressable>
  );
}

export default function Dashboard() {
  const c = useColors();
  const router = useRouter();
  const summary = useSummary();
  const entries = useEntries();
  const refreshing = summary.isRefetching || entries.isRefetching;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <FlatList
        data={entries.data ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              summary.refetch();
              entries.refetch();
            }}
            tintColor={c.accent}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: spacing.lg, marginBottom: spacing.sm }}>
            <Card>
              <Text style={{ color: c.textMuted, fontSize: 14, fontWeight: '600' }}>Total saved</Text>
              <Text style={{ color: c.text, fontSize: 48, fontWeight: '900', letterSpacing: -1.5, marginVertical: spacing.xs }}>
                {money(summary.data?.lifetime ?? 0)}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.lg }}>
                <Stat label="This month" value={money(summary.data?.month ?? 0)} c={c} />
                <Stat label="Spent" value={money(summary.data?.spent ?? 0)} c={c} />
                <Stat label="Net" value={money(summary.data?.net ?? 0)} c={c} />
              </View>
            </Card>
            <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>Recent</Text>
          </View>
        }
        renderItem={({ item }) => <EntryRow e={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: c.border }} />}
        ListEmptyComponent={!entries.isLoading ? <Empty text="No opt-outs yet. Tap + to log the first dollar you didn't spend." /> : null}
      />

      <View style={{ position: 'absolute', right: spacing.lg, bottom: spacing.xl, alignItems: 'center', gap: spacing.md }}>
        <Pressable
          onPress={() => router.push('/scan-receipt')}
          style={{
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.border,
            width: 52,
            height: 52,
            borderRadius: 26,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
            elevation: 5,
          }}
        >
          <Text style={{ fontSize: 22 }}>🧾</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/add-entry')}
          style={{
            backgroundColor: c.accent,
            width: 60,
            height: 60,
            borderRadius: 30,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#000',
            shadowOpacity: 0.25,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 4 },
            elevation: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 32, marginTop: -2 }}>+</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Stat({ label, value, c }: { label: string; value: string; c: ReturnType<typeof useColors> }) {
  return (
    <View>
      <Text style={{ color: c.textMuted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}
