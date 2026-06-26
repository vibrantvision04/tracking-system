import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  FlatList,
  Pressable,
  Modal,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';
import { api } from '../../services/api';
import { Alert as AlertType } from '../../types';

function getSeverityColor(alert: AlertType): string {
  if (alert.severity === 'major') {
    return theme.colors.error;
  }
  if (alert.type === 'overspeed') {
    return theme.colors.warning;
  }
  return theme.colors.primary;
}

function getSeverityLabel(alert: AlertType, t: (key: string) => string): string {
  if (alert.severity === 'major') {
    return t('alerts.critical');
  }
  if (alert.type === 'overspeed') {
    return t('alerts.warning');
  }
  return t('alerts.info');
}

export default function ZoneManagerAlertsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/zone');
      return res as unknown as { alerts: AlertType[] };
    },
    refetchInterval: 30000,
  });

  const [selectedAlert, setSelectedAlert] = useState<AlertType | null>(null);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/acknowledge/${id}`);
      setSelectedAlert(null);
      refetch();
    } catch {
      // Silently handle - user can retry
    }
  };

  const renderAlertItem = ({ item }: { item: AlertType }) => {
    const severityColor = getSeverityColor(item);
    const severityLabel = getSeverityLabel(item, t);

    return (
      <Pressable
        style={[
          styles.alertCard,
          { borderLeftColor: severityColor },
          item.acknowledged && styles.acknowledgedCard,
        ]}
        onPress={() => setSelectedAlert(item)}
        accessibilityRole="button"
        accessibilityLabel={`${severityLabel}: ${item.message}. ${t('alerts.tapToView')}`}
      >
        <View style={styles.alertHeader}>
          <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
            <Text style={styles.severityBadgeText}>{severityLabel}</Text>
          </View>
          <Text style={styles.alertTime}>
            {new Date(item.created_at).toLocaleTimeString()}
          </Text>
        </View>
        <Text style={styles.alertMessage} numberOfLines={2}>
          {item.message}
        </Text>
        <Text style={styles.tapHint}>{t('alerts.tapToView')}</Text>
      </Pressable>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const alertList = data?.alerts || [];

  return (
    <View style={styles.container}>
      <Header
        title={t('alerts.zoneAlerts')}
        showBack={true}
        onBack={() => navigation.goBack()}
        rightActions={[
          {
            icon: 'refresh',
            onPress: () => refetch(),
            accessibilityLabel: 'Refresh alerts',
          },
        ]}
      />

      <FlatList
        data={alertList}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertItem}
        contentContainerStyle={styles.listContainer}
        style={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[theme.colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('alerts.noAlerts')}</Text>
          </View>
        }
      />

      {/* Alert Detail Modal */}
      <Modal
        visible={selectedAlert !== null}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedAlert(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedAlert && (
              <>
                <Text style={styles.modalTitle}>{t('alerts.details')}</Text>

                <View
                  style={[
                    styles.modalSeverityBar,
                    { backgroundColor: getSeverityColor(selectedAlert) },
                  ]}
                />

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>{t('alerts.status')}:</Text>
                  <View
                    style={[
                      styles.severityBadge,
                      { backgroundColor: getSeverityColor(selectedAlert) },
                    ]}
                  >
                    <Text style={styles.severityBadgeText}>
                      {getSeverityLabel(selectedAlert, t)}
                    </Text>
                  </View>
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabel}>{t('alerts.time')}:</Text>
                  <Text style={styles.modalValue}>
                    {new Date(selectedAlert.created_at).toLocaleString()}
                  </Text>
                </View>

                <View style={styles.modalMessageContainer}>
                  <Text style={styles.modalMessage}>{selectedAlert.message}</Text>
                </View>

                {!selectedAlert.acknowledged && (
                  <Pressable
                    style={styles.acknowledgeButton}
                    onPress={() => handleAcknowledge(selectedAlert.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('alerts.acknowledge')}
                  >
                    <Text style={styles.acknowledgeButtonText}>
                      {t('alerts.acknowledge')}
                    </Text>
                  </Pressable>
                )}

                <Pressable
                  style={styles.closeButton}
                  onPress={() => setSelectedAlert(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Text style={styles.closeButtonText}>{t('common.close')}</Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textDim,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
  list: {
    marginTop: theme.sizes.headerHeight,
  },
  listContainer: {
    padding: theme.spacing.base,
  },
  alertCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.md,
    borderLeftWidth: 5,
    minHeight: theme.sizes.touchTarget,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  acknowledgedCard: {
    opacity: 0.6,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  severityBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 4,
  },
  severityBadgeText: {
    color: theme.colors.surface,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  alertTime: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
  },
  alertMessage: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDark,
    lineHeight: theme.typography.body.lineHeight,
    marginBottom: theme.spacing.xs,
  },
  tapHint: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: theme.spacing.xxl,
    padding: theme.spacing.base,
  },
  emptyText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.base,
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.modal,
    padding: theme.spacing.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    color: theme.colors.textDark,
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  modalSeverityBar: {
    height: 4,
    borderRadius: 2,
    marginBottom: theme.spacing.base,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalLabel: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
    fontWeight: '600',
    marginRight: theme.spacing.sm,
  },
  modalValue: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
  },
  modalMessageContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.base,
  },
  modalMessage: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDark,
    lineHeight: theme.typography.body.lineHeight,
  },
  acknowledgeButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    height: theme.sizes.buttonHeight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  acknowledgeButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  closeButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.button,
    height: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: theme.colors.textDim,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
});
