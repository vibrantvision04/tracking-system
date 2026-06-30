import React from 'react';
import { StyleSheet, Text, ViewStyle } from 'react-native';
import { Card } from './Card';
import { theme } from '../../theme/theme';

interface StatCardProps {
  label: string;
  value: string | number;
  suffix?: string;
  style?: ViewStyle;
}

/**
 * Lightweight stat card for dashboard metrics.
 * Reuses the existing Card component for consistent styling.
 */
export function StatCard({ label, value, suffix, style }: StatCardProps) {
  const cardStyle: ViewStyle = { ...styles.statCard, ...style };

  return (
    <Card style={cardStyle}>
      <Text style={styles.value} numberOfLines={1}>
        {value}
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  statCard: {
    minHeight: 80,
    padding: theme.spacing.md,
    justifyContent: 'center',
  },
  value: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: '700',
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
  },
  suffix: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '400',
    color: theme.colors.textDim,
  },
  label: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    lineHeight: theme.typography.caption.lineHeight,
  },
});

export type { StatCardProps };
