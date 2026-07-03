import React from 'react';
import { StyleSheet, Text, View, ScrollView, Alert, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { Header } from '../../components/ui/Header';
import { StatusBanner } from '../../components/ui/StatusBanner';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { api } from '../../services/api';

interface MenuItem {
  key: string;
  iconName: keyof typeof Ionicons.glyphMap;
  titleKey: string;
  subtitleKey: string;
  route: string | null;
  alwaysAccessible?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'punchIn',
    iconName: 'alarm-outline',
    titleKey: 'menu.punchIn',
    subtitleKey: 'menu.punchIn.subtitle',
    route: 'ZoneManagerPunchIn',
    alwaysAccessible: true,
  },
  {
    key: 'zoneCoverage',
    iconName: 'trending-up-outline',
    titleKey: 'menu.zoneCoverage',
    subtitleKey: 'menu.zoneCoverage.subtitle',
    route: 'ZoneCoverage',
  },
  {
    key: 'liveTracking',
    iconName: 'map-outline',
    titleKey: 'menu.liveTracking',
    subtitleKey: 'menu.liveTracking.subtitle',
    route: 'ZoneManagerLiveTracking',
  },
  {
    key: 'attendancePanel',
    iconName: 'people-outline',
    titleKey: 'menu.attendancePanel',
    subtitleKey: 'menu.attendancePanel.subtitle',
    route: 'ZoneManagerAttendance',
  },
  {
    key: 'zoneAlerts',
    iconName: 'notifications-outline',
    titleKey: 'menu.zoneAlerts',
    subtitleKey: 'menu.zoneAlerts.subtitle',
    route: 'ZoneManagerAlerts',
  },
  {
    key: 'complaints',
    iconName: 'flag-outline',
    titleKey: 'menu.complaints',
    subtitleKey: 'menu.complaints.subtitle',
    route: 'Complaints',
  },
];

export default function ZoneManagerHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: punchData, refetch: refetchPunch } = usePunchStatus();
  const { t } = useTranslation();

  const [restrictionMessage, setRestrictionMessage] = React.useState<string | null>(null);

  const isPunchedIn = !!(punchData && punchData.punched_in);
  const showPunchOut = isPunchedIn && !!(punchData && punchData.manual_punchout_enabled);

  const handlePunchOut = () => {
    Alert.alert(
      t('common.punchOut'),
      'Are you sure you want to punch out of your zone manager shift?',
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.punchOut'),
          onPress: async () => {
            try {
              await api.post('/attendance/punch-out');
              Alert.alert('Success', 'Punched out successfully');
              refetchPunch();
            } catch (err: any) {
              Alert.alert(t('common.error'), err?.message || 'Failed to punch out');
            }
          },
        },
      ]
    );
  };

  const handleCardPress = (item: MenuItem) => {
    if (item.route === null) {
      Alert.alert('Coming Soon', 'This feature is not yet available in Phase 1.');
      return;
    }
    setRestrictionMessage(null);
    navigation.navigate(item.route);
  };

  const headerActions = [];

  if (showPunchOut) {
    headerActions.push({
      icon: 'stop-circle-outline',
      onPress: handlePunchOut,
      accessibilityLabel: t('common.punchOut'),
    });
  }

  headerActions.push({
    icon: 'log-out-outline',
    onPress: logout,
    accessibilityLabel: t('common.logout'),
  });

  return (
    <View style={styles.screen}>
      <Header
        title={t('zoneManager.title')}
        rightActions={headerActions}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Zone Manager name */}
        <View style={styles.nameContainer}>
          <Text style={styles.nameText}>{user?.name || 'Zone Manager'}</Text>
        </View>

        {/* Punch Status Banner */}
        <StatusBanner
          status={isPunchedIn ? 'success' : 'warning'}
          message={isPunchedIn ? t('home.punchedIn') : t('home.notPunchedIn')}
        />

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
              const isDimmed = (item.key === 'punchIn' && isPunchedIn) || (!item.alwaysAccessible && !isPunchedIn);
              const isHighlighted = item.key === 'punchIn' && !isPunchedIn;

              if (isDimmed) {
                const restrictionText = (item.key === 'punchIn' && isPunchedIn)
                  ? "You are already punched in for your active shift."
                  : t('home.punchInRequired');
                return (
                  <View key={item.key} style={styles.gridCell}>
                    <Pressable onPress={() => setRestrictionMessage(restrictionText)}>
                      <Card
                        highlighted={isHighlighted}
                        dimmed={true}
                        style={styles.navCard}
                      >
                        <Ionicons name={item.iconName} size={28} color={theme.colors.primary} style={styles.cardIcon} />
                        <Text style={styles.cardTitle}>{t(item.titleKey)}</Text>
                        <Text style={styles.cardSubtitle}>
                          {item.key === 'punchIn' && isPunchedIn ? "Shift in progress" : t(item.subtitleKey)}
                        </Text>
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
                    <Ionicons name={item.iconName} size={28} color={theme.colors.primary} style={styles.cardIcon} />
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
  nameContainer: {
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  nameText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
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
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
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
  restrictionBanner: {
    backgroundColor: theme.colors.warningLight,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.card,
    marginBottom: theme.spacing.base,
  },
  restrictionText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.warning,
    fontWeight: '600',
    textAlign: 'center',
  },
});
