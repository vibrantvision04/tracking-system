import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

export default function CoverageScreen({ navigation }: any) {
  const { data: cov, isLoading, refetch } = useQuery({
    queryKey: ['myCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/my');
      return res as any;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading coverage statistics...</Text>
      </View>
    );
  }

  const pct = cov?.coverage_percent || 0;

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Coverage</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        {/* Progress Ring Simulation */}
        <View style={styles.progressRingOuter}>
          <View style={styles.progressRingInner}>
            <Text style={styles.progressPctText}>{pct.toFixed(0)}%</Text>
            <Text style={styles.progressLabelText}>COMPLETED</Text>
          </View>
        </View>

        <Text style={styles.achievedText}>
          Achieved: {cov?.achieved || 0} / Total: {cov?.total_lane_points || 0} Points
        </Text>

        {/* Breakdowns */}
        <View style={styles.divider} />
        
        <View style={styles.statusRow}>
          <View style={styles.statusCol}>
            <Text style={[styles.statusCount, { color: '#2E7D32' }]}>{cov?.achieved || 0}</Text>
            <Text style={styles.statusLabel}>Done</Text>
          </View>

          <View style={styles.statusCol}>
            <Text style={[styles.statusCount, { color: '#F57F17' }]}>{cov?.pending_approval || 0}</Text>
            <Text style={styles.statusLabel}>Pending</Text>
          </View>

          <View style={styles.statusCol}>
            <Text style={[styles.statusCount, { color: '#C62828' }]}>{cov?.missed || 0}</Text>
            <Text style={styles.statusLabel}>Missed</Text>
          </View>
        </View>
      </View>

      {/* Shift Time Info */}
      <View style={styles.timerCard}>
        <Text style={styles.timerTitle}>⏱️ Shift Information</Text>
        <Text style={styles.timerText}>
          Shift Status: ACTIVE
        </Text>
        <Text style={styles.timerText}>
          Shift ends at: {cov?.shift_end ? new Date(cov.shift_end).toLocaleTimeString() : '14:00 PM'}
        </Text>
      </View>
    </ScrollView>
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
  card: {
    backgroundColor: '#ffffff',
    margin: 16,
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    elevation: 3,
  },
  progressRingOuter: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 12,
    borderColor: '#2E7D32', // green completed ring
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  progressRingInner: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressPctText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#212121',
  },
  progressLabelText: {
    fontSize: 10,
    color: '#757575',
    fontWeight: 'bold',
    marginTop: 4,
  },
  achievedText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    width: '100%',
    marginBottom: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  statusCol: {
    alignItems: 'center',
  },
  statusCount: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },
  timerCard: {
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 8,
    padding: 16,
    elevation: 2,
  },
  timerTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  timerText: {
    fontSize: 13,
    color: '#616161',
    marginBottom: 4,
  },
});
