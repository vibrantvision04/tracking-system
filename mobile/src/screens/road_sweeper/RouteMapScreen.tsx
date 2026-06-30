import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';

interface SweepingRoute {
  route: {
    id: number;
    route_code: string;
    ward_id: number;
    name: string;
    polyline: { lat: number; lng: number }[];
    point_a: { lat: number; lng: number };
    point_b: { lat: number; lng: number };
    point_a_radius_m: number;
    point_b_radius_m: number;
    length_m: number | null;
    direction: string;
  };
  punched_in: boolean;
  current_position: { lat: number | null; lng: number | null };
  today_task: { id: number | null; status: string | null };
}

export default function SweeperRouteMapScreen({ navigation }: any) {
  const { t } = useTranslation();
  const [data, setData] = useState<SweepingRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/sweeping/route') as any;
        setData(res as SweepingRoute);
      } catch (e: any) {
        setError(e.message || 'Failed to load route');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Header title={t('menu.routeMap')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
        {error && <Text style={styles.error}>{error}</Text>}
        {data && (
          <>
            <View style={styles.card}>
              <Text style={styles.routeName}>{data.route.name}</Text>
              <Text style={styles.routeCode}>{data.route.route_code}</Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.label}>{t('route.length')}: {data.route.length_m ? `${(data.route.length_m / 1000).toFixed(2)} km` : 'N/A'}</Text>
              <Text style={styles.label}>{t('route.direction')}: {data.route.direction}</Text>
            </View>
            {data.punched_in ? (
              <View style={styles.card}>
                <Text style={styles.info}>{t('route.pointA')}: {data.route.point_a.lat.toFixed(6)}, {data.route.point_a.lng.toFixed(6)}</Text>
                <Text style={styles.info}>{t('route.pointB')}: {data.route.point_b.lat.toFixed(6)}, {data.route.point_b.lng.toFixed(6)}</Text>
                <Text style={styles.info}>{t('route.radius')}: {data.route.point_a_radius_m}m / {data.route.point_b_radius_m}m</Text>
              </View>
            ) : (
              <Text style={styles.punchRequired}>{t('home.punchInRequired')}</Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.base, paddingTop: theme.sizes.headerHeight + theme.spacing.base },
  card: { backgroundColor: theme.colors.surface, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, marginBottom: theme.spacing.base },
  routeName: { fontSize: theme.typography.heading.fontSize, fontWeight: '600', color: theme.colors.textDark },
  routeCode: { fontSize: theme.typography.secondary.fontSize, color: theme.colors.textDim, marginTop: 4 },
  label: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDark, marginTop: 4 },
  info: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDark, marginTop: 4 },
  punchRequired: { textAlign: 'center', color: theme.colors.warning, fontSize: theme.typography.body.fontSize, marginTop: theme.spacing.xl },
  error: { color: theme.colors.error, textAlign: 'center' },
});
