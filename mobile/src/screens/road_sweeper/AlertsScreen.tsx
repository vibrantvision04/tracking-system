import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator, Pressable } from 'react-native';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';

export default function SweeperAlertsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/alerts/my') as any;
        setAlerts(res?.alerts || []);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderItem = ({ item }: any) => (
    <View style={[styles.alert, !item.read && styles.unread]}>
      <View style={styles.alertHeader}>
        <Text style={styles.alertType}>{item.type}</Text>
        <Text style={[styles.severity, styles[item.severity]]}>{item.severity}</Text>
      </View>
      <Text style={styles.alertMessage}>{item.message}</Text>
      <Text style={styles.alertTime}>{new Date(item.created_at).toLocaleString()}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title={t('menu.alerts')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
        {!loading && (
          <FlatList data={alerts} keyExtractor={(item) => item.id} renderItem={renderItem}
            ListEmptyComponent={<Text style={styles.empty}>{t('alerts.noAlerts')}</Text>} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.base, paddingTop: theme.sizes.headerHeight + theme.spacing.base },
  alert: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, marginBottom: theme.spacing.sm, borderLeftWidth: 3, borderLeftColor: theme.colors.border },
  unread: { borderLeftColor: theme.colors.primary },
  alertHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  alertType: { fontSize: theme.typography.secondary.fontSize, fontWeight: '600', color: theme.colors.textDark, textTransform: 'capitalize' },
  severity: { fontSize: theme.typography.caption.fontSize, fontWeight: '600', textTransform: 'uppercase' },
  minor: { color: theme.colors.warning },
  major: { color: theme.colors.error },
  critical: { color: '#d9534f' },
  alertMessage: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDark, lineHeight: 20, marginBottom: 4 },
  alertTime: { fontSize: theme.typography.caption.fontSize, color: theme.colors.textDim },
  empty: { textAlign: 'center', color: theme.colors.textDim, marginTop: theme.spacing.xl },
});
