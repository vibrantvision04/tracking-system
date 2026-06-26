import React, { useCallback } from 'react';
import {
  Pressable,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { theme } from '../../theme/theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  size?: 'default' | 'small';
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  size = 'default',
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const getContainerStyle = useCallback(
    (pressed: boolean): ViewStyle => {
      const base: ViewStyle = {
        height: size === 'small' ? theme.sizes.touchTarget : theme.sizes.buttonHeight,
        borderRadius: theme.borderRadius.button,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: theme.spacing.base,
      };

      switch (variant) {
        case 'primary':
          return {
            ...base,
            backgroundColor: pressed
              ? theme.colors.primaryHover
              : theme.colors.primary,
            opacity: pressed ? 0.9 : 1,
          };
        case 'secondary':
          return {
            ...base,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.primary,
          };
        case 'danger':
          return {
            ...base,
            backgroundColor: theme.colors.error,
            opacity: pressed ? 0.9 : 1,
          };
        default:
          return base;
      }
    },
    [variant, size]
  );

  const textStyle: TextStyle = (() => {
    switch (variant) {
      case 'primary':
        return { color: theme.colors.surface };
      case 'secondary':
        return { color: theme.colors.primary };
      case 'danger':
        return { color: theme.colors.surface };
      default:
        return { color: theme.colors.surface };
    }
  })();

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        getContainerStyle(pressed),
        isDisabled && styles.disabled,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'secondary' ? theme.colors.primary : theme.colors.surface}
          size="small"
        />
      ) : (
        <Text style={[styles.text, textStyle]}>{title}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    lineHeight: theme.typography.body.lineHeight,
  },
  disabled: {
    opacity: 0.5,
  },
});

export type { ButtonProps };
