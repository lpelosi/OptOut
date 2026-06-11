import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { api } from '@/api/client';
import { Button } from '@/components/ui';
import { radius, spacing, useColors } from '@/theme';

type Receipt = { merchant: string; total: number; currency: string; purchasedAt: string; items: { description: string; price: number }[] };

export default function ScanReceipt() {
  const c = useColors();
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);

  const capture = async () => {
    if (!cameraRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      if (!photo?.uri) throw new Error('No photo captured');

      // Downscale before upload so the base64 payload stays well under the server limit.
      const ctx = ImageManipulator.manipulate(photo.uri).resize({ width: 1400 });
      const image = await ctx.renderAsync();
      const out = await image.saveAsync({ compress: 0.6, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error('Could not process the image');

      const { receipt } = await api<{ receipt: Receipt }>('/api/receipts/parse', {
        method: 'POST',
        body: { imageBase64: out.base64, mediaType: 'image/jpeg' },
      });

      const date = receipt.purchasedAt ? new Date(receipt.purchasedAt) : null;
      router.replace({
        pathname: '/add-entry',
        params: {
          direction: 'spent',
          amount: receipt.total ? String(receipt.total) : '',
          note: receipt.merchant || '',
          ...(date && !isNaN(date.getTime()) ? { occurredAt: date.toISOString() } : {}),
        },
      });
    } catch (e: any) {
      Alert.alert('Scan failed', e.message ?? 'Could not read that receipt. Try again or add it manually.');
    } finally {
      setBusy(false);
    }
  };

  if (!permission) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={c.accent} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flex: 1, padding: spacing.lg, justifyContent: 'center', gap: spacing.md }}>
          <Text style={{ color: c.text, fontSize: 22, fontWeight: '800' }}>Scan a receipt</Text>
          <Text style={{ color: c.textMuted, fontSize: 16 }}>
            Camera access is needed to scan receipts and pull out the total automatically.
          </Text>
          <Button label="Allow camera" onPress={requestPermission} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" />
      <SafeAreaView style={{ position: 'absolute', top: 0, left: 0, right: 0 }} edges={['top']}>
        <Pressable onPress={() => router.back()} style={{ padding: spacing.lg }}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </SafeAreaView>
      <SafeAreaView style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }} edges={['bottom']}>
        <View style={{ alignItems: 'center', padding: spacing.xl, gap: spacing.md }}>
          {busy ? (
            <View style={{ alignItems: 'center', gap: spacing.sm }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff' }}>Reading receipt…</Text>
            </View>
          ) : (
            <Pressable
              onPress={capture}
              style={{ width: 74, height: 74, borderRadius: 37, backgroundColor: '#fff', borderWidth: 4, borderColor: c.accent }}
            />
          )}
          <Text style={{ color: '#fff', opacity: 0.8, fontSize: 13 }}>Frame the whole receipt and tap to scan</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}
