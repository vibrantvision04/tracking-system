import React, { useState, useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { useAlerts } from '../../hooks/useAlerts';
import { Header } from '../../components/ui/Header';
import { StatusBanner } from '../../components/ui/StatusBanner';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';

function getGreetingKey(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'home.greeting.morning';
  if (hour < 17) return 'home.greeting.afternoon';
  return 'home.greeting.evening';
}

interface MenuItem {
  key: string;
  icon: string;
  titleKey: string;
  subtitleKey: string;
  route: string;
  alwaysAccessible?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'punchIn',
    icon: '⏰',
    titleKey: 'menu.punchIn',
    subtitleKey: 'menu.punchIn.subtitle',
    route: 'DriverPunchIn',
    alwaysAccessible: true,
  },
  {
    key: 'alerts',
    icon: '🔔',
    titleKey: 'menu.alerts',
    subtitleKey: 'menu.alerts.subtitle',
    route: 'DriverAlerts',
  },
  {
    key: 'coverage',
    icon: '📈',
    titleKey: 'menu.coverage',
    subtitleKey: 'menu.coverage.subtitle',
    route: 'DriverCoverage',
  },
  {
    key: 'routeMap',
    icon: '🗺️',
    titleKey: 'menu.routeMap',
    subtitleKey: 'menu.routeMap.subtitle',
    route: 'DriverRouteMap',
  },
  {
    key: 'blockage',
    icon: '🚧',
    titleKey: 'menu.blockage',
    subtitleKey: 'menu.blockage.subtitle',
    route: 'DriverBlockage',
  },
  {
    key: 'liveTracking',
    icon: '📍',
    titleKey: 'menu.liveTracking',
    subtitleKey: 'menu.liveTracking.subtitle',
    route: 'DriverLiveTracking',
  },
  {
    key: 'attendance',
    icon: '📋',
    titleKey: 'menu.attendance',
    subtitleKey: 'menu.attendance.subtitle',
    route: 'DriverAttendance',
  },
];

export default function DriverHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: punchData } = usePunchStatus();
  const { data: alertData } = useAlerts();
  const { t } = useTranslation();

  const [restrictionMessage, setRestrictionMessage] = useState<string | null>(null);

  const isPunchedIn = !!(punchData && punchData.punched_in);

  const unacknowledgedAlertCount = useMemo(() => {
    if (!alertData?.alerts) return 0;
    return alertData.alerts.filter((a: any) => !a.acknowledged).length;
  }, [alertData]);

  const greetingText = t(getGreetingKey());

  const handleCardPress = (item: MenuItem) => {
    setRestrictionMessage(null);
    navigation.navigate(item.route);
  };

  return (
    <View style={styles.screen}>
      {/* Header with greeting and logout */}
      <Header
        title={`${greetingText}, ${user?.name || 'Driver'}`}
        rightActions={[
          {
            icon: 'log-out-outline',
            onPress: logout,
            accessibilityLabel: t('common.logout'),
          },
        ]}
      />

      {/* Scrollable content below the fixed header */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Punch Status Banner */}
        <StatusBanner
          status={isPunchedIn ? 'success' : 'warning'}
          message={isPunchedIn ? t('home.punchedIn') : t('home.notPunchedIn')}
        />

        {/* Alert Banner */}
        {unacknowledgedAlertCount > 0 && (
          <StatusBanner
            status="error"
            message={t('home.alertsBanner').replace('{count}', String(unacknowledgedAlertCount))}
          />
        )}

        {/* Restriction message (inline) */}
        {restrictionMessage && (
          <View style={styles.restrictionBanner}>
            <Text style={styles.restrictionText}>{restrictionMessage}</Text>
          </View>
        )}

        {/* 2-column navigation grid */}
        <View style={styles.gridContainer}>
          <View style={styles.grid}>
            {MENU_ITEMS.map((item) => {
              const isDimmed = !item.alwaysAccessible && !isPunchedIn;
              const isHighlighted = item.key === 'punchIn';

              if (isDimmed) {
                return (
                  <View key={item.key} style={styles.gridCell}>
                    <Pressable onPress={() => setRestrictionMessage(t('home.punchInRequired'))}>
                      <Card
                        highlighted={isHighlighted}
                        dimmed={true}
                        style={styles.navCard}
                      >
                        <Text style={styles.cardIcon}>{item.icon}</Text>
                        <Text style={styles.cardTitle}>{t(item.titleKey)}</Text>
                        <Text style={styles.cardSubtitle}>{t(item.subtitleKey)}</Text>
                      </Card>
                    </Pressable>
                  </View>
                );
              }

              return (
                <View key={item.key} style={styles.gridCell}>
                  <Card
                    onPress={() => handleCardPress(item)}
                    highlighted={isHighlighted}
                    dimmed={false}
                    style={styles.navCard}
                  >
                    <Text style={styles.cardIcon}>{item.icon}</Text>
                    <Text style={styles.cardTitle}>{t(item.titleKey)}</Text>
                    <Text style={styles.cardSubtitle}>{t(item.subtitleKey)}</Text>
                  </Card>
                </View>
              );
            })}
          </View>
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
  scrollView: {
    flex: 1,
    marginTop: theme.sizes.headerHeight,
  },
  scrollContent: {
    padding: theme.spacing.base,
    paddingBottom: theme.spacing.xl,
  },
  restrictionBanner: {
    backgroundColor: theme.colors.warningLight,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
  },
  restrictionText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
  gridContainer: {
    marginTop: theme.spacing.base,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridCell: {
    width: '48%',
    marginBottom: theme.spacing.base,
  },
  navCard: {
    minHeight: theme.sizes.cardMinHeight,
  },
  cardIcon: {
    fontSize: 28,
    marginBottom: theme.spacing.sm,
  },
  cardTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.xs,
  },
  cardSubtitle: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    lineHeight: theme.typography.caption.lineHeight,
  },
});
