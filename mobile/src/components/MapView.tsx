import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { LanePoint } from '../types';

interface MapViewProps {
  lanePoints: LanePoint[];
  onSelectPoint: (point: LanePoint) => void;
  isSequential: boolean;
}

export default function MapView({ lanePoints, onSelectPoint, isSequential }: MapViewProps) {
  // Sort points by sequence
  const sortedPoints = [...lanePoints].sort((a, b) => a.sequence_number - b.sequence_number);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'achieved':
        return '#2E7D32'; // Green
      case 'pending':
        return '#F57F17'; // Yellow
      case 'missed':
        return '#C62828'; // Red
      default:
        return '#B0BEC5'; // White/Gray
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.mapCanvas}>
        <View style={styles.wardBoundary}>
          <Text style={styles.wardLabel}>Mock Ward Boundary (Active)</Text>
          
          {/* Simulated Route Line */}
          <View style={styles.simulatedRouteLine} />

          {/* Render Lane Points on Map */}
          <ScrollView horizontal contentContainerStyle={styles.pointsList} showsHorizontalScrollIndicator={false}>
            {sortedPoints.map((p, idx) => {
              const prevAchieved = idx === 0 || sortedPoints[idx - 1].status === 'achieved';
              const canReport = !isSequential || prevAchieved;
              
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.marker,
                    { borderColor: getStatusColor(p.status) }
                  ]}
                  onPress={() => onSelectPoint(p)}
                >
                  <View style={[styles.markerInner, { backgroundColor: getStatusColor(p.status) }]}>
                    <Text style={styles.markerText}>{p.sequence_number}</Text>
                  </View>
                  <Text style={styles.markerLabel}>{p.status.toUpperCase()}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Map Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#2E7D32' }]} />
          <Text style={styles.legendText}>Achieved</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#F57F17' }]} />
          <Text style={styles.legendText}>Blocked (Pending)</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#C62828' }]} />
          <Text style={styles.legendText}>Missed</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: '#B0BEC5' }]} />
          <Text style={styles.legendText}>Upcoming</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 300,
    backgroundColor: '#eceff1',
    borderRadius: 8,
    overflow: 'hidden',
    padding: 12,
    justifyContent: 'space-between',
  },
  mapCanvas: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wardBoundary: {
    width: '100%',
    height: 200,
    backgroundColor: 'rgba(21, 101, 192, 0.08)',
    borderColor: '#1565C0',
    borderWidth: 2,
    borderRadius: 8,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  wardLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    color: '#1565C0',
    fontSize: 10,
    fontWeight: 'bold',
  },
  simulatedRouteLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 4,
    backgroundColor: '#1565C0',
    opacity: 0.5,
  },
  pointsList: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  marker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 16,
    elevation: 2,
  },
  markerInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  markerLabel: {
    position: 'absolute',
    bottom: -18,
    fontSize: 8,
    fontWeight: 'bold',
    color: '#455A64',
  },
  legend: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#ffffff',
    borderRadius: 4,
    padding: 6,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 4,
  },
  legendText: {
    fontSize: 10,
    color: '#212121',
    fontWeight: '600',
  },
});
