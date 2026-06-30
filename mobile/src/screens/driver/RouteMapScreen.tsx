import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDriverRoute } from '../../hooks/useDriverRoute';
import MapView from '../../components/MapView';
import { ApiError, LanePoint } from '../../types';
import StatusBadge from '../../components/StatusBadge';

export default function RouteMapScreen({ navigation }: any) {
  // Real backend data (Req 9.1, 9.2): GET /routes/my -> DriverRouteResponse.
  // The hook uses retry:false so a 404 (no route assigned) surfaces immediately
  // as an ApiError with kind 'not_found' (Req 9.5).
  const { data: routeData, isLoading, isError, error, refetch } = useDriverRoute();

  const [selectedPoint, setSelectedPoint] = useState<LanePoint | null>(null);

  const lanePoints = routeData?.lane_points ?? [];
  const routeInfo = routeData?.route;

  const handleSelectPoint = (point: LanePoint) => {
    setSelectedPoint(point);
  };

  const handleReportBlockage = () => {
    if (selectedPoint) {
      const lp = selectedPoint;
      const currentIndex = lanePoints.findIndex((p) => p.id === lp.id);
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

  // Empty_State for "no route assigned" (Req 9.5). The backend returns HTTP 404
  // which the API layer maps to ApiError { kind: 'not_found' }.
  const apiError = error as ApiError | null;
  if (isError && apiError?.kind === 'not_found') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Route</Text>
          <View style={styles.refreshButton} />
        </View>
        <View style={styles.stateContainer}>
          <Ionicons name="map-outline" size={48} color="#1565C0" />
          <Text style={styles.stateTitle}>No Route Assigned</Text>
          <Text style={styles.stateText}>
            You don't have a route assigned yet. Once a route is assigned to you it will appear here.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Refresh</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Any other error (offline, server, timeout, etc.) — surface with a retry.
  if (isError) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Route</Text>
          <View style={styles.refreshButton} />
        </View>
        <View style={styles.stateContainer}>
          <Ionicons name="warning-outline" size={48} color="#F59E0B" />
          <Text style={styles.stateTitle}>Couldn't load your route</Text>
          <Text style={styles.stateText}>{apiError?.message || 'Please try again.'}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const completed = routeData?.completed_lane_points ?? 0;
  const remaining = routeData?.remaining_lane_points ?? 0;
  const coveragePercent = routeData?.coverage_percent ?? 0;
  const currentPosition = routeData?.current_position;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{routeInfo?.route_name || 'My Route'}</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
          <Ionicons name="refresh-outline" size={20} color="#1565C0" />
        </TouchableOpacity>
      </View>

      {/* Map display — real lane points with their backend-computed status */}
      <View style={styles.mapContainer}>
        <MapView
          lanePoints={lanePoints}
          onSelectPoint={handleSelectPoint}
          isSequential={routeInfo?.is_sequential || false}
          wardName={routeData?.ward?.name}
          currentPosition={currentPosition}
        />
      </View>

      {/* Coverage / progress summary (Req 9.3) */}
      <View style={styles.progressBox}>
        <View style={styles.progressRow}>
          <View style={styles.progressStat}>
            <Text style={styles.progressValue}>{completed}</Text>
            <Text style={styles.progressLabel}>Completed</Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressStat}>
            <Text style={styles.progressValue}>{remaining}</Text>
            <Text style={styles.progressLabel}>Remaining</Text>
          </View>
          <View style={styles.progressDivider} />
          <View style={styles.progressStat}>
            <Text style={styles.progressValue}>{Math.round(coveragePercent)}%</Text>
            <Text style={styles.progressLabel}>Coverage</Text>
          </View>
        </View>
        <View style={styles.progressBarTrack}>
          <View
            style={[
              styles.progressBarFill,
              { width: `${Math.max(0, Math.min(100, coveragePercent))}%` },
            ]}
          />
        </View>
      </View>

      {/* Route information from the backend */}
      <View style={styles.infoBox}>
        <Text style={styles.boxTitle}>Route Information</Text>
        <Text style={styles.boxText}>Ward: {routeData?.ward?.name || '—'}</Text>
        <Text style={styles.boxText}>
          Mode: {routeInfo?.is_sequential ? 'Sequential Order (P1 → P2)' : 'Non-Sequential (Free Selection)'}
        </Text>
        <Text style={styles.boxText}>Total Lane Points: {lanePoints.length}</Text>
        {currentPosition ? (
          <Text style={styles.boxText}>
            Vehicle Position: {currentPosition.lat.toFixed(5)}, {currentPosition.lng.toFixed(5)}
          </Text>
        ) : (
          <Text style={styles.boxText}>Vehicle Position: Not available</Text>
        )}
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
                  <Text style={styles.actionModalButtonText}>Report Blockage</Text>
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
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  stateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  stateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
    textAlign: 'center',
  },
  stateText: {
    fontSize: 14,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  retryButton: {
    backgroundColor: '#1565C0',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
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
    minWidth: 36,
  },
  refreshText: {
    fontSize: 18,
  },
  mapContainer: {
    padding: 16,
  },
  progressBox: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    borderRadius: 8,
    elevation: 2,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressStat: {
    flex: 1,
    alignItems: 'center',
  },
  progressValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1565C0',
  },
  progressLabel: {
    fontSize: 11,
    color: '#616161',
    marginTop: 2,
  },
  progressDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e0e0e0',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2E7D32',
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
