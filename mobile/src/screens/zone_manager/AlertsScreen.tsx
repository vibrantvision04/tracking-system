import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Pressable,
  Modal,
  RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { useTranslation } from '../../i18n/useTranslation';
import { api } from '../../services/api';
import SearchableSelect, { SelectOption } from '../../components/SearchableSelect';
import { Alert as AlertType } from '../../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function getSeverityColor(alert: AlertType): string {
  if (alert.severity === 'major') return theme.colors.error;
  if (alert.type === 'overspeed') return theme.colors.warning;
  return theme.colors.primary;
}

function getSeverityLabel(alert: AlertType, t: (key: string) => string): string {
  if (alert.severity === 'major') return t('alerts.critical');
  if (alert.type === 'overspeed') return t('alerts.warning');
  return t('alerts.info');
}

type RecipientRole = 'all' | 'supervisor' | 'driver' | 'road_sweeper';

const ROLE_TABS: { key: RecipientRole; label: string; emoji: string }[] = [
  { key: 'all',          label: 'All',          emoji: '👥' },
  { key: 'supervisor',   label: 'Supervisors',  emoji: '👔' },
  { key: 'driver',       label: 'Drivers',      emoji: '🚛' },
  { key: 'road_sweeper', label: 'Sweepers',     emoji: '🧹' },
];

// ── component ─────────────────────────────────────────────────────────────────

export default function ZoneManagerAlertsScreen({ navigation }: any) {
  const { t } = useTranslation();

  // ── alert feed ──────────────────────────────────────────────────────────────
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/zone');
      return res as unknown as { alerts: AlertType[] };
    },
    refetchInterval: 30000,
  });

  const [selectedAlert, setSelectedAlert] = useState<AlertType | null>(null);

  // ── compose state ────────────────────────────────────────────────────────────
  type Recipient = { id: number; name: string; employeeId: string; vehicle: string; role: string };
  const [allRecipients, setAllRecipients] = useState<Recipient[]>([]);
  const [recipientRole, setRecipientRole] = useState<RecipientRole>('all');
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [customMessage, setCustomMessage] = useState('');
  const [severity, setSeverity] = useState<'minor' | 'major'>('minor');
  const [sendingAlert, setSendingAlert] = useState(false);

  // ── load recipients once on mount ────────────────────────────────────────────
  useEffect(() => {
    async function fetchRecipients() {
      try {
        const res = (await api.get('/alert-recipients')) as unknown as {
          recipients: { id: number; name: string; employee_id: string; vehicle_number: string; role: string }[];
        };
        const recipients: Recipient[] = (res?.recipients || []).map((rc) => ({
          id: rc.id,
          name: rc.name,
          employeeId: rc.employee_id,
          vehicle: rc.vehicle_number,
          role: rc.role || 'driver',
        }));
        setAllRecipients(recipients);
      } catch (err) {
        console.warn('Failed to load alert recipients:', err);
      }
    }
    fetchRecipients();
  }, []);

  // ── derive filtered options from selected role tab ────────────────────────────
  const recipientOptions: SelectOption[] = useMemo(() => {
    const filtered =
      recipientRole === 'all'
        ? allRecipients
        : allRecipients.filter((r) => r.role === recipientRole);

    return filtered.map((r) => ({
      value: String(r.id),
      label: r.name,
      sublabel: r.vehicle ? `${r.employeeId} • ${r.vehicle}` : r.employeeId,
    }));
  }, [allRecipients, recipientRole]);

  // Reset selected recipient when role filter changes
  useEffect(() => {
    setSelectedRecipientId(null);
  }, [recipientRole]);

  // ── send alert ────────────────────────────────────────────────────────────────
  const handleSendAlert = async () => {
    if (!selectedRecipientId) {
      Alert.alert(t('common.error'), t('alerts.driverRequired'));
      return;
    }
    if (!customMessage.trim()) {
      Alert.alert(t('common.error'), t('alerts.messageRequired'));
      return;
    }

    const recipient = allRecipients.find((r) => String(r.id) === selectedRecipientId);
    const resolvedRole = recipient?.role || (recipientRole !== 'all' ? recipientRole : 'driver');

    setSendingAlert(true);
    try {
      await api.post('/alerts/manual', {
        recipient_role: resolvedRole,
        recipient_ids: [Number(selectedRecipientId)],
        message: customMessage.trim(),
        severity,
      });

      Alert.alert(t('alerts.sendSuccess'));
      setCustomMessage('');
      setSelectedRecipientId(null);
      setSeverity('minor');
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('alerts.sendError'));
    } finally {
      setSendingAlert(false);
    }
  };

  // ── acknowledge ───────────────────────────────────────────────────────────────
  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/${id}/read`);
      Alert.alert(t('alerts.acknowledged'));
      setSelectedAlert(null);
      refetch();
    } catch (err: any) {
      Alert.alert(t('common.error'), err?.message || t('alerts.acknowledgeError'));
    }
  };

  // ── loading skeleton ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const alertList = data?.alerts || [];

  // ── render ────────────────────────────────────────────────────────────────────
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
        {/* ── Send Alert Panel ────────────────────────────────────────────── */}
        <View style={styles.composeCard}>
          <Text style={styles.cardTitle}>📢 {t('alerts.sendCustomAlert')}</Text>

          {/* Role tabs */}
          <Text style={styles.label}>Send to role</Text>
          <View style={styles.roleTabs}>
            {ROLE_TABS.map((tab) => (
              <Pressable
                key={tab.key}
                style={[
                  styles.roleTab,
                  recipientRole === tab.key && styles.roleTabActive,
                ]}
                onPress={() => setRecipientRole(tab.key)}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${tab.label}`}
              >
                <Text
                  style={[
                    styles.roleTabText,
                    recipientRole === tab.key && styles.roleTabTextActive,
                  ]}
                >
                  {tab.emoji} {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Recipient picker */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Select recipient</Text>
            <SearchableSelect
              options={recipientOptions}
              value={selectedRecipientId}
              onSelect={setSelectedRecipientId}
              placeholder={
                recipientRole === 'all'
                  ? 'Select supervisor, driver or sweeper…'
                  : recipientRole === 'supervisor'
                  ? 'Select supervisor…'
                  : recipientRole === 'driver'
                  ? 'Select driver…'
                  : 'Select road sweeper…'
              }
              searchPlaceholder="Search by name or vehicle no."
              accessibilityLabel="Select recipient"
            />
            {recipientOptions.length === 0 && allRecipients.length > 0 && (
              <Text style={styles.noRecipientsNote}>
                No {recipientRole === 'road_sweeper' ? 'sweepers' : 'drivers'} found in your zone.
              </Text>
            )}
          </View>

          {/* Severity selector */}
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Severity</Text>
            <View style={styles.severityRow}>
              <Pressable
                style={[styles.severityBtn, severity === 'minor' && styles.severityBtnMinorActive]}
                onPress={() => setSeverity('minor')}
                accessibilityRole="button"
                accessibilityLabel="Minor severity"
              >
                <Text style={[styles.severityBtnText, severity === 'minor' && styles.severityBtnTextActive]}>
                  ℹ️ Minor
                </Text>
              </Pressable>
              <Pressable
                style={[styles.severityBtn, severity === 'major' && styles.severityBtnMajorActive]}
                onPress={() => setSeverity('major')}
                accessibilityRole="button"
                accessibilityLabel="Major severity"
              >
                <Text style={[styles.severityBtnText, severity === 'major' && styles.severityBtnTextActive]}>
                  🚨 Major
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Message input */}
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

          {/* Send button */}
          <Pressable
            style={[styles.sendButton, sendingAlert && styles.disabledButton]}
            onPress={handleSendAlert}
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

        {/* ── Alert Feed ──────────────────────────────────────────────────── */}
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

      {/* ── Alert Detail Modal ───────────────────────────────────────────── */}
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

// ── styles ────────────────────────────────────────────────────────────────────

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
    paddingBottom: theme.spacing.xxl,
  },

  // ── Compose card ────────────────────────────────────────────────────────────
  composeCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    marginBottom: theme.spacing.base,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.base,
  },

  // Role tabs
  roleTabs: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.base,
  },
  roleTab: {
    flex: 1,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: theme.borderRadius.button,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  roleTabActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  roleTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  roleTabTextActive: {
    color: theme.colors.surface,
  },

  // Severity row
  severityRow: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  severityBtn: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.button,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  severityBtnMinorActive: {
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  severityBtnMajorActive: {
    backgroundColor: theme.colors.errorLight,
    borderColor: theme.colors.error,
  },
  severityBtnText: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
  },
  severityBtnTextActive: {
    color: theme.colors.textDark,
  },

  // Inputs
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
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
  noRecipientsNote: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.warning,
    marginTop: theme.spacing.xs,
  },

  // Send button
  sendButton: {
    height: theme.sizes.buttonHeight,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  sendButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  disabledButton: {
    backgroundColor: theme.colors.textDim,
  },

  // ── Alert feed ──────────────────────────────────────────────────────────────
  sectionTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
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

  // ── Modal ──────────────────────────────────────────────────────────────────
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
