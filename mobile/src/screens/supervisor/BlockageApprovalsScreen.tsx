import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, Image, Alert, RefreshControl, Modal } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, BASE_URL } from '../../services/api';
import { Blockage } from '../../types';

export default function BlockageApprovalsScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['pendingBlockages'],
    queryFn: async () => {
      const res = await api.get('/blockages');
      return res as unknown as { blockages: Blockage[] };
    },
  });

  const [reviewingItem, setReviewingItem] = useState<Blockage | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const handleReview = async (action: 'approve' | 'reject') => {
    if (!reviewingItem) return;

    setActionLoading(true);
    try {
      await api.patch(`/blockages/${reviewingItem.id}`, { action });
      Alert.alert('Success', `Blockage report ${action}d successfully.`);
      setReviewingItem(null);
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update blockage status');
    } finally {
      setActionLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading blockage reports...</Text>
      </View>
    );
  }

  const list = data?.blockages || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blockage Approvals</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#1565C0']} />
        }
      >
        <Text style={styles.sectionTitle}>Pending Blockages ({list.length})</Text>

        {list.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>All blockage reports reviewed!</Text>
          </View>
        ) : (
          list.map((item: any) => (
            <TouchableOpacity
              key={item.id}
              style={styles.card}
              onPress={() => setReviewingItem(item)}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.pointName}>{item.lane_point_name || `Point #${item.lane_point_id}`}</Text>
                <Text style={styles.statusBadge}>PENDING</Text>
              </View>

              <View style={styles.detailsBox}>
                <Text style={styles.detailText}>Driver: <Text style={styles.bold}>{item.driver_name}</Text></Text>
                <Text style={styles.detailText}>Vehicle: <Text style={styles.bold}>{item.vehicle_number}</Text></Text>
                <Text style={styles.detailText}>
                  Submitted: {new Date(item.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              {item.photo_url && (
                <Image
                  source={{ uri: `${BASE_URL}${item.photo_url}` }}
                  style={styles.thumbnail}
                />
              )}

              <Text style={styles.actionPrompt}>Tap to Review & Decision →</Text>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Review Modal */}
      <Modal
        visible={!!reviewingItem}
        transparent
        animationType="slide"
        onRequestClose={() => setReviewingItem(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Review Blockage Report</Text>
            
            {reviewingItem && (
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Text style={styles.modalSubtitle}>
                  Location: {reviewingItem.lane_point_name || `Point #${reviewingItem.lane_point_id}`}
                </Text>
                <Text style={styles.modalDetail}>Driver: {reviewingItem.driver_name}</Text>
                <Text style={styles.modalDetail}>Vehicle: {reviewingItem.vehicle_number}</Text>
                <Text style={styles.modalDetail}>
                  GPS: {reviewingItem.gps_lat.toFixed(6)}, {reviewingItem.gps_lng.toFixed(6)}
                </Text>

                {reviewingItem.photo_url && (
                  <Image
                    source={{ uri: `${BASE_URL}${reviewingItem.photo_url}` }}
                    style={styles.modalImage}
                  />
                )}

                {actionLoading ? (
                  <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
                ) : (
                  <View style={styles.modalButtons}>
                    <TouchableOpacity
                      style={[styles.modalButton, styles.rejectButton]}
                      onPress={() => handleReview('reject')}
                    >
                      <Text style={styles.modalButtonText}>Reject ✕</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.modalButton, styles.approveButton]}
                      onPress={() => handleReview('approve')}
                    >
                      <Text style={styles.modalButtonText}>Approve ✓</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setReviewingItem(null)}
                  disabled={actionLoading}
                >
                  <Text style={styles.closeButtonText}>Close / Back</Text>
                </TouchableOpacity>
              </ScrollView>
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
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    color: '#616161',
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    color: '#1565C0',
    fontWeight: 'bold',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  scrollContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#616161',
    marginBottom: 16,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  emptyIcon: {
    fontSize: 48,
    color: '#2E7D32',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#616161',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pointName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  statusBadge: {
    backgroundColor: '#FFF8E1',
    color: '#F57F17',
    fontSize: 11,
    fontWeight: 'bold',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  detailsBox: {
    marginBottom: 12,
  },
  detailText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4,
  },
  bold: {
    fontWeight: 'bold',
    color: '#212121',
  },
  thumbnail: {
    width: '100%',
    height: 150,
    borderRadius: 6,
    marginBottom: 12,
    resizeMode: 'cover',
  },
  actionPrompt: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1565C0',
    textAlign: 'right',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalScroll: {
    padding: 20,
  },
  modalSubtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 12,
  },
  modalDetail: {
    fontSize: 14,
    color: '#424242',
    marginBottom: 6,
  },
  modalImage: {
    width: '100%',
    height: 250,
    borderRadius: 8,
    marginVertical: 16,
    resizeMode: 'contain',
    backgroundColor: '#000',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginVertical: 12,
  },
  modalButton: {
    flex: 1,
    height: 56, // 56dp minimum touch target
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  approveButton: {
    backgroundColor: '#2E7D32',
  },
  rejectButton: {
    backgroundColor: '#C62828',
  },
  modalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  closeButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  closeButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
