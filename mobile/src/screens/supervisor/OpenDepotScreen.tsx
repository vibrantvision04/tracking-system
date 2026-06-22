import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { OpenDepot } from '../../types';

interface DepotSubmission {
  depot_id: number;
  shift: 'morning' | 'evening' | string;
  submitted_at: string;
}

export default function SupervisorOpenDepotScreen({ navigation }: any) {
  // Fetch depots
  const { data: depotsData, isLoading: loadingDepots, refetch: refetchDepots } = useQuery({
    queryKey: ['openDepots'],
    queryFn: async () => {
      const res = await api.get('/open-depot/depots');
      return res as unknown as { depots: OpenDepot[] };
    },
  });

  // Fetch today's submissions
  const { data: submissionsData, isLoading: loadingSubmissions, refetch: refetchSubmissions } = useQuery({
    queryKey: ['depotSubmissions'],
    queryFn: async () => {
      const res = await api.get('/open-depot/submissions');
      return res as unknown as DepotSubmission[];
    },
  });

  const handleRefresh = async () => {
    await Promise.all([refetchDepots(), refetchSubmissions()]);
  };

  const isLoading = loadingDepots || loadingSubmissions;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading depot submissions...</Text>
      </View>
    );
  }

  const depotsList = depotsData?.depots || [];
  const submissionsList = submissionsData || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Open Depot Reports</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} colors={['#1565C0']} />
        }
      >
        <Text style={styles.sectionTitle}>Depot Cleaning Status (Today)</Text>

        {depotsList.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No open depots configured in the system.</Text>
          </View>
        ) : (
          depotsList.map((depot: any) => {
            // Find morning/evening submissions for this depot
            const morningSub = submissionsList.find(
              (s: any) => s.depot_id === depot.id && s.shift.toLowerCase() === 'morning'
            );
            const eveningSub = submissionsList.find(
              (s: any) => s.depot_id === depot.id && s.shift.toLowerCase() === 'evening'
            );

            return (
              <View key={depot.id} style={styles.depotCard}>
                <View style={styles.cardHeader}>
                  <Text style={styles.depotName}>{depot.name}</Text>
                  <Text style={styles.depotCoords}>
                    {depot.latitude.toFixed(4)}, {depot.longitude.toFixed(4)}
                  </Text>
                </View>

                <View style={styles.statusRow}>
                  {/* Morning Shift */}
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftLabel}>Morning Shift</Text>
                    {morningSub ? (
                      <View style={[styles.statusBadge, styles.doneBadge]}>
                        <Text style={styles.doneText}>
                          Cleaned at {new Date(morningSub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.pendingBadge]}>
                        <Text style={styles.pendingText}>Pending</Text>
                      </View>
                    )}
                  </View>

                  {/* Evening Shift */}
                  <View style={styles.shiftCol}>
                    <Text style={styles.shiftLabel}>Evening Shift</Text>
                    {eveningSub ? (
                      <View style={[styles.statusBadge, styles.doneBadge]}>
                        <Text style={styles.doneText}>
                          Cleaned at {new Date(eveningSub.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.statusBadge, styles.pendingBadge]}>
                        <Text style={styles.pendingText}>Pending</Text>
                      </View>
                    )}
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
  depotCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardHeader: {
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
    paddingBottom: 10,
    marginBottom: 12,
  },
  depotName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  depotCoords: {
    fontSize: 11,
    color: '#757575',
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  shiftCol: {
    flex: 1,
  },
  shiftLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 6,
  },
  statusBadge: {
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  doneBadge: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  pendingBadge: {
    backgroundColor: '#FFF8E1',
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  doneText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 11,
    textAlign: 'center',
  },
  pendingText: {
    color: '#F57F17',
    fontWeight: 'bold',
    fontSize: 12,
  },
});
