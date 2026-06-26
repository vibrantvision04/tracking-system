import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';

interface WardItem {
  ward_id: number;
  ward_name: string;
  coverage_percent: number;
}

interface ZoneDetails {
  id: number;
  name: string;
  total_wards: number;
  total_vehicles: number;
}

interface ZoneCoverageResponse {
  zone: ZoneDetails;
  coverage_percent: number;
  active_vehicles: number;
  drivers_present: number;
  wards: WardItem[];
}

export default function ZoneCoverageScreen({ navigation }: any) {
  const { t } = useTranslation();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/zone');
      return res as unknown as ZoneCoverageResponse;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const zone = data?.zone;
  const overallPct = data?.coverage_percent || 0;
  const isOverallAchieved = overallPct >= 80;
  const overallColor = isOverallAchieved ? theme.colors.success : theme.colors.error;
  const overallBgColor = isOverallAchieved ? theme.colors.primaryLight : theme.colors.errorLight;
  const wardList = data?.wards || [];

  return (
    <View style={styles.container}>
      <Header
        title={t('menu.zoneCoverage')}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightActions={[
          {
            icon: 'refresh',
            onPress: () => refetch(),
            accessibilityLabel: t('common.retry'),
          },
        ]}
      />

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[theme.colors.primary]} />
        }
      >
        {/* Zone Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.zoneName}>{zone?.name || t('menu.zoneCoverage')}</Text>

          <View style={styles.mainProgressContainer}>
            <View style={[styles.circleMarker, { borderColor: overallColor, backgroundColor: overallBgColor }]}>
              <Text style={[styles.circlePercent, { color: overallColor }]}>{overallPct.toFixed(1)}%</Text>
              <Text style={[styles.circleLabel, { color: overallColor }]}>{t('coverage.percentage')}</Text>
            </View>

            <View style={styles.mainStats}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{t('coverage.totalWards')}:</Text>
                <Text style={styles.statVal}>{zone?.total_wards || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{t('coverage.vehiclesActive')}:</Text>
                <Text style={styles.statVal}>{data?.active_vehicles || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>{t('coverage.driversPresent')}:</Text>
                <Text style={styles.statVal}>{data?.drivers_present || 0}</Text>
              </View>
            </View>
          </View>

          {/* Overall status badge */}
          <View style={[styles.statusBadge, { backgroundColor: overallBgColor }]}>
            <Text style={[styles.statusBadgeText, { color: overallColor }]}>
              {isOverallAchieved ? t('coverage.achieved') : t('coverage.missed')}
            </Text>
          </View>
        </View>

        {/* Wards Breakdown */}
        <Text style={styles.sectionTitle}>{t('coverage.wardsPerformance')}</Text>

        {wardList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('coverage.noWardsPerformanceData')}</Text>
          </View>
        ) : (
          wardList.map((ward) => {
            const pct = Math.min(100, Math.max(0, ward.coverage_percent));
            const isAchieved = pct >= 80;
            const statusColor = isAchieved ? theme.colors.success : theme.colors.error;

            return (
              <View key={ward.ward_id} style={styles.wardCard}>
                <View style={styles.wardCardHeader}>
                  <Text style={styles.wardName}>{ward.ward_name}</Text>
                  <Text style={[styles.wardPct, { color: statusColor }]}>{pct.toFixed(1)}%</Text>
                </View>

                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textDim,
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
  },
  scrollContent: {
    flex: 1,
    marginTop: theme.sizes.headerHeight,
  },
  scrollContainer: {
    padding: theme.spacing.base,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  zoneName: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    color: theme.colors.textDark,
    marginBottom: theme.spacing.base,
  },
  mainProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: theme.spacing.base,
  },
  circleMarker: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  circlePercent: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: '700',
  },
  circleLabel: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  mainStats: {
    flex: 1,
    marginLeft: theme.spacing.lg,
    gap: theme.spacing.sm,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
  },
  statVal: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '700',
    color: theme.colors.textDark,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.button,
  },
  statusBadgeText: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
    marginBottom: theme.spacing.base,
  },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  emptyText: {
    color: theme.colors.textDim,
    fontSize: theme.typography.secondary.fontSize,
  },
  wardCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 1,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  wardCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  wardName: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  wardPct: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '700',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
});
