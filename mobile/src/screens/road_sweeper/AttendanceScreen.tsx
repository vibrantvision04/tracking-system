import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, ActivityIndicator } from 'react-native';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';

export default function SweeperAttendanceScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/attendance/list', { params: { page_size: 20 } }) as any;
        setRecords(res?.items || []);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const renderItem = ({ item }: any) => (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.date}>{item.date}</Text>
        <Text style={styles.status}>{item.status}</Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={styles.time}>{item.check_in ? new Date(item.check_in).toLocaleTimeString() : '-'}</Text>
        <Text style={styles.time}>{item.check_out ? new Date(item.check_out).toLocaleTimeString() : '-'}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <Header title={t('menu.attendance')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
        {!loading && (
          <FlatList data={records} keyExtractor={(item) => item.id} renderItem={renderItem}
            ListEmptyComponent={<Text style={styles.empty}>{t('attendance.noRecords')}</Text>} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.base, paddingTop: theme.sizes.headerHeight + theme.spacing.base },
  row: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, marginBottom: theme.spacing.sm },
  rowLeft: { flex: 1 },
  rowRight: { alignItems: 'flex-end' },
  date: { fontSize: theme.typography.body.fontSize, fontWeight: '600', color: theme.colors.textDark },
  status: { fontSize: theme.typography.caption.fontSize, color: theme.colors.textDim, marginTop: 4, textTransform: 'capitalize' },
  time: { fontSize: theme.typography.caption.fontSize, color: theme.colors.textDim, marginTop: 2 },
  empty: { textAlign: 'center', color: theme.colors.textDim, marginTop: theme.spacing.xl },
});
