/** Pantalla Premium: plan y pago con Stripe PaymentSheet (formulario dentro de la app, modo de prueba). */
import { initPaymentSheet, presentPaymentSheet } from '@stripe/stripe-react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type Plan = { id: number; name: string; price_mxn: number; billing_interval: string; features: string[] };

type PaymentSheetData = {
  paymentIntent: string;
  paymentIntentId: string;
  ephemeralKey: string;
  customer: string;
};

export default function PremiumScreen() {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ plan: Plan }>('/subscriptions/plan');
      setPlan(res.plan);
    } catch {
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); refreshUser(); }, [load, refreshUser]));

  const subscribe = async () => {
    setBusy(true);
    try {
      // 1) El backend crea el PaymentIntent en Stripe (modo test)
      const sheet = await api.post<PaymentSheetData>('/subscriptions/payment-sheet');

      // 2) Formulario de pago DENTRO de la app (PaymentSheet de Stripe)
      const init = await initPaymentSheet({
        merchantDisplayName: 'FitTrack Premium',
        customerId: sheet.customer,
        customerEphemeralKeySecret: sheet.ephemeralKey,
        paymentIntentClientSecret: sheet.paymentIntent,
        defaultBillingDetails: { name: user?.name ?? undefined },
      });
      if (init.error) throw new Error(init.error.message);

      const result = await presentPaymentSheet();
      if (result.error) {
        Alert.alert('Pago cancelado', result.error.message ?? 'No se completó el pago con Stripe.');
        return;
      }

      // 3) El backend confirma el PaymentIntent y activa Premium
      await api.post('/subscriptions/verify', { payment_intent_id: sheet.paymentIntentId });
      await refreshUser();
      Alert.alert('¡Bienvenido a Premium! ⭐', 'Tu pago se confirmó y tu suscripción está activa por 30 días.');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo completar la suscripción');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    Alert.alert('Cancelar Premium', 'Perderás el acceso a las funciones Premium.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí, cancelar',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.post('/subscriptions/cancel');
            await refreshUser();
          } catch {
            Alert.alert('Error', 'No se pudo cancelar la suscripción');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} style={styles.backLink}>
          <ThemedText themeColor="textSecondary">← Volver</ThemedText>
        </Pressable>
        <ThemedText style={styles.logo}>FITTRACK PREMIUM ⭐</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Desbloquea todas las funciones
        </ThemedText>

        <ThemedView style={[styles.premiumCard, { backgroundColor: '#FEF3C7' }]}>
          {(plan?.features ?? []).map((f) => (
            <ThemedText key={f} style={styles.feature}>
              ✓ {f}
            </ThemedText>
          ))}
          <ThemedText style={styles.price}>
            ${plan?.price_mxn ?? 79} MXN / {plan?.billing_interval === 'year' ? 'año' : 'mes'}
          </ThemedText>
        </ThemedView>

        {user?.premium ? (
          <>
            <ThemedView type="backgroundElement" style={styles.activeCard}>
              <ThemedText style={styles.activeTitle}>✅ ¡Ya eres Premium!</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Disfruta de rutinas personalizadas y estadísticas avanzadas.
              </ThemedText>
            </ThemedView>
            <Pressable style={[styles.cancelButton, { borderColor: '#EF4444' }]} onPress={cancel} disabled={busy}>
              <ThemedText style={{ color: '#EF4444', fontWeight: '700' }}>Cancelar suscripción</ThemedText>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.subscribeButton, { backgroundColor: '#FBBF24' }]}
            onPress={subscribe}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <ThemedText style={styles.subscribeText}>SUSCRIBIRME</ThemedText>
            )}
          </Pressable>
        )}

        <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
          Pago seguro con Stripe.
        </ThemedText>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  logo: { fontSize: 22, fontWeight: '800', letterSpacing: 1, color: '#B45309' },
  backLink: { alignSelf: 'flex-start', paddingVertical: Spacing.one },
  premiumCard: { borderRadius: 16, padding: Spacing.four, gap: Spacing.two },
  feature: { fontSize: 16, fontWeight: '600', color: '#92400E' },
  price: { fontSize: 22, fontWeight: '800', color: '#92400E', marginTop: Spacing.two },
  subscribeButton: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center' },
  subscribeText: { color: '#FFFFFF', fontWeight: '800', letterSpacing: 1 },
  activeCard: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one, alignItems: 'center' },
  activeTitle: { color: '#16A34A', fontWeight: '800', fontSize: 18 },
  cancelButton: { borderRadius: 12, borderWidth: 1, paddingVertical: Spacing.three, alignItems: 'center' },
  note: { textAlign: 'center', marginTop: Spacing.three },
});