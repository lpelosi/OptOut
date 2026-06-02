import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useCategories, useCreateEntry, useJars, type Category, type Jar } from '@/api/hooks';
import { Button, Field } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

export default function AddEntry() {
  const c = useColors();
  const router = useRouter();
  const categories = useCategories();
  const jars = useJars();
  const create = useCreateEntry();

  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [jarId, setJarId] = useState<string | undefined>();

  const pickCategory = (cat: Category) => {
    setCategoryId(cat.id);
    if (cat.default_amount != null && !amount) setAmount(String(cat.default_amount));
  };

  const onSave = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter an amount', 'How much would you have spent?');
      return;
    }
    try {
      await create.mutateAsync({ amount: value, categoryId, note: note.trim() || undefined, jarId });
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Try again.');
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>New opt-out</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: c.textMuted, fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>

        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Category</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {(categories.data ?? []).map((cat: Category) => {
              const active = cat.id === categoryId;
              return (
                <Pressable
                  key={cat.id}
                  onPress={() => pickCategory(cat)}
                  style={{
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    backgroundColor: active ? cat.color : c.card,
                    borderWidth: 1,
                    borderColor: active ? cat.color : c.border,
                  }}
                >
                  <Text style={{ color: active ? '#fff' : c.text, fontWeight: '600' }}>{cat.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Field
          label="Amount you didn't spend"
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. cooked instead of takeout" />

        {(jars.data?.length ?? 0) > 0 && (
          <View style={{ gap: spacing.sm }}>
            <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Add to a jar (optional)</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              {jars.data!.map((j: Jar) => {
                const active = j.id === jarId;
                return (
                  <Pressable
                    key={j.id}
                    onPress={() => setJarId(active ? undefined : j.id)}
                    style={{
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      backgroundColor: active ? j.color : c.card,
                      borderWidth: 1,
                      borderColor: active ? j.color : c.border,
                    }}
                  >
                    <Text style={{ color: active ? '#fff' : c.text, fontWeight: '600' }}>{j.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Button label="Save opt-out" onPress={onSave} loading={create.isPending} />
      </ScrollView>
    </SafeAreaView>
  );
}
