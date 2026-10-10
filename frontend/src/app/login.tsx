/**
 * Pantalla de inicio de sesión.
 */
import { Ionicons } from '@expo/vector-icons';
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';

export default function LoginScreen() {
  const { user, login } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <ThemedText style={[TitleStyles.screenTitle, { textAlign: 'center' }]}>FITTRACK</ThemedText>
      <ThemedText type="subtitle">Hola de nuevo</ThemedText>
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
      <View style={[styles.input, styles.passwordRow, { backgroundColor: theme.backgroundElement }]}>
        <TextInput
          style={[styles.passwordInput, { color: theme.text }]}
          placeholder="Contraseña"
          placeholderTextColor={theme.textSecondary}
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
          <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color={theme.textSecondary} />
        </Pressable>
      </View>

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
  input: { borderRadius: 0, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  passwordRow: { flexDirection: 'row', alignItems: 'center' },
  passwordInput: { flex: 1, paddingHorizontal: 0, paddingVertical: 0, fontSize: 16 },
  button: { borderRadius: 0, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  error: { textAlign: 'center' },
  linkText: { textAlign: 'center', paddingVertical: Spacing.two },
});