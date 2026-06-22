import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, FlatList, RefreshControl } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api, BASE_URL } from '../../services/api';
import axios from 'axios';

interface AlertItem {
  id: string;
  type: 'overspeed' | 'lane_point_missed' | 'vehicle_stopped';
  message: string;
  severity: 'minor' | 'major';
  created_at: string;
  acknowledged: boolean;
}

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
}

export default function SupervisorAlertsScreen({ navigation }: any) {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['wardAlerts'],
    queryFn: async () => {
      const res = await api.get('/alerts/ward');
      return res as unknown as { alerts: AlertItem[] };
    },
    refetchInterval: 30000, // Poll every 30 seconds
  });

  const [drivers, setDrivers] = useState<Employee[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Employee | null>(null);
  const [driverSearch, setDriverSearch] = useState('');
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendingAlert, setSendingAlert] = useState(false);

  // Fetch employees to lookup driver for custom alert
  useEffect(() => {
    async function fetchDrivers() {
      try {
        const res = await axios.get(`${BASE_URL}/api/employees`);
        if (res.data && res.data.data) {
          setDrivers(res.data.data);
        }
      } catch (err) {
        console.warn('Failed to load drivers for custom alert:', err);
      }
    }
    fetchDrivers();
  }, []);

  const handleAcknowledge = async (id: string) => {
    try {
      await api.post(`/alerts/acknowledge/${id}`);
      Alert.alert('Success', 'Alert acknowledged successfully');
      refetch();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to acknowledge alert');
    }
  };

  const handleSendCustomAlert = async () => {
    if (!selectedDriver) {
      Alert.alert('Required', 'Please select a driver to send the message to.');
      return;
    }
    if (!customMessage.trim()) {
      Alert.alert('Required', 'Please enter a message.');
      return;
    }

    setSendingAlert(true);
    try {
      await api.post('/alerts/custom', {
        driver_id: selectedDriver.id.toString(),
        message: customMessage.trim(),
        ward_id: '1', // Default ward or from user settings
      });

      Alert.alert('Success', 'Custom message sent to driver successfully');
      setCustomMessage('');
      setSelectedDriver(null);
      setDriverSearch('');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send custom alert');
    } finally {
      setSendingAlert(false);
    }
  };

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name} ${d.employee_id}`
      .toLowerCase()
      .includes(driverSearch.toLowerCase())
  );

  const handleSelectDriver = (driver: Employee) => {
    setSelectedDriver(driver);
    setDriverSearch(`${driver.first_name} ${driver.last_name}`);
    setShowDriverDropdown(false);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1565C0" />
        <Text style={styles.loadingText}>Loading ward alerts...</Text>
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
        <Text style={styles.headerTitle}>Ward Alerts</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        {/* Send Custom Alert Panel */}
        <View style={styles.customAlertCard}>
          <Text style={styles.cardTitle}>Send Custom Alert to Driver</Text>
          
          <View style={styles.inputContainer}>
            <Text style={styles.label}>Select Driver</Text>
            <TextInput
              style={styles.input}
              placeholder="Type driver name or ID"
              value={driverSearch}
              onChangeText={(text) => {
                setDriverSearch(text);
                setShowDriverDropdown(true);
                if (selectedDriver) setSelectedDriver(null);
              }}
              onFocus={() => setShowDriverDropdown(true)}
            />
            {showDriverDropdown && driverSearch.length > 0 && (
              <View style={styles.dropdown}>
                <FlatList
                  data={filteredDrivers.slice(0, 5)}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.dropdownItem}
                      onPress={() => handleSelectDriver(item)}
                    >
                      <Text style={styles.dropdownText}>
                        {item.first_name} {item.last_name} ({item.employee_id})
                      </Text>
                    </TouchableOpacity>
                  )}
                  keyboardShouldPersistTaps="handled"
                />
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.label}>Message (Max 200 chars)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="e.g. Please speed up to complete your route"
              value={customMessage}
              onChangeText={setCustomMessage}
              maxLength={200}
              multiline
            />
            <Text style={styles.charCount}>{customMessage.length}/200</Text>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, sendingAlert && styles.disabledButton]}
            onPress={handleSendCustomAlert}
            disabled={sendingAlert}
          >
            {sendingAlert ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.sendButtonText}>Send Alert Message ✉️</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Alerts List */}
        <Text style={styles.sectionTitle}>Active Alerts ({alertList.length})</Text>

        {alertList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No active alerts in your ward.</Text>
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
    marginTop: 24,
    marginBottom: 12,
  },
  customAlertCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 16,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
  },
  inputContainer: {
    marginBottom: 16,
    position: 'relative',
    zIndex: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#616161',
    marginBottom: 6,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 15,
    color: '#212121',
    backgroundColor: '#fafafa',
    width: '100%',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  charCount: {
    fontSize: 11,
    color: '#9e9e9e',
    textAlign: 'right',
    marginTop: 4,
  },
  dropdown: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    position: 'absolute',
    top: 80,
    left: 0,
    right: 0,
    zIndex: 999,
    maxHeight: 150,
    elevation: 4,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  dropdownText: {
    fontSize: 14,
    color: '#212121',
  },
  sendButton: {
    height: 56,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  disabledButton: {
    backgroundColor: '#9e9e9e',
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
