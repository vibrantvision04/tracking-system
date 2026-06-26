import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme/theme';

interface HeaderProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
  rightActions?: Array<{
    icon: string;
    onPress: () => void;
    accessibilityLabel: string;
  }>;
}

export function Header({
  title,
  showBack = false,
  onBack,
  rightActions = [],
}: HeaderProps) {
  const visibleActions = rightActions.slice(0, 2);

  return (
    <View style={styles.container} accessibilityRole="header">
      <View style={styles.leftSection}>
        {showBack && (
          <Pressable
            onPress={onBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
          </Pressable>
        )}
      </View>

      <Text
        style={styles.title}
        numberOfLines={1}
        accessibilityRole="header"
      >
        {title}
      </Text>

      <View style={styles.rightSection}>
        {visibleActions.map((action, index) => (
          <Pressable
            key={index}
            onPress={action.onPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel={action.accessibilityLabel}
          >
            <Ionicons name={action.icon as any} size={22} color={theme.colors.primary} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: theme.sizes.headerHeight,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  leftSection: {
    width: theme.sizes.touchTarget,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backButton: {
    width: theme.sizes.touchTarget,
    height: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    lineHeight: theme.typography.heading.lineHeight,
    color: theme.colors.textDark,
    overflow: 'hidden',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  actionButton: {
    width: theme.sizes.touchTarget,
    height: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type { HeaderProps };
