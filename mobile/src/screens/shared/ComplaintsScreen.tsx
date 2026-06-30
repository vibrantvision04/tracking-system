import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  Pressable,
  Modal,
  Image,
  RefreshControl,
} from 'react-native';
import { theme } from '../../theme/theme';
import { Header } from '../../components/ui/Header';
import { Card } from '../../components/ui/Card';
import { useTranslation } from '../../i18n/useTranslation';
import { useComplaints, useComplaint } from '../../hooks/useComplaints';
import { BASE_URL } from '../../services/api';
import type {
  Complaint,
  ComplaintPriority,
  ComplaintStatus,
} from '../../types';

/**
 * Read-only Complaints screen (Req 7.1, 7.2, 7.3, 7.6).
 *
 * A single shared screen reused by every role; the backend scopes the feed by
 * JWT role, so no client-side role logic is required here. The screen renders
 * the full complaint shape and exposes NO create/edit/delete controls anywhere
 * (Req 7.3). Layout reuses the existing Header/Card primitives to stay
 * consistent with other screens (Req 13).
 */

/** Resolve a possibly-relative image path against the API origin. */
function resolveImageUri(path: string): string {
  if (!path) return path;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

function priorityColor(priority: ComplaintPriority): string {
  switch (priority) {
    case 'critical':
      return theme.colors.error;
    case 'high':
      return theme.colors.warning;
    case 'medium':
      return theme.colors.primary;
    case 'low':
    default:
      return theme.colors.textDim;
  }
}

function statusColor(status: ComplaintStatus): string {
  switch (status) {
    case 'resolved':
    case 'closed':
      return theme.colors.success;
    case 'in_progress':
      return theme.colors.warning;
    case 'open':
    default:
      return theme.colors.textDim;
  }
}

function titleCase(value: string): string {
  return value
    .split('_')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatLocation(location?: Complaint['location']): string | null {
  if (!location) return null;
  if (location.address) return location.address;
  if (typeof location.lat === 'number' && typeof location.lng === 'number') {
    return `${location.lat.toFixed(5)}, ${location.lng.toFixed(5)}`;
  }
  return null;
}

interface BadgeProps {
  label: string;
  color: string;
}

function Badge({ label, color }: BadgeProps) {
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{label}</Text>
    </View>
  );
}

interface DetailRowProps {
  label: string;
  value?: string | null;
}

function DetailRow({ label, value }: DetailRowProps) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value && value.length > 0 ? value : '—'}</Text>
    </View>
  );
}

export default function ComplaintsScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } = useComplaints();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Detail uses the same backend data (useComplaint). While the detail request
  // is in flight we fall back to the list item so the modal renders instantly.
  const detailQuery = useComplaint(selectedId ?? undefined);
  const listItem = data?.find((c) => c.id === selectedId) ?? null;
  const selected: Complaint | null = detailQuery.data ?? listItem;

  const complaints = data ?? [];

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Header
          title={t('menu.complaints')}
          showBack
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        <Header
          title={t('menu.complaints')}
          showBack
          onBack={() => navigation.goBack()}
        />
        <View style={styles.centerFill}>
          <Text style={styles.errorText}>{t('common.error')}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => refetch()}
            accessibilityRole="button"
            accessibilityLabel={t('common.retry')}
          >
            <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={t('menu.complaints')}
        showBack
        onBack={() => navigation.goBack()}
        rightActions={[
          {
            icon: 'refresh',
            onPress: () => refetch(),
            accessibilityLabel: t('common.retry'),
          },
        ]}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            colors={[theme.colors.primary]}
          />
        }
      >
        {complaints.length === 0 ? (
          <View style={styles.centerFill}>
            <Text style={styles.emptyText}>{t('common.noData')}</Text>
          </View>
        ) : (
          complaints.map((complaint) => {
            const location = formatLocation(complaint.location);
            return (
              <Card
                key={complaint.id}
                onPress={() => setSelectedId(complaint.id)}
                style={styles.complaintCard}
              >
                <View style={styles.cardHeader}>
                  <Text style={styles.complaintId}>#{complaint.id}</Text>
                  <View style={styles.badgeRow}>
                    <Badge
                      label={titleCase(complaint.priority)}
                      color={priorityColor(complaint.priority)}
                    />
                    <Badge
                      label={titleCase(complaint.status)}
                      color={statusColor(complaint.status)}
                    />
                  </View>
                </View>

                <Text style={styles.complaintTitle} numberOfLines={1}>
                  {complaint.title}
                </Text>
                <Text style={styles.complaintDescription} numberOfLines={2}>
                  {complaint.description}
                </Text>

                <View style={styles.metaRow}>
                  <Text style={styles.metaText} numberOfLines={1}>
                    🚚 {complaint.assigned_vehicle || '—'}
                  </Text>
                  <Text style={styles.metaText} numberOfLines={1}>
                    👤 {complaint.assigned_driver || '—'}
                  </Text>
                </View>
                {location && (
                  <Text style={styles.metaText} numberOfLines={1}>
                    📍 {location}
                  </Text>
                )}
                <View style={styles.cardFooter}>
                  <Text style={styles.dateText}>
                    {formatDate(complaint.created_at)}
                  </Text>
                  {complaint.images?.length > 0 && (
                    <Text style={styles.imageCount}>
                      🖼️ {complaint.images.length}
                    </Text>
                  )}
                </View>
              </Card>
            );
          })
        )}
      </ScrollView>

      {/* Read-only detail modal — same backend data, no mutation controls */}
      <Modal
        visible={selectedId !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedId(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {detailQuery.isLoading && !selected ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
              </View>
            ) : selected ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.modalHeaderRow}>
                  <Text style={styles.modalTitle}>#{selected.id}</Text>
                  <View style={styles.badgeRow}>
                    <Badge
                      label={titleCase(selected.priority)}
                      color={priorityColor(selected.priority)}
                    />
                    <Badge
                      label={titleCase(selected.status)}
                      color={statusColor(selected.status)}
                    />
                  </View>
                </View>

                <Text style={styles.modalComplaintTitle}>{selected.title}</Text>
                <Text style={styles.modalDescription}>{selected.description}</Text>

                <DetailRow
                  label={t('complaints.assignedVehicle')}
                  value={selected.assigned_vehicle}
                />
                <DetailRow
                  label={t('complaints.assignedDriver')}
                  value={selected.assigned_driver}
                />
                <DetailRow
                  label={t('complaints.location')}
                  value={formatLocation(selected.location)}
                />
                <DetailRow
                  label={t('complaints.createdAt')}
                  value={formatDate(selected.created_at)}
                />
                <DetailRow
                  label={t('complaints.updatedAt')}
                  value={formatDate(selected.updated_at)}
                />

                {selected.images?.length > 0 && (
                  <View style={styles.imagesSection}>
                    <Text style={styles.detailLabel}>
                      {t('complaints.images')}
                    </Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {selected.images.map((uri, index) => (
                        <Image
                          key={`${selected.id}-img-${index}`}
                          source={{ uri: resolveImageUri(uri) }}
                          style={styles.image}
                          resizeMode="cover"
                          accessibilityLabel={`Complaint image ${index + 1}`}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Pressable
                  style={styles.closeButton}
                  onPress={() => setSelectedId(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.close')}
                >
                  <Text style={styles.closeButtonText}>{t('common.close')}</Text>
                </Pressable>
              </ScrollView>
            ) : null}
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
  centerFill: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.base,
    marginTop: theme.sizes.headerHeight,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textDim,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    marginBottom: theme.spacing.base,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  retryButton: {
    height: theme.sizes.buttonHeight,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
  },
  retryButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
    marginTop: theme.sizes.headerHeight,
  },
  scrollContent: {
    padding: theme.spacing.base,
    paddingBottom: theme.spacing.xl,
  },
  complaintCard: {
    marginBottom: theme.spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  complaintId: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '700',
    color: theme.colors.textDim,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: 4,
    marginLeft: theme.spacing.xs,
  },
  badgeText: {
    color: theme.colors.surface,
    fontSize: theme.typography.caption.fontSize,
    fontWeight: '600',
  },
  complaintTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.xs,
  },
  complaintDescription: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
    lineHeight: theme.typography.secondary.lineHeight,
    marginBottom: theme.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    flexShrink: 1,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  dateText: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
  },
  imageCount: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
  },
  // Modal
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
    maxWidth: 420,
    maxHeight: '85%',
  },
  modalLoading: {
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  modalTitle: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    color: theme.colors.textDark,
  },
  modalComplaintTitle: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.sm,
  },
  modalDescription: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    lineHeight: theme.typography.body.lineHeight,
    marginBottom: theme.spacing.base,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  detailLabel: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDim,
    fontWeight: '600',
    marginRight: theme.spacing.md,
  },
  detailValue: {
    fontSize: theme.typography.secondary.fontSize,
    color: theme.colors.textDark,
    flexShrink: 1,
    textAlign: 'right',
  },
  imagesSection: {
    marginTop: theme.spacing.base,
  },
  image: {
    width: 120,
    height: 120,
    borderRadius: theme.borderRadius.card,
    marginRight: theme.spacing.sm,
    marginTop: theme.spacing.sm,
    backgroundColor: theme.colors.background,
  },
  closeButton: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.button,
    height: theme.sizes.touchTarget,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
  },
  closeButtonText: {
    color: theme.colors.textDim,
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
  },
});
