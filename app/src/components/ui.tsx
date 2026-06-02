import { ActivityIndicator, Pressable, Text, TextInput, View, type ViewStyle } from 'react-native';
import { radius, spacing, useColors } from '@/theme';

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        { backgroundColor: c.card, borderRadius: radius.lg, padding: spacing.lg, borderWidth: 1, borderColor: c.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : 'transparent';
  const fg = variant === 'ghost' ? c.text : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: bg,
        borderRadius: radius.pill,
        paddingVertical: 14,
        paddingHorizontal: spacing.lg,
        alignItems: 'center',
        borderWidth: variant === 'ghost' ? 1 : 0,
        borderColor: c.border,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: 16 }}>{label}</Text>}
    </Pressable>
  );
}

export function Field(props: React.ComponentProps<typeof TextInput> & { label?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      {props.label ? <Text style={{ color: c.textMuted, fontSize: 13, fontWeight: '600' }}>{props.label}</Text> : null}
      <TextInput
        placeholderTextColor={c.textMuted}
        {...props}
        style={[
          {
            backgroundColor: c.bg,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: radius.md,
            paddingVertical: 12,
            paddingHorizontal: spacing.md,
            color: c.text,
            fontSize: 16,
          },
          props.style as any,
        ]}
      />
    </View>
  );
}

export function ScreenTitle({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={{ color: c.text, fontSize: 30, fontWeight: '800', letterSpacing: -0.5 }}>{children}</Text>;
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return (
    <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
      <Text style={{ color: c.textMuted, fontSize: 15, textAlign: 'center' }}>{text}</Text>
    </View>
  );
}
