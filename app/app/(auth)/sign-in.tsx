import { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { useAuth } from '@/auth/AuthContext';
import { Button, Field } from '@/components/ui';
import { spacing, useColors } from '@/theme';

WebBrowser.maybeCompleteAuthSession();

export default function SignIn() {
  const c = useColors();
  const { signInWithApple, signInWithGoogle, requestMagicCode, verifyMagicCode } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  const [request, response, promptGoogle] = Google.useIdTokenAuthRequest({
    clientId: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const idToken = response.params.id_token;
      if (idToken) signInWithGoogle(idToken).catch((e) => Alert.alert('Sign-in failed', e.message));
    }
  }, [response]);

  const wrap = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e: any) {
      Alert.alert('Something went wrong', e.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onApple = wrap(async () => {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!cred.identityToken) throw new Error('No identity token from Apple');
    const fullName = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    await signInWithApple(cred.identityToken, fullName || undefined);
  });

  const onRequestCode = wrap(async () => {
    if (!email.includes('@')) throw new Error('Enter a valid email');
    await requestMagicCode(email.trim());
    setStage('code');
  });

  const onVerify = wrap(async () => {
    await verifyMagicCode(email.trim(), code.trim());
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.lg }}>
        <View style={{ gap: spacing.xs, marginBottom: spacing.md }}>
          <Text style={{ color: c.text, fontSize: 40, fontWeight: '900', letterSpacing: -1 }}>OptOut</Text>
          <Text style={{ color: c.textMuted, fontSize: 17 }}>Track the money you chose not to spend.</Text>
        </View>

        {stage === 'email' ? (
          <View style={{ gap: spacing.md }}>
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
            <Button label="Email me a sign-in code" onPress={onRequestCode} loading={busy} />
          </View>
        ) : (
          <View style={{ gap: spacing.md }}>
            <Field label={`Code sent to ${email}`} value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" maxLength={6} />
            <Button label="Verify & sign in" onPress={onVerify} loading={busy} />
            <Button label="Use a different email" variant="ghost" onPress={() => setStage('email')} />
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.sm }}>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
          <Text style={{ color: c.textMuted }}>or</Text>
          <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
        </View>

        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={
              c.bg === '#0E1116'
                ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
            }
            cornerRadius={999}
            style={{ height: 50 }}
            onPress={onApple}
          />
        )}
        <Button label="Continue with Google" variant="ghost" disabled={!request} onPress={() => promptGoogle()} />
      </View>
    </SafeAreaView>
  );
}
