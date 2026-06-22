import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface WardItem {
  ward_id: number;
  ward_name: string;
  coverage_percent: number;
}

interface ZoneDetails {
  id: number;
  name: string;
  total_wards: number;
  total_vehicles: number;
}

interface ZoneCoverageResponse {
  zone: ZoneDetails;
  coverage_percent: number;
  active_vehicles: number;
  drivers_present: number;
  wards: WardItem[];
}

export default function ZoneCoverageScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['zoneCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/zone');
      return res as unknown as ZoneCoverageResponse;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading zone coverage metrics...</Text>
      </View>
    );
  }

  const zone = data?.zone;
  const overallPct = data?.coverage_percent || 0;
  const wardList = data?.wards || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Zone Coverage</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#1565C0']} />
        }
      >
        {/* Zone Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.zoneName}>{zone?.name || 'My Zone'}</Text>
          
          <View style={styles.mainProgressContainer}>
            <View style={styles.circleMarker}>
              <Text style={styles.circlePercent}>{overallPct.toFixed(1)}%</Text>
              <Text style={styles.circleLabel}>Coverage</Text>
            </View>

            <View style={styles.mainStats}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Total Wards:</Text>
                <Text style={styles.statVal}>{zone?.total_wards || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Vehicles Active:</Text>
                <Text style={styles.statVal}>{data?.active_vehicles || 0}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Drivers Present:</Text>
                <Text style={styles.statVal}>{data?.drivers_present || 0}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Wards Breakdown */}
        <Text style={styles.sectionTitle}>Wards Performance</Text>

        {wardList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No wards performance data available.</Text>
          </View>
        ) : (
          wardList.map((ward: any) => {
            const pct = Math.min(100, Math.max(0, ward.coverage_percent));
            return (
              <View key={ward.ward_id} style={styles.wardCard}>
                <View style={styles.wardCardHeader}>
                  <Text style={styles.wardName}>{ward.ward_name}</Text>
                  <Text style={styles.wardPct}>{pct.toFixed(1)}%</Text>
                </View>

                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                </View>
              </View>
            );
          })
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
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    elevation: 3,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  zoneName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1565C0',
    marginBottom: 16,
  },
  mainProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  circleMarker: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 6,
    borderColor: '#1565C0',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
  },
  circlePercent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0D47A1',
  },
  circleLabel: {
    fontSize: 10,
    color: '#1565C0',
    fontWeight: 'bold',
  },
  mainStats: {
    flex: 1,
    marginLeft: 20,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 13,
    color: '#616161',
  },
  statVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#212121',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#616161',
    marginBottom: 16,
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
  wardCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 1.5,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  wardCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  wardName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
  },
  wardPct: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#2E7D32',
  },
});
