import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';

export default function SweeperCoverageScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/sweeping/coverage') as any;
        setData(res);
      } catch {
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Header title={t('menu.coverage')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
        {data && (
          <>
            <View style={styles.card}>
              <Text style={styles.pct}>{data.coverage_pct.toFixed(1)}%</Text>
              <Text style={styles.label}>{t('coverage.complete')}</Text>
            </View>
            <View style={styles.row}>
              <View style={styles.stat}><Text style={styles.statValue}>{data.covered_segments}</Text><Text style={styles.statLabel}>{t('coverage.covered')}</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{data.total_segments}</Text><Text style={styles.statLabel}>{t('coverage.total')}</Text></View>
            </View>
            <View style={styles.row}>
              <View style={styles.stat}><Text style={styles.statValue}>{(data.covered_distance_m / 1000).toFixed(2)} km</Text><Text style={styles.statLabel}>{t('coverage.distance')}</Text></View>
              <View style={styles.stat}><Text style={styles.statValue}>{data.approval_status}</Text><Text style={styles.statLabel}>{t('coverage.status')}</Text></View>
            </View>
          </>
        )}
        {!loading && !data && <Text style={styles.empty}>{t('coverage.noData')}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.base, paddingTop: theme.sizes.headerHeight + theme.spacing.base },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.card, padding: theme.spacing.xl, alignItems: 'center', marginBottom: theme.spacing.base },
  pct: { fontSize: 48, fontWeight: '700', color: theme.colors.primary },
  label: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDim, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, margin: 4, alignItems: 'center' },
  statValue: { fontSize: theme.typography.heading.fontSize, fontWeight: '600', color: theme.colors.textDark },
  statLabel: { fontSize: theme.typography.caption.fontSize, color: theme.colors.textDim, marginTop: 4 },
  empty: { textAlign: 'center', color: theme.colors.textDim, marginTop: theme.spacing.xl, fontSize: theme.typography.body.fontSize },
});
