import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  FlatList,
  Pressable,
  Modal,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';
import { api, BASE_URL } from '../../services/api';
import { Alert as AlertType } from '../../types';
import axios from 'axios';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
}

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

export default function SupervisorAlertsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wardAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/ward');
      return res as unknown as { alerts: AlertType[] };
    },
    refetchInterval: 30000,
  });

  const [selectedAlert, setSelectedAlert] = useState<AlertType | null>(null);
  const [drivers, setDrivers] = useState<Employee[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Employee | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);

  useEffect(() => {
    async function fetchDrivers() {
      try {
        const res = await axios.get(`${BASE_URL}/api/employees`);
        if (res.data && res.data.data) {
          setDrivers(res.data.data);
        }
      } catch (err) {
        console.warn('Failed to load drivers for custom alert:', err);
      }
    }
    fetchDrivers();
  }, []);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/acknowledge/${id}`);
      Alert.alert(t('alerts.acknowledged'));
      setSelectedAlert(null);
      refetch();
    } catch (err: any) {
      Alert.alert(t('common.error'), t('alerts.acknowledgeError'));
    }
  };

  const handleSendCustomAlert = async () => {
    if (!selectedDriver) {
      Alert.alert(t('common.error'), t('alerts.driverRequired'));
      return;
    }
    if (!customMessage.trim()) {
      Alert.alert(t('common.error'), t('alerts.messageRequired'));
      return;
    }

    setSendingAlert(true);
    try {
      await api.post('/alerts/custom', {
        driver_id: selectedDriver.id.toString(),
        message: customMessage.trim(),
        ward_id: '1',
      });

      Alert.alert(t('alerts.sendSuccess'));
      setCustomMessage('');
      setSelectedDriver(null);
      setDriverSearch('');
    } catch (err: any) {
      Alert.alert(t('common.error'), t('alerts.sendError'));
    } finally {
      setSendingAlert(false);
    }
  };

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name} ${d.employee_id}`
      .toLowerCase()
      .includes(driverSearch.toLowerCase())
  );

  const handleSelectDriver = (driver: Employee) => {
    setSelectedDriver(driver);
    setDriverSearch(`${driver.first_name} ${driver.last_name}`);
    setShowDriverDropdown(false);
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
        title={t('alerts.wardAlerts')}
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

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Send Custom Alert Panel */}
        <View style={styles.customAlertCard}>
          <Text style={styles.cardTitle}>{t('alerts.sendCustomAlert')}</Text>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('alerts.selectDriver')}</Text>
            <TextInput
              style={styles.input}
              placeholder={t('alerts.driverPlaceholder')}
              placeholderTextColor={theme.colors.textDim}
              value={driverSearch}
              onChangeText={(text) => {
                setDriverSearch(text);
                setShowDriverDropdown(true);
                if (selectedDriver) setSelectedDriver(null);
              }}
              onFocus={() => setShowDriverDropdown(true)}
              accessibilityLabel={t('alerts.selectDriver')}
            />
            {showDriverDropdown && driverSearch.length > 0 && (
              <View style={styles.dropdown}>
                <FlatList
                  data={filteredDrivers.slice(0, 5)}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.dropdownItem}
                      onPress={() => handleSelectDriver(item)}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.first_name} ${item.last_name}`}
                    >
                      <Text style={styles.dropdownText}>
                        {item.first_name} {item.last_name} ({item.employee_id})
                      </Text>
                    </Pressable>
                  )}
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>{t('alerts.messageLabel')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder={t('alerts.messagePlaceholder')}
              placeholderTextColor={theme.colors.textDim}
              value={customMessage}
              onChangeText={setCustomMessage}
              maxLength={200}
              multiline
              accessibilityLabel={t('alerts.messageLabel')}
            />
            <Text style={styles.charCount}>{customMessage.length}/200</Text>
          </View>

          <Pressable
            style={[styles.sendButton, sendingAlert && styles.disabledButton]}
            onPress={handleSendCustomAlert}
            disabled={sendingAlert}
            accessibilityRole="button"
            accessibilityLabel={t('alerts.sendMessage')}
          >
            {sendingAlert ? (
              <ActivityIndicator color={theme.colors.surface} />
            ) : (
              <Text style={styles.sendButtonText}>{t('alerts.sendMessage')}</Text>
            )}
          </Pressable>
        </View>

        {/* Alerts List */}
        <Text style={styles.sectionTitle}>
          {t('alerts.activeAlerts')} ({alertList.length})
        </Text>

        {alertList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t('alerts.noAlerts')}</Text>
          </View>
        ) : (
          alertList.map((alert) => {
            const severityColor = getSeverityColor(alert);
            const severityLabel = getSeverityLabel(alert, t);

            return (
              <Pressable
                key={alert.id}
                style={[
                  styles.alertCard,
                  { borderLeftColor: severityColor },
                  alert.acknowledged && styles.acknowledgedCard,
                ]}
                onPress={() => setSelectedAlert(alert)}
                accessibilityRole="button"
                accessibilityLabel={`${severityLabel}: ${alert.message}. ${t('alerts.tapToView')}`}
              >
                <View style={styles.alertHeader}>
                  <View style={[styles.severityBadge, { backgroundColor: severityColor }]}>
                    <Text style={styles.severityBadgeText}>{severityLabel}</Text>
                  </View>
                  <Text style={styles.alertTime}>
                    {new Date(alert.created_at).toLocaleTimeString()}
                  </Text>
                </View>
                <Text style={styles.alertMessage} numberOfLines={2}>
                  {alert.message}
                </Text>
                <Text style={styles.tapHint}>{t('alerts.tapToView')}</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

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
  scrollView: {
    marginTop: theme.sizes.headerHeight,
  },
  scrollContainer: {
    padding: theme.spacing.base,
  },
  // Custom Alert Panel
  customAlertCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.base,
  },
  inputContainer: {
    marginBottom: theme.spacing.base,
    position: 'relative' as const,
    zIndex: 1,
  },
  label: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
    marginBottom: theme.spacing.xs,
  },
  input: {
    height: theme.sizes.inputHeight,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.input,
    paddingHorizontal: theme.spacing.base,
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    backgroundColor: theme.colors.background,
    width: '100%',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: theme.spacing.md,
  },
  charCount: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    textAlign: 'right',
    marginTop: theme.spacing.xs,
  },
  dropdown: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.card,
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    zIndex: 999,
    maxHeight: 150,
    elevation: 4,
  },
  dropdownItem: {
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.background,
    minHeight: theme.sizes.touchTarget,
    justifyContent: 'center',
  },
  dropdownText: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
  },
  sendButton: {
    height: theme.sizes.buttonHeight,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: theme.colors.textDim,
  },
  // Alerts List
  sectionTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
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
