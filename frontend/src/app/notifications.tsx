/**
 * Bandeja de notificaciones: historial del usuario, no-leídas y marcar como leídas.
 */
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Divider } from '@/components/divider';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, TitleStyles } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/api';

type NotificationItem = {
  id: number;
  type: 'workout_reminder' | 'goal_completed' | 'streak' | 'weekly_summary' | 'system';
  title: string;
  body: string;
  sent_at: string | null;
  scheduled_for: string | null;
  read_at: string | null;
  created_at: string;
};

const TYPE_ICONS: Record<NotificationItem['type'], keyof typeof Ionicons.glyphMap> = {
  workout_reminder: 'notifications',
  goal_completed: 'trophy',
  streak: 'flame',
  weekly_summary: 'calendar',
  system: 'information-circle',
};

// El backend entrega ISO UTC (p. ej. '2026-10-09T15:04:00.000Z'); se formatea en la
// zona horaria del dispositivo. Se tolera el DATETIME naive heredado 'YYYY-MM-DD HH:MM:SS'.
function formatDateTime(value: string | null): string {
  if (!value) return '';
  const d = new Date(value.length === 19 ? value.replace(' ', 'T') : value);
  if (Number.isNaN(d.getTime())) return value.slice(0, 10);
  return d.toLocaleString('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function NotificationsScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ notifications: NotificationItem[]; unread: number }>(
        '/notifications/history?limit=100'
      );
      setItems(res.notifications);
      setUnread(res.unread ?? 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const markRead = useCallback(
    async (n: NotificationItem) => {
      if (n.read_at) return;
      // Optimista: se marca en local y se confirma con el backend
      setItems((prev) => prev.map((it) => (it.id === n.id ? { ...it, read_at: new Date().toISOString() } : it)));
      setUnread((prev) => Math.max(0, prev - 1));
      try {
        await api.patch(`/notifications/${n.id}/read`);
      } catch {
        load(); // ante un error, recargar el estado real
      }
    },
    [load]
  );

  const markAllRead = useCallback(async () => {
    if (!unread) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((it) => ({ ...it, read_at: it.read_at ?? now })));
    setUnread(0);
    try {
      await api.post('/notifications/history/read-all');
    } catch {
      load();
    }
  }, [unread, load]);

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator size="large" color={theme.primary} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        contentContainerStyle={styles.content}
        data={items}
        keyExtractor={(item) => String(item.id)}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText style={TitleStyles.screenTitle}>NOTIFICACIONES</ThemedText>
            <View style={styles.headerMeta}>
              <ThemedText type="small" themeColor="textSecondary">
                {unread > 0 ? `${unread} sin leer · ${items.length} en total` : `${items.length} notificaciones`}
              </ThemedText>
              {unread > 0 ? (
                <Pressable onPress={markAllRead} style={[styles.readAll, { borderColor: theme.primary }]}>
                  <ThemedText type="small" style={{ color: theme.primaryDark, fontWeight: '700' }}>
                    Marcar todo leído
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          <ThemedView type="backgroundElement" style={styles.empty}>
            <ThemedText themeColor="textSecondary">
              No hay notificaciones todavía. ¡Entrena para generar actividad! 💪
            </ThemedText>
          </ThemedView>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => markRead(item)}>
            <ThemedView
              type="backgroundElement"
              style={[styles.card, item.read_at ? null : { borderLeftColor: theme.primary, borderLeftWidth: 3 }]}
            >
              <View style={styles.cardHeader}>
                <Ionicons
                  name={TYPE_ICONS[item.type] ?? 'information-circle'}
                  size={22}
                  color={theme.primaryDark}
                />
                <View style={styles.cardInfo}>
                  <ThemedText type="smallBold" numberOfLines={2}>
                    {item.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
                    {item.body}
                  </ThemedText>
                </View>
                {item.read_at ? null : <View style={[styles.dot, { backgroundColor: theme.primary }]} />}
              </View>
              <Divider />
              <ThemedText type="small" themeColor="textSecondary">
                {formatDateTime(item.sent_at || item.scheduled_for || item.created_at)}
              </ThemedText>
            </ThemedView>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: Spacing.four, gap: Spacing.three, paddingBottom: Spacing.six },
  header: { gap: Spacing.one },
  headerMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two, flexWrap: 'wrap' },
  readAll: { flexShrink: 0, borderRadius: 0, borderWidth: 1, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  empty: { borderRadius: 0, padding: Spacing.four, alignItems: 'center' },
  card: { borderRadius: 0, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  cardInfo: { flex: 1, gap: Spacing.one },
  dot: { width: 8, height: 8, borderRadius: 0, marginTop: Spacing.one },
});

