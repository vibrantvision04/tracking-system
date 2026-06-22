import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface WardCoverageItem {
  ward_id: number;
  ward_name: string;
  coverage_percent: number;
  vehicles_active: number;
  drivers_present: number;
  open_depots_submitted: number;
}

interface WardCoverageResponse {
  wards: WardCoverageItem[];
}

export default function WardCoverageScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wardsCoverage'],
    queryFn: async () => {
      const res = await api.get('/coverage/wards');
      return res as unknown as WardCoverageResponse;
    },
  });

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading ward coverage metrics...</Text>
      </View>
    );
  }

  const wardList = data?.wards || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Ward Coverage</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={['#1565C0']} />
        }
      >
        <Text style={styles.sectionTitle}>Assigned Wards Status</Text>

        {wardList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No wards assigned or data unavailable.</Text>
          </View>
        ) : (
          wardList.map((ward: any) => {
            const pct = Math.min(100, Math.max(0, ward.coverage_percent));
            return (
              <View key={ward.ward_id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <Text style={styles.wardName}>{ward.ward_name}</Text>
                  <View style={styles.pctBadge}>
                    <Text style={styles.pctText}>{pct.toFixed(1)}%</Text>
                  </View>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
                </View>

                {/* Metrics Row */}
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.vehicles_active}</Text>
                    <Text style={styles.metricLabel}>Active Vehicles</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.drivers_present}</Text>
                    <Text style={styles.metricLabel}>Drivers Present</Text>
                  </View>

                  <View style={styles.metricItem}>
                    <Text style={styles.metricValue}>{ward.open_depots_submitted}</Text>
                    <Text style={styles.metricLabel}>Depots Cleaned</Text>
                  </View>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#616161',
    marginBottom: 16,
  },
  emptyContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 1,
  },
  emptyText: {
    fontSize: 14,
    color: '#757575',
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
  wardName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  pctBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pctText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 14,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e0e0e0',
    borderRadius: 4,
    width: '100%',
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1565C0',
    borderRadius: 4,
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f5f5f5',
    paddingTop: 12,
  },
  metricItem: {
    alignItems: 'center',
    flex: 1,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: 11,
    color: '#757575',
    textAlign: 'center',
  },
});
