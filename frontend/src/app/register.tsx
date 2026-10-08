/**
 * Pantalla de registro de cuenta.
 */
import { Link, Redirect } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/hooks/use-theme';

type Chip = { key: string | number; label: string };

const GOALS: Chip[] = [
  { key: 'muscle_gain', label: 'Masa muscular' },
  { key: 'weight_loss', label: 'Perder peso' },
  { key: 'endurance', label: 'Resistencia' },
  { key: 'general_health', label: 'Salud' },
  { key: 'flexibility', label: 'Flexibilidad' },
];
const LEVELS: Chip[] = [
  { key: 'beginner', label: 'Principiante' },
  { key: 'intermediate', label: 'Intermedio' },
  { key: 'advanced', label: 'Avanzado' },
];
const WEEK_DAYS: Chip[] = [2, 3, 4, 5, 6].map((n) => ({ key: n, label: `${n} días` }));

export default function RegisterScreen() {
  const { user, register } = useAuth();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [age, setAge] = useState('');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [goal, setGoal] = useState<string>('muscle_gain');
  const [level, setLevel] = useState<string>('beginner');
  const [workoutsPerWeek, setWorkoutsPerWeek] = useState<number>(3);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const onSubmit = async () => {
    try {
      setError(null);
      setLoading(true);
      await register({
        name,
        email: email.trim(),
        password,
        age: age ? Number(age) : undefined,
        weight_kg: weight ? Number(weight) : undefined,
        height_cm: height ? Number(height) : undefined,
        goal,
        level,
        workouts_per_week: workoutsPerWeek,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la cuenta');
    } finally {
      setLoading(false);
    }
  };

  const renderChips = (options: Chip[], selected: string | number, onSelect: (key: string) => void) => (
    <ThemedView style={styles.chipRow}>
      {options.map((o) => {
        const active = o.key === selected;
        return (
          <Pressable
            key={String(o.key)}
            onPress={() => onSelect(String(o.key))}
            style={[styles.chip, { backgroundColor: active ? theme.primary : theme.backgroundElement }]}>
            <ThemedText style={active ? styles.chipActiveText : styles.chipText}>{o.label}</ThemedText>
          </Pressable>
        );
      })}
    </ThemedView>
  );

  const input = (placeholder: string, value: string, onChange: (v: string) => void, keyboard?: 'numeric') => (
    <TextInput
      style={[styles.input, { backgroundColor: theme.backgroundElement, color: theme.text }]}
      placeholder={placeholder}
      placeholderTextColor={theme.textSecondary}
      keyboardType={keyboard ?? 'default'}
      value={value}
      onChangeText={onChange}
    />
  );

  return (
    <ThemedView style={{ flex: 1, paddingTop: insets.top + Spacing.four }}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText style={styles.logo}>FITTRACK</ThemedText>
        <ThemedText type="subtitle">Crea tu cuenta</ThemedText>
        <ThemedText themeColor="textSecondary">
          Cuéntanos de ti para preparar tus primeros entrenamientos.
        </ThemedText>

        {input('Nombre', name, setName)}
        {input('Correo electrónico', email, setEmail)}
        {input('Contraseña (mín. 6 caracteres)', password, setPassword)}
        {input('Edad', age, setAge, 'numeric')}
        {input('Peso (kg)', weight, setWeight, 'numeric')}
        {input('Altura (cm)', height, setHeight, 'numeric')}

        <ThemedText themeColor="textSecondary">Objetivo</ThemedText>
        {renderChips(GOALS, goal, setGoal)}

        <ThemedText themeColor="textSecondary">Nivel</ThemedText>
        {renderChips(LEVELS, level, setLevel)}

        <ThemedText themeColor="textSecondary">Entrenamientos por semana</ThemedText>
        {renderChips(WEEK_DAYS, workoutsPerWeek, (k) => setWorkoutsPerWeek(Number(k)))}

        {error ? (
          <ThemedText themeColor="danger" style={styles.error}>
            {error}
          </ThemedText>
        ) : null}

        <Pressable style={[styles.button, { backgroundColor: theme.primary }]} onPress={onSubmit}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <ThemedText style={styles.buttonText}>Crear cuenta</ThemedText>
          )}
        </Pressable>

        <Link href="/login">
          <ThemedText style={styles.linkText}>¿Ya tienes cuenta? Inicia sesión</ThemedText>
        </Link>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, paddingBottom: Spacing.six, gap: Spacing.two },
  logo: { fontSize: 30, fontWeight: '800', letterSpacing: 3, color: '#22C55E', textAlign: 'center' },
  input: { borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.three, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipText: { color: '#6B7280' },
  chipActiveText: { color: '#FFFFFF', fontWeight: '700' },
  button: { borderRadius: 12, paddingVertical: Spacing.three, alignItems: 'center', marginTop: Spacing.two },
  buttonText: { color: '#FFFFFF', fontWeight: '700' },
  error: { textAlign: 'center' },
  linkText: { textAlign: 'center', paddingVertical: Spacing.three },
});