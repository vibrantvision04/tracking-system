import React from 'react';
import { StyleSheet, Text, View, ScrollView, Alert } from 'react-native';
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
  icon: string;
  titleKey: string;
  subtitleKey: string;
  route: string | null;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'punchIn',
    icon: '⏰',
    titleKey: 'menu.punchIn',
    subtitleKey: 'menu.punchIn.subtitle',
    route: 'SupervisorPunchIn',
  },
  {
    key: 'markAttendance',
    icon: '👥',
    titleKey: 'menu.markAttendance',
    subtitleKey: 'menu.markAttendance.subtitle',
    route: 'DriverAttendance',
  },
  {
    key: 'wardCoverage',
    icon: '📈',
    titleKey: 'menu.wardCoverage',
    subtitleKey: 'menu.wardCoverage.subtitle',
    route: 'WardCoverage',
  },
  {
    key: 'liveTracking',
    icon: '🗺️',
    titleKey: 'menu.liveTracking',
    subtitleKey: 'menu.liveTracking.subtitle',
    route: 'SupervisorLiveTracking',
  },
  {
    key: 'blockageApprovals',
    icon: '⚠️',
    titleKey: 'menu.blockageApprovals',
    subtitleKey: 'menu.blockageApprovals.subtitle',
    route: 'BlockageApprovals',
  },
  {
    key: 'openDepot',
    icon: '🗑️',
    titleKey: 'menu.openDepot',
    subtitleKey: 'menu.openDepot.subtitle',
    route: 'SupervisorOpenDepot',
  },
  {
    key: 'wardAlerts',
    icon: '🔔',
    titleKey: 'menu.wardAlerts',
    subtitleKey: 'menu.wardAlerts.subtitle',
    route: 'SupervisorAlerts',
  },
  {
    key: 'complaints',
    icon: '🚩',
    titleKey: 'menu.complaints',
    subtitleKey: 'menu.complaints.subtitle',
    route: null,
  },
];

export default function SupervisorHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: punchData, refetch: refetchPunch } = usePunchStatus();
  const { t } = useTranslation();

  const isPunchedIn = !!(punchData && punchData.punched_in);
  const showPunchOut = isPunchedIn && !!(punchData && punchData.manual_punchout_enabled);

  const handlePunchOut = () => {
    Alert.alert(
      t('common.punchOut'),
      'Are you sure you want to punch out of your supervisor shift?',
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
        title={`${t('supervisor.title')}`}
        rightActions={headerActions}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Supervisor name */}
        <View style={styles.nameContainer}>
          <Text style={styles.nameText}>{user?.name || 'Supervisor'}</Text>
        </View>

        {/* Punch Status Banner */}
        <StatusBanner
          status={isPunchedIn ? 'success' : 'warning'}
          message={isPunchedIn ? t('home.punchedIn') : t('home.notPunchedIn')}
        />

        {/* 2-column navigation grid */}
        <View style={styles.gridContainer}>
          <View style={styles.grid}>
            {MENU_ITEMS.map((item) => {
              const isHighlighted = item.key === 'punchIn';

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
