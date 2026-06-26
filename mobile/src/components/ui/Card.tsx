import React, { useCallback } from 'react';
import {
  Pressable,
  View,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { theme } from '../../theme/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  highlighted?: boolean;
  dimmed?: boolean;
  style?: ViewStyle;
}

export function Card({
  children,
  onPress,
  highlighted = false,
  dimmed = false,
  style,
}: CardProps) {
  const getContainerStyle = useCallback(
    (pressed: boolean): ViewStyle => {
      const base: ViewStyle = {
        ...styles.card,
        opacity: dimmed ? 0.4 : pressed ? 0.9 : 1,
      };

      if (highlighted) {
        return {
          ...base,
          borderLeftWidth: 2,
          borderLeftColor: theme.colors.primary,
        };
      }

      return base;
    },
    [highlighted, dimmed]
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={dimmed}
        style={({ pressed }) => [getContainerStyle(pressed), style]}
        accessibilityRole="button"
        accessibilityState={{ disabled: dimmed }}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        highlighted && styles.highlighted,
        dimmed && styles.dimmed,
        style,
      ]}
      accessibilityRole="summary"
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.card,
    minHeight: theme.sizes.cardMinHeight,
    padding: theme.spacing.base,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  highlighted: {
    borderLeftWidth: 2,
    borderLeftColor: theme.colors.primary,
  },
  dimmed: {
    opacity: 0.4,
  },
});

export type { CardProps };
