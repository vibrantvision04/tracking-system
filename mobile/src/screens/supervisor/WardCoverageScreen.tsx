import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';

interface WardCoverageItem {
  ward_id: number;
  ward_name: string;
  coverage_percent: number;
  vehicles_active: number;
  drivers_present: number;
  open_depots_submitted: number;
}

interface WardCoverageResponse {
  wards: WardCoverageItem[];
}

export default function WardCoverageScreen({ navigation }: any) {
  const { t } = useTranslation();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wardsCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/wards');
      return res as unknown as WardCoverageResponse;
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

  const wardList = data?.wards || [];

  return (
    <View style={styles.container}>
      <Header
        title={t('menu.wardCoverage')}
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
        <Text style={styles.sectionTitle}>{t('coverage.assignedWardsStatus')}</Text>

        {wardList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('coverage.noWardsData')}</Text>
          </View>
        ) : (
          wardList.map((ward) => {
            const pct = Math.min(100, Math.max(0, ward.coverage_percent));
            const isAchieved = pct >= 80;
            const statusColor = isAchieved ? theme.colors.success : theme.colors.error;
            const statusBgColor = isAchieved ? theme.colors.primaryLight : theme.colors.errorLight;

            return (
              <View key={ward.ward_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.wardName}>{ward.ward_name}</Text>
                  <View style={[styles.pctBadge, { backgroundColor: statusBgColor }]}>
                    <Text style={[styles.pctText, { color: statusColor }]}>{pct.toFixed(1)}%</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${pct}%`, backgroundColor: statusColor }]} />
                </View>

                {/* Status badge */}
                <View style={[styles.statusBadge, { backgroundColor: statusBgColor }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                    {isAchieved ? t('coverage.achieved') : t('coverage.missed')}
                  </Text>
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.vehicles_active}</Text>
                    <Text style={styles.metricLabel}>{t('coverage.activeVehicles')}</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.drivers_present}</Text>
                    <Text style={styles.metricLabel}>{t('coverage.driversPresent')}</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.open_depots_submitted}</Text>
                    <Text style={styles.metricLabel}>{t('coverage.depotsCleaned')}</Text>
                  </View>
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
  sectionTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
    marginBottom: theme.spacing.base,
  },
  emptyContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 1,
  },
  emptyText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  wardName: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    color: theme.colors.textDark,
  },
  pctBadge: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.button,
  },
  pctText: {
    fontWeight: '700',
    fontSize: theme.typography.secondary.fontSize,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: theme.colors.border,
    borderRadius: 4,
    width: '100%',
    marginBottom: theme.spacing.md,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.button,
    marginBottom: theme.spacing.md,
  },
  statusBadgeText: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.spacing.md,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
});
