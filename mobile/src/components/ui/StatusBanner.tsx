import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';

interface StatusBannerProps {
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
}

export function StatusBanner({ status, message }: StatusBannerProps) {
  const getBackgroundColor = () => {
    switch (status) {
      case 'success':
        return theme.colors.primaryLight;
      case 'warning':
        return theme.colors.warningLight;
      case 'error':
        return theme.colors.errorLight;
      case 'info':
        return theme.colors.primaryLight;
    }
  };

  const getTextColor = () => {
    switch (status) {
      case 'success':
        return theme.colors.success;
      case 'warning':
        return theme.colors.warning;
      case 'error':
        return theme.colors.error;
      case 'info':
        return theme.colors.primary;
    }
  };

  return (
    <View
      style={[styles.container, { backgroundColor: getBackgroundColor() }]}
      accessibilityRole="alert"
      accessibilityLabel={message}
    >
      <Text style={[styles.text, { color: getTextColor() }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
  },
  text: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    lineHeight: theme.typography.body.lineHeight,
  },
});

export type { StatusBannerProps };
