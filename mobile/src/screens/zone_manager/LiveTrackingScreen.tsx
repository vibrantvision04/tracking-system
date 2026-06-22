import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl, Modal } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { LiveVehicle } from '../../types';

export default function ZoneManagerLiveTrackingScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneTracking'],
    queryFn: async () => {
      const res = await api.get('/tracking/zone');
      return res as unknown as { vehicles: LiveVehicle[] };
    },
    refetchInterval: 15000, // Poll every 15 seconds
  });

  const [selectedVehicle, setSelectedVehicle] = useState<LiveVehicle | null>(null);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading zone vehicle tracking...</Text>
      </View>
    );
  }

  const vehicles = data?.vehicles || [];

  const getStatusStyle = (status: string, speed: number) => {
    if (speed > 0) {
      return { color: '#2E7D32', label: 'MOVING', bg: '#E8F5E9' };
    } else if (status === 'idle') {
      return { color: '#F57F17', label: 'IDLE', bg: '#FFF8E1' };
    } else {
      return { color: '#C62828', label: 'STOPPED', bg: '#FFEBEE' };
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zone Live Tracking</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#1565C0']} />
        }
      >
        {/* Simulated Map */}
        <View style={styles.mapCanvas}>
          <Text style={styles.mapCanvasText}>🗺️ Live Map Tracking (Zone-Wide)</Text>
          <View style={styles.simulatedVehicles}>
            {vehicles.map((v: any, i: number) => {
              const statusStyle = getStatusStyle(v.status, v.speed);
              return (
                <TouchableOpacity
                  key={v.vehicle_id}
                  style={[
                    styles.vehicleDot,
                    {
                      backgroundColor: statusStyle.color,
                      left: 20 + i * 45,
                      top: 40 + (i % 3) * 35,
                    },
                  ]}
                  onPress={() => setSelectedVehicle(v)}
                >
                  <Text style={styles.vehicleDotText}>{v.vehicle_number.slice(-4)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.mapCanvasSubtitle}>Tap vehicle dots to inspect details</Text>
        </View>

        <Text style={styles.sectionTitle}>Zone Vehicles ({vehicles.length})</Text>

        {vehicles.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No vehicles active in the zone.</Text>
          </View>
        ) : (
          vehicles.map((item: any) => {
            const statusStyle = getStatusStyle(item.status, item.speed);
            return (
              <TouchableOpacity
                key={item.vehicle_id}
                style={styles.vehicleCard}
                onPress={() => setSelectedVehicle(item)}
              >
                <View style={styles.cardHeader}>
                  <View>
                    <Text style={styles.vehicleNo}>{item.vehicle_number}</Text>
                    <Text style={styles.driverName}>Driver: {item.driver_name}</Text>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.statusLabel, { color: statusStyle.color }]}>
                      {statusStyle.label}
                    </Text>
                  </View>
                </View>

                <View style={styles.metricsRow}>
                  <Text style={styles.metricText}>Speed: {item.speed.toFixed(1)} KM/H</Text>
                  <Text style={styles.metricText}>
                    Updated: {new Date(item.last_update).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* Vehicle details modal */}
      <Modal
        visible={!!selectedVehicle}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedVehicle(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Zone Vehicle Tracking Info</Text>

            {selectedVehicle && (
              <View style={styles.modalBody}>
                <Text style={styles.modalField}>
                  Vehicle Number: <Text style={styles.bold}>{selectedVehicle.vehicle_number}</Text>
                </Text>
                <Text style={styles.modalField}>
                  Active Driver: <Text style={styles.bold}>{selectedVehicle.driver_name}</Text>
                </Text>
                <Text style={styles.modalField}>
                  Current Speed: <Text style={styles.bold}>{selectedVehicle.speed.toFixed(1)} KM/H</Text>
                </Text>
                <Text style={styles.modalField}>
                  Status: <Text style={styles.bold}>{selectedVehicle.speed > 0 ? 'Moving' : 'Stopped'}</Text>
                </Text>
                <Text style={styles.modalField}>
                  Coordinates: <Text style={styles.bold}>{selectedVehicle.lat.toFixed(6)}, {selectedVehicle.lng.toFixed(6)}</Text>
                </Text>
                <Text style={styles.modalField}>
                  Last Update: <Text style={styles.bold}>{new Date(selectedVehicle.last_update).toLocaleString()}</Text>
                </Text>

                <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedVehicle(null)}>
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </View>
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
  mapCanvas: {
    height: 180,
    backgroundColor: '#eceff1',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b0bec5',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    marginBottom: 20,
  },
  mapCanvasText: {
    position: 'absolute',
    top: 8,
    left: 8,
    fontSize: 12,
    fontWeight: 'bold',
    color: '#37474f',
  },
  mapCanvasSubtitle: {
    position: 'absolute',
    bottom: 8,
    fontSize: 10,
    color: '#546e7a',
  },
  simulatedVehicles: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  vehicleDot: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  vehicleDotText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#616161',
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#757575',
    fontSize: 14,
  },
  vehicleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  vehicleNo: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  driverName: {
    fontSize: 13,
    color: '#616161',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: 'bold',
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 8,
  },
  metricText: {
    fontSize: 12,
    color: '#757575',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalBody: {
    gap: 10,
  },
  modalField: {
    fontSize: 14,
    color: '#616161',
  },
  bold: {
    fontWeight: 'bold',
    color: '#212121',
  },
  closeButton: {
    height: 50,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  closeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
