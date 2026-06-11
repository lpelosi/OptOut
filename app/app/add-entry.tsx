import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  useCategories,
  useCreateEntry,
  useDeleteEntry,
  useEntry,
  useJars,
  useUpdateEntry,
  type Category,
  type Direction,
  type Jar,
} from '@/api/hooks';
import { Button, Field } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

export default function AddEntry() {
  const c = useColors();
  const router = useRouter();
  // `id` => edit mode. The prefill params (amount/note/direction/date) seed a NEW
  // entry — used by the receipt scanner to hand off an extracted expense.
  const params = useLocalSearchParams<{
    id?: string;
    amount?: string;
    note?: string;
    direction?: string;
    occurredAt?: string;
  }>();
  const { id } = params;
  const existing = useEntry(id);
  const editing = !!id;
  const pending = !!existing?.pending; // queued offline, no server id yet — can't edit/delete until synced

  const categories = useCategories();
  const jars = useJars();
  const create = useCreateEntry();
  const update = useUpdateEntry();
  const remove = useDeleteEntry();

  const initialDirection: Direction = existing?.direction ?? (params.direction === 'spent' ? 'spent' : params.direction === 'saved' ? 'saved' : 'saved');
  const [direction, setDirection] = useState<Direction>(initialDirection);
  const [categoryId, setCategoryId] = useState<string | undefined>(existing?.category_id ?? undefined);
  const [amount, setAmount] = useState(existing ? String(existing.amount) : params.amount ?? '');
  const [note, setNote] = useState(existing?.note ?? params.note ?? '');
  const [jarId, setJarId] = useState<string | undefined>(existing?.jar_id ?? undefined);
  const [occurredAt, setOccurredAt] = useState<Date>(
    existing ? new Date(existing.occurred_at) : params.occurredAt ? new Date(params.occurredAt) : new Date()
  );
  const [showDate, setShowDate] = useState(false);

  const pickCategory = (cat: Category) => {
    setCategoryId((cur) => (cur === cat.id ? undefined : cat.id));
    if (cat.default_amount != null && !amount) setAmount(String(cat.default_amount));
  };

  const onSave = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      Alert.alert('Enter an amount', direction === 'saved' ? "How much would you have spent?" : 'How much did you spend?');
      return;
    }
    try {
      if (editing) {
        await update.mutateAsync({
          id: id!,
          body: {
            amount: value,
            direction,
            categoryId: categoryId ?? null,
            note: note.trim() || null,
            occurredAt: occurredAt.toISOString(),
            jarId: direction === 'saved' ? jarId ?? null : null,
          },
        });
      } else {
        await create.mutateAsync({
          amount: value,
          direction,
          categoryId,
          note: note.trim() || undefined,
          occurredAt: occurredAt.toISOString(),
          jarId: direction === 'saved' ? jarId : undefined,
        });
      }
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Try again.');
    }
  };

  const onDelete = () =>
    Alert.alert('Delete entry?', 'This removes it permanently.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await remove.mutateAsync(id!);
            router.back();
          } catch (e: any) {
            Alert.alert('Could not delete', e.message ?? 'Try again.');
          }
        },
      },
    ]);

  const saved = direction === 'saved';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: '800' }}>{editing ? 'Edit entry' : 'New entry'}</Text>
          <Pressable onPress={() => router.back()}>
            <Text style={{ color: c.textMuted, fontSize: 16 }}>Cancel</Text>
          </Pressable>
        </View>

        {pending && (
          <View style={{ backgroundColor: c.accentSoft, padding: spacing.md, borderRadius: radius.md }}>
            <Text style={{ color: c.text }}>This entry is waiting to sync. You can edit it once it reaches the server.</Text>
          </View>
        )}

        {/* Saved vs Spent */}
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
          label={saved ? "Amount you didn't spend" : 'Amount spent'}
          value={amount}
          onChangeText={setAmount}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
        <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder={saved ? 'e.g. cooked instead of takeout' : 'e.g. groceries'} />

        {/* Date */}
        <View style={{ gap: spacing.sm }}>
          <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>Date</Text>
          <Pressable
            onPress={() => setShowDate((v) => !v)}
            style={{ backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: spacing.md }}
          >
            <Text style={{ color: c.text, fontSize: 16 }}>
              {occurredAt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </Text>
          </Pressable>
          {showDate && (
            <DateTimePicker
              value={occurredAt}
              mode="date"
              maximumDate={new Date()}
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_e, d) => {
                setShowDate(Platform.OS === 'ios');
                if (d) setOccurredAt(d);
              }}
            />
          )}
        </View>

        {saved && (jars.data?.length ?? 0) > 0 && (
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

        <Button
          label={editing ? 'Save changes' : saved ? 'Save opt-out' : 'Save expense'}
          onPress={onSave}
          loading={create.isPending || update.isPending}
          disabled={pending}
        />
        {editing && <Button label="Delete entry" variant="danger" onPress={onDelete} disabled={pending || remove.isPending} />}
      </ScrollView>
    </SafeAreaView>
  );
}
