import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { StatCard } from './ui/StatCard';
import { theme } from '../theme/theme';
import type { DashboardStats } from '../types';

interface StatMetric {
  label: string;
  value: string | number;
  suffix?: string;
}

interface DashboardStatsSectionProps {
  /** The dashboard data returned from useDashboard */
  data: DashboardStats | undefined;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Whether the query errored */
  isError: boolean;
  /** Refetch callback for retry on error */
  refetch: () => void;
  /** Role-specific metrics to display */
  metrics: StatMetric[];
}

/**
 * Renders a grid of StatCards above the navigation grid on each HomeScreen.
 * Handles loading, error, and empty states gracefully (Req 3.3, 3.4, 3.5).
 */
export function DashboardStatsSection({
  data,
  isLoading,
  isError,
  refetch,
  metrics,
}: DashboardStatsSectionProps) {
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Unable to load stats</Text>
        <Pressable onPress={refetch} style={styles.retryButton}>
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <View style={styles.statsContainer}>
      <View style={styles.statsGrid}>
        {metrics.map((metric, index) => (
          <View key={index} style={styles.statsCell}>
            <StatCard
              label={metric.label}
              value={metric.value}
              suffix={metric.suffix}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsContainer: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statsCell: {
    width: '48%',
    marginBottom: theme.spacing.sm,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.base,
  },
  loadingText: {
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.errorLight,
    borderRadius: theme.borderRadius.card,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  errorText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.error,
  },
  retryButton: {
    marginLeft: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.xs,
    backgroundColor: theme.colors.error,
    borderRadius: theme.borderRadius.button,
  },
  retryText: {
    fontSize: theme.typography.secondary.fontSize,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
