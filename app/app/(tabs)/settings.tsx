import { Alert, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthContext';
import { useSummary } from '@/api/hooks';
import { Button, Card, ScreenTitle } from '@/components/ui';
import { money, spacing, useColors } from '@/theme';

export default function Settings() {
  const c = useColors();
  const { signOut, deleteAccount } = useAuth();
  const summary = useSummary();

  const confirmDelete = () =>
    Alert.alert(
      'Delete account?',
      'This permanently removes your account and every opt-out, jar, and category. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAccount().catch((e) => Alert.alert('Could not delete', e.message)),
        },
      ]
    );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.lg }}>
        <ScreenTitle>Settings</ScreenTitle>

        <Card style={{ gap: spacing.xs }}>
          <Text style={{ color: c.textMuted, fontSize: 13 }}>Lifetime saved</Text>
          <Text style={{ color: c.text, fontSize: 28, fontWeight: '800' }}>{money(summary.data?.lifetime ?? 0)}</Text>
          <Text style={{ color: c.textMuted }}>{summary.data?.lifetime_count ?? 0} opt-outs logged</Text>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <Button label="Sign out" variant="ghost" onPress={signOut} />
          <Button label="Delete account" variant="danger" onPress={confirmDelete} />
        </View>

        <Text style={{ color: c.textMuted, fontSize: 12, textAlign: 'center' }}>OptOut v0.1.0</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
