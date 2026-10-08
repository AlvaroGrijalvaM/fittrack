/**
 * Pantalla de inicio de sesión.
 */
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      setError('Escribe tu correo y contraseña');
      return;
    }
    try {
      setError(null);
      setLoading(true);
      await login(email.trim(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={[styles.container, { paddingTop: insets.top + Spacing.five }]}>
      <ThemedText style={styles.logo}>FITTRACK</ThemedText>
      <ThemedText type="subtitle">Hola de nuevo 👋</ThemedText>
      <ThemedText themeColor="textSecondary">Inicia sesión para seguir entrenando</ThemedText>

      <TextInput
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        placeholder="Correo electrónico"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
        placeholder="Contraseña"
        placeholderTextColor={theme.textSecondary}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? (
        <ThemedText themeColor="danger" style={styles.error}>
          {error}
        </ThemedText>
      ) : null}

      <Pressable style={[styles.button, { backgroundColor: theme.primary }]} onPress={onSubmit}>
        {loading ? <ActivityIndicator color="#FFFFFF" /> : <ThemedText style={styles.buttonText}>Entrar</ThemedText>}
      </Pressable>

      <Link href="/register">
        <ThemedText style={styles.linkText}>¿No tienes cuenta? Regístrate</ThemedText>
      </Link>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: Spacing.four, gap: Spacing.three },
  logo: { fontSize: 30, fontWeight: '800', letterSpacing: 3, color: '#22C55E', textAlign: 'center' },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  button: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  error: { textAlign: 'center' },
  linkText: { textAlign: 'center', paddingVertical: Spacing.two },
});