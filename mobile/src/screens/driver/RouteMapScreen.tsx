import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import MapView from '../../components/MapView';
import { LanePoint, MyRouteResponse } from '../../types';
import StatusBadge from '../../components/StatusBadge';

export default function RouteMapScreen({ navigation }: any) {
  const { data: routeData, isLoading, refetch } = useQuery({
    queryKey: ['myRoute'],
    queryFn: async () => {
      const res = await api.get('/routes/my');
      return res as unknown as MyRouteResponse;
    },
  });

  const [selectedPoint, setSelectedPoint] = useState<LanePoint | null>(null);

  const handleSelectPoint = (point: LanePoint) => {
    setSelectedPoint(point);
  };

  const handleReportBlockage = () => {
    if (selectedPoint) {
      const lp = selectedPoint;
      const currentIndex = lanePoints.findIndex((p: any) => p.id === lp.id);
      const prevPoint = currentIndex > 0 ? lanePoints[currentIndex - 1] : null;

      setSelectedPoint(null);
      navigation.navigate('DriverBlockage', {
        pointId: lp.id,
        pointName: `Point #${lp.sequence_number}`,
        latitude: lp.latitude,
        longitude: lp.longitude,
        prevLatitude: prevPoint ? prevPoint.latitude : null,
        prevLongitude: prevPoint ? prevPoint.longitude : null,
      });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading assigned route map...</Text>
      </View>
    );
  }

  const lanePoints = routeData?.lane_points || [];
  const routeInfo = routeData?.route;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{routeInfo?.route_name || 'My Route'}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Map display */}
      <View style={styles.mapContainer}>
        <MapView 
          lanePoints={lanePoints} 
          onSelectPoint={handleSelectPoint} 
          isSequential={routeInfo?.is_sequential || false}
        />
      </View>

      {/* Details list of points */}
      <View style={styles.infoBox}>
        <Text style={styles.boxTitle}>Route Information</Text>
        <Text style={styles.boxText}>Wards: {routeData?.ward?.name || 'Assigned Ward'}</Text>
        <Text style={styles.boxText}>
          Mode: {routeInfo?.is_sequential ? 'Sequential Order (P1 → P2)' : 'Non-Sequential (Free Selection)'}
        </Text>
      </View>

      {/* Modal for lane point selection options */}
      <Modal
        visible={!!selectedPoint}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPoint(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Lane Point Details</Text>
            <Text style={styles.modalSubtitle}>Point Name: Point #{selectedPoint?.sequence_number}</Text>
            
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Current Status: </Text>
              {selectedPoint && <StatusBadge status={selectedPoint.status} />}
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelModalButton} onPress={() => setSelectedPoint(null)}>
                <Text style={styles.cancelModalButtonText}>Close</Text>
              </TouchableOpacity>
              
              {(selectedPoint?.status === 'upcoming' || selectedPoint?.status === 'pending') && (
                <TouchableOpacity style={styles.actionModalButton} onPress={handleReportBlockage}>
                  <Text style={styles.actionModalButtonText}>Report Blockage ⚠️</Text>
                </TouchableOpacity>
              )}
            </View>
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
  refreshButton: {
    padding: 8,
  },
  refreshText: {
    fontSize: 18,
  },
  mapContainer: {
    padding: 16,
  },
  infoBox: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 8,
    elevation: 2,
  },
  boxTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  boxText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  statusLabel: {
    fontSize: 14,
    color: '#616161',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  cancelModalButton: {
    flex: 1,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelModalButtonText: {
    color: '#212121',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionModalButton: {
    flex: 1.5,
    height: 56,
    borderRadius: 8,
    backgroundColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionModalButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
