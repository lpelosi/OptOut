import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PieChart } from 'react-native-gifted-charts';
import { useCategoryStats, useSummary, type CategoryStat, type Direction } from '@/api/hooks';
import { Card, Empty, ScreenTitle } from '@/components/ui';
import { money, radius, spacing, useColors } from '@/theme';

export default function Stats() {
  const c = useColors();
  const [direction, setDirection] = useState<Direction>('saved');
  const stats = useCategoryStats(direction);
  const summary = useSummary();
  const data = (stats.data ?? []).filter((s: CategoryStat) => s.total > 0);
  const pie = data.map((s: CategoryStat) => ({ value: s.total, color: s.color || c.accent }));
  const total = direction === 'saved' ? summary.data?.lifetime ?? 0 : summary.data?.spent ?? 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <ScreenTitle>Stats</ScreenTitle>

        <View style={{ flexDirection: 'row', backgroundColor: c.card, borderRadius: radius.pill, borderWidth: 1, borderColor: c.border, padding: 4 }}>
          {(['saved', 'spent'] as Direction[]).map((d) => {
            const active = direction === d;
            return (
              <Pressable
                key={d}
                onPress={() => setDirection(d)}
                style={{ flex: 1, paddingVertical: 10, borderRadius: radius.pill, alignItems: 'center', backgroundColor: active ? (d === 'saved' ? c.positive : c.danger) : 'transparent' }}
              >
                <Text style={{ color: active ? '#fff' : c.textMuted, fontWeight: '700' }}>{d === 'saved' ? 'Saved' : 'Spent'}</Text>
              </Pressable>
            );
          })}
        </View>

        {data.length === 0 ? (
          <Empty text={direction === 'saved' ? 'Log a few opt-outs to see where your savings come from.' : 'Log expenses to see where your money goes.'} />
        ) : (
          <>
            <Card style={{ alignItems: 'center', gap: spacing.md }}>
              <PieChart
                data={pie}
                donut
                radius={110}
                innerRadius={72}
                backgroundColor={c.card}
                centerLabelComponent={() => (
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: c.textMuted, fontSize: 12 }}>{direction === 'saved' ? 'Saved' : 'Spent'}</Text>
                    <Text style={{ color: c.text, fontSize: 20, fontWeight: '800' }}>{money(total)}</Text>
                  </View>
                )}
              />
            </Card>

            <Card style={{ gap: spacing.md }}>
              {data.map((s: CategoryStat) => (
                <View key={s.category_id ?? s.name} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: s.color || c.accent }} />
                  <Text style={{ color: c.text, flex: 1, fontSize: 16 }}>{s.name}</Text>
                  <Text style={{ color: c.textMuted, marginRight: spacing.sm }}>{s.count}×</Text>
                  <Text style={{ color: c.text, fontWeight: '700' }}>{money(s.total)}</Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
