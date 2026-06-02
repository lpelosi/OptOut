import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCreateJar, useJars, type Jar } from '@/api/hooks';
import { Button, Card, Empty, Field, ScreenTitle } from '@/components/ui';
import { money, radius, spacing, useColors } from '@/theme';

function JarCard({ j }: { j: Jar }) {
  const c = useColors();
  const pct = Math.round(j.progress * 100);
  const done = j.progress >= 1;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: c.text, fontSize: 18, fontWeight: '700' }}>
          {j.name} {done ? '🎉' : ''}
        </Text>
        <Text style={{ color: c.textMuted }}>{pct}%</Text>
      </View>
      <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: c.border, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: j.color || c.accent }} />
      </View>
      <Text style={{ color: c.textMuted }}>
        <Text style={{ color: c.text, fontWeight: '700' }}>{money(j.balance)}</Text> of {money(j.target_amount)}
      </Text>
    </Card>
  );
}

export default function Jars() {
  const c = useColors();
  const jars = useJars();
  const create = useCreateJar();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');

  const onCreate = async () => {
    const t = Number(target);
    if (!name.trim() || !Number.isFinite(t) || t <= 0) {
      Alert.alert('Add details', 'A jar needs a name and a positive target.');
      return;
    }
    try {
      await create.mutateAsync({ name: name.trim(), targetAmount: t });
      setName('');
      setTarget('');
      setAdding(false);
    } catch (e: any) {
      Alert.alert('Could not create jar', e.message ?? 'Try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <ScreenTitle>Jars</ScreenTitle>
          <Pressable onPress={() => setAdding((v) => !v)}>
            <Text style={{ color: c.accent, fontSize: 16, fontWeight: '700' }}>{adding ? 'Close' : '+ New'}</Text>
          </Pressable>
        </View>

        {adding && (
          <Card style={{ gap: spacing.md }}>
            <Field label="Jar name" value={name} onChangeText={setName} placeholder="e.g. Japan trip" />
            <Field label="Target amount" value={target} onChangeText={setTarget} placeholder="1000" keyboardType="decimal-pad" />
            <Button label="Create jar" onPress={onCreate} loading={create.isPending} />
          </Card>
        )}

        {(jars.data?.length ?? 0) === 0 && !jars.isLoading ? (
          <Empty text="Create a jar to funnel your savings toward a real goal." />
        ) : (
          (jars.data ?? []).map((j: Jar) => <JarCard key={j.id} j={j} />)
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
