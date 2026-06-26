import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, ViewStyle, Platform, StatusBar as RNStatusBar } from 'react-native';
import { useNetwork } from '../hooks/useNetwork';
import { useTranslation } from '../i18n/useTranslation';
import { theme } from '../theme/theme';

const RECONNECTION_DELAY_MS = 3000;
const DIMMED_OPACITY = 0.5;

/**
 * Custom hook that tracks offline status with a 3-second delay
 * before reporting "online" after reconnection. This prevents
 * rapid flashing of UI when connectivity is unstable.
 *
 * Returns `true` when the device should be considered offline
 * (including the 3s grace period after reconnection).
 */
export function useOfflineStatus(): boolean {
  const isConnected = useNetwork();
  const [showOffline, setShowOffline] = useState(!isConnected);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isConnected) {
      // Immediately show offline state
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setShowOffline(true);
    } else {
      // Delay hiding the offline state by 3 seconds
      timerRef.current = setTimeout(() => {
        setShowOffline(false);
        timerRef.current = null;
      }, RECONNECTION_DELAY_MS);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isConnected]);

  return showOffline;
}

/**
 * Wrapper component that dims its children when the device is offline.
 * Use this around network-dependent action buttons to visually indicate
 * unavailability per Requirement 13.2.
 *
 * Props:
 * - `children`: Content to dim when offline
 * - `style`: Additional styles to apply to the wrapper View
 * - `disableInteraction`: When true (default), sets pointerEvents="none" while offline
 *
 * Usage:
 * ```tsx
 * <NetworkDependentView>
 *   <Button title={t('common.submit')} onPress={handleSubmit} />
 * </NetworkDependentView>
 * ```
 */
export function NetworkDependentView({
  children,
  style,
  disableInteraction = true,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  disableInteraction?: boolean;
}) {
  const isOffline = useOfflineStatus();

  return (
    <View
      style={[
        { opacity: isOffline ? DIMMED_OPACITY : 1 },
        style,
      ]}
      pointerEvents={isOffline && disableInteraction ? 'none' : 'auto'}
      accessibilityState={{ disabled: isOffline }}
    >
      {children}
    </View>
  );
}

/**
 * Persistent amber banner displayed at the top of the screen
 * when the device has no network connectivity. Disappears 3 seconds
 * after connectivity is restored.
 */
export default function OfflineBanner() {
  const isOffline = useOfflineStatus();
  const { t } = useTranslation();

  if (!isOffline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.text}>{t('offline.banner')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: theme.colors.warning,
    width: '100%',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 9999,
    paddingTop: Platform.OS === 'ios'
      ? 44
      : RNStatusBar.currentHeight
        ? RNStatusBar.currentHeight + theme.spacing.sm
        : theme.spacing.md,
  },
  text: {
    color: theme.colors.textDark,
    fontSize: theme.typography.caption.fontSize + 1, // 13px
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
