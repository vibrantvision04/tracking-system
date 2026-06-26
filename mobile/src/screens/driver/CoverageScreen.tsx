import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';

export default function CoverageScreen({ navigation }: any) {
  const { t } = useTranslation();

  const { data: cov, isLoading, refetch } = useQuery({
    queryKey: ['myCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/my');
      return res as any;
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

  const pct = cov?.coverage_percent || 0;
  const target = 80; // default coverage target percentage
  const isAchieved = pct >= target;
  const ringColor = isAchieved ? theme.colors.success : theme.colors.error;

  return (
    <View style={styles.screen}>
      <Header
        title={t('coverage.title')}
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

      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentContainer}>
        {/* Coverage Progress Ring Card */}
        <View style={styles.card}>
          <View style={[styles.progressRingOuter, { borderColor: ringColor }]}>
            <View style={styles.progressRingInner}>
              <Text style={[styles.progressPctText, { color: ringColor }]}>
                {pct.toFixed(0)}%
              </Text>
              <Text style={styles.progressLabelText}>{t('coverage.percentage')}</Text>
            </View>
          </View>

          {/* Achievement Status Badge */}
          <View style={[styles.statusBadge, { backgroundColor: isAchieved ? theme.colors.primaryLight : theme.colors.errorLight }]}>
            <Text style={[styles.statusBadgeText, { color: isAchieved ? theme.colors.success : theme.colors.error }]}>
              {isAchieved ? t('coverage.achieved') : t('coverage.missed')}
            </Text>
          </View>

          <Text style={styles.achievedText}>
            {t('coverage.target')}: {target}% | {t('coverage.actual')}: {pct.toFixed(0)}%
          </Text>

          {/* Divider */}
          <View style={styles.divider} />

          {/* Status Breakdown Row */}
          <View style={styles.statusRow}>
            <View style={styles.statusCol}>
              <Text style={[styles.statusCount, { color: theme.colors.success }]}>
                {cov?.achieved || 0}
              </Text>
              <Text style={styles.statusLabel}>{t('coverage.achieved')}</Text>
            </View>

            <View style={styles.statusCol}>
              <Text style={[styles.statusCount, { color: theme.colors.warning }]}>
                {cov?.pending_approval || 0}
              </Text>
              <Text style={styles.statusLabel}>{t('coverage.inProgress')}</Text>
            </View>

            <View style={styles.statusCol}>
              <Text style={[styles.statusCount, { color: theme.colors.error }]}>
                {cov?.missed || 0}
              </Text>
              <Text style={styles.statusLabel}>{t('coverage.missed')}</Text>
            </View>
          </View>
        </View>

        {/* Shift Information Card */}
        <View style={styles.shiftCard}>
          <Text style={styles.shiftTitle}>⏱️ {t('home.punchedIn')}</Text>
          <Text style={styles.shiftText}>
            {t('coverage.actual')}: {cov?.achieved || 0} / {cov?.total_lane_points || 0}
          </Text>
          <Text style={styles.shiftText}>
            {cov?.shift_end
              ? new Date(cov.shift_end).toLocaleTimeString()
              : '—'}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
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
  scrollContentContainer: {
    padding: theme.spacing.base,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 2,
    marginBottom: theme.spacing.base,
  },
  progressRingOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  progressRingInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPctText: {
    fontSize: 32,
    fontWeight: '700',
  },
  progressLabelText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    fontWeight: '600',
    marginTop: theme.spacing.xs,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.button,
    marginBottom: theme.spacing.md,
  },
  statusBadgeText: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '600',
  },
  achievedText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.base,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    width: '100%',
    marginBottom: theme.spacing.base,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statusCol: {
    alignItems: 'center',
  },
  statusCount: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: '700',
  },
  statusLabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    marginTop: theme.spacing.xs,
  },
  shiftCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    borderWidth: 1,
    borderColor: theme.colors.border,
    elevation: 2,
  },
  shiftTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.sm,
  },
  shiftText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
    lineHeight: theme.typography.secondary.lineHeight,
    marginBottom: theme.spacing.xs,
  },
});
