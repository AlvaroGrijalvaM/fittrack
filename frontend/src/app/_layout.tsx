/**
 * Layout raíz: proveedor de autenticación + Stripe + Stack de navegación.
 * Según haya sesión, muestra las pestañas o las pantallas de login/registro.
 */
import { initStripe } from '@stripe/stripe-react-native';
import { DarkTheme, DefaultTheme, ThemeProvider, Stack } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme, ActivityIndicator, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

function RootNavigator() {
  const { user, isLoading } = useAuth();
  const insets = useSafeAreaInsets();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F172A' }}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { paddingTop: insets.top } }}>
      {/* Hijos como arrays (no fragments): expo-router no procesa fragments dentro del Stack */}
      {user
        ? [
            <Stack.Screen key="tabs" name="(tabs)" />,
            <Stack.Screen key="workout" name="workout/[id]" />,
            <Stack.Screen key="sensor" name="sensor" />,
            <Stack.Screen key="outdoor" name="outdoor" />,
            <Stack.Screen key="history" name="history" />,
            <Stack.Screen key="notifications" name="notifications" />,
            <Stack.Screen key="premium" name="premium" />,
          ]
        : [
            <Stack.Screen key="login" name="login" />,
            <Stack.Screen key="register" name="register" />,
          ]}
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Inicializa el SDK de Stripe (PaymentSheet) con la clave publicable test
  useEffect(() => {
    const publishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (publishableKey) {
      initStripe({
        publishableKey,
        merchantIdentifier: 'merchant.com.utslrc.fittrack',
      }).catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <RootNavigator />
      </ThemeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}