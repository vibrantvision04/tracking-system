import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, Alert, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface AlertItem {
  id: string;
  type: 'overspeed' | 'lane_point_missed' | 'vehicle_stopped';
  message: string;
  severity: 'minor' | 'major';
  created_at: string;
  acknowledged: boolean;
}

export default function ZoneManagerAlertsScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/zone');
      return res as unknown as { alerts: AlertItem[] };
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/acknowledge/${id}`);
      Alert.alert('Success', 'Alert acknowledged successfully');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to acknowledge alert');
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading zone alerts...</Text>
      </View>
    );
  }

  const alertList = data?.alerts || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zone Alerts</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#1565C0']} />
        }
      >
        <Text style={styles.sectionTitle}>Zone Active Alerts ({alertList.length})</Text>

        {alertList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No active alerts in the zone.</Text>
          </View>
        ) : (
          alertList.map((alert: any) => (
            <View key={alert.id} style={styles.alertCard}>
              <View style={styles.alertHeader}>
                <Text style={styles.alertType}>
                  {alert.type === 'overspeed' ? '⚠️ OVERSPEED' :
                   alert.type === 'vehicle_stopped' ? '🛑 VEHICLE STOPPED' :
                   '📍 LANE POINT MISSED'}
                </Text>
                <Text style={styles.timeText}>
                  {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>

              <Text style={styles.alertMessage}>{alert.message}</Text>

              {!alert.acknowledged && (
                <TouchableOpacity
                  style={styles.ackButton}
                  onPress={() => handleAcknowledge(alert.id)}
                >
                  <Text style={styles.ackText}>Acknowledge ✓</Text>
                </TouchableOpacity>
              )}
            </View>
          ))
        )}
      </ScrollView>
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
    marginBottom: 12,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 24,
    alignItems: 'center',
    elevation: 1,
  },
  emptyText: {
    color: '#757575',
    fontSize: 14,
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#C62828', // Red border for alerts
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  alertType: {
    fontWeight: 'bold',
    fontSize: 13,
    color: '#C62828',
  },
  timeText: {
    fontSize: 11,
    color: '#757575',
  },
  alertMessage: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
    marginBottom: 12,
  },
  ackButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  ackText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
