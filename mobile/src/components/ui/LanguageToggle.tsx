import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { theme } from '../../theme/theme';
import { useLanguage } from '../../i18n/LanguageContext';

interface LanguageToggleProps {
  compact?: boolean;
}

export function LanguageToggle({ compact = false }: LanguageToggleProps) {
  const { language, setLanguage } = useLanguage();

  return (
    <View
      style={[styles.container, compact && styles.containerCompact]}
      accessibilityRole="radiogroup"
      accessibilityLabel="Language selection"
    >
      <Pressable
        onPress={() => setLanguage('hi')}
        style={({ pressed }) => [
          styles.segment,
          compact && styles.segmentCompact,
          language === 'hi' ? styles.segmentActive : styles.segmentInactive,
          pressed && language !== 'hi' && styles.segmentPressed,
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected: language === 'hi' }}
        accessibilityLabel="हिंदी"
      >
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            language === 'hi' ? styles.labelActive : styles.labelInactive,
          ]}
        >
          हिंदी
        </Text>
      </Pressable>

      <Pressable
        onPress={() => setLanguage('en')}
        style={({ pressed }) => [
          styles.segment,
          compact && styles.segmentCompact,
          language === 'en' ? styles.segmentActive : styles.segmentInactive,
          pressed && language !== 'en' && styles.segmentPressed,
        ]}
        accessibilityRole="radio"
        accessibilityState={{ selected: language === 'en' }}
        accessibilityLabel="English"
      >
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            language === 'en' ? styles.labelActive : styles.labelInactive,
          ]}
        >
          English
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: theme.borderRadius.button,
    backgroundColor: theme.colors.background,
    padding: 2,
  },
  containerCompact: {
    padding: 1,
  },
  segment: {
    minWidth: theme.sizes.touchTarget,
    minHeight: theme.sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.button - 2,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  segmentCompact: {
    minHeight: 40,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  segmentActive: {
    backgroundColor: theme.colors.primary,
  },
  segmentInactive: {
    backgroundColor: 'transparent',
  },
  segmentPressed: {
    opacity: 0.7,
  },
  label: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
  labelCompact: {
    fontSize: theme.typography.secondary.fontSize,
  },
  labelActive: {
    color: theme.colors.surface,
  },
  labelInactive: {
    color: theme.colors.textDark,
  },
});

export type { LanguageToggleProps };
