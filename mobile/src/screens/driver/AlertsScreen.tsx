import React from 'react';
import { StyleSheet, Text, View, ActivityIndicator, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { useAlerts } from '../../hooks/useAlerts';

export default function AlertsScreen({ navigation }: any) {
  const { data, isLoading, refetch } = useAlerts();

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/acknowledge/${id}`);
      Alert.alert('Success', 'Alert acknowledged.');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', 'Failed to acknowledge alert.');
    }
  };

  const renderAlertItem = ({ item }: any) => (
    <View style={[styles.alertCard, item.acknowledged && styles.acknowledgedCard]}>
      <View style={styles.alertHeader}>
        <Text style={styles.alertType}>⚠️ {item.type.toUpperCase()}</Text>
        <Text style={styles.alertTime}>{new Date(item.created_at).toLocaleTimeString()}</Text>
      </View>
      <Text style={styles.alertMessage}>{item.message}</Text>
      
      {!item.acknowledged && (
        <TouchableOpacity style={styles.ackButton} onPress={() => handleAcknowledge(item.id)}>
          <Text style={styles.ackText}>Acknowledge</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading alerts...</Text>
      </View>
    );
  }

  const activeAlerts = data?.alerts || [];

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Major Alerts</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={() => refetch()}>
          <Text style={styles.refreshText}>🔄</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={activeAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertItem}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>🎉 No active major alerts!</Text>
          </View>
        }
      />
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
  listContainer: {
    padding: 16,
  },
  alertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#C62828', // red warning border
    elevation: 2,
  },
  acknowledgedCard: {
    borderLeftColor: '#B0BEC5',
    opacity: 0.6,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  alertType: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#C62828',
  },
  alertTime: {
    fontSize: 12,
    color: '#757575',
  },
  alertMessage: {
    fontSize: 14,
    color: '#212121',
    lineHeight: 20,
    marginBottom: 12,
  },
  ackButton: {
    height: 56, // 56dp minimum touch target
    backgroundColor: '#1565C0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  ackText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  emptyContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#2E7D32',
    fontWeight: 'bold',
  },
});
