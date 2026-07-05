import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Alert, ActivityIndicator, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { CameraView, Camera } from 'expo-camera';
import { useAuth } from '../../context/AuthContext';
import { api, toApiError } from '../../services/api';
import { useCamera } from '../../hooks/useCamera';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import * as Location from 'expo-location';
import { rfidLocalStore } from '../../services/rfidLocalStore';
import { useNetwork } from '../../hooks/useNetwork';

export default function RFIDScannerScreen({ navigation }: any) {
  const { user } = useAuth();
  const isConnected = useNetwork();
  const { hasPermission, requestPermission } = useCamera();
  const [manualId, setManualId] = useState('');
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const handleScan = async (rfidId: string, method: 'camera' | 'manual_entry') => {
    if (loading) return;
    setLoading(true);

    try {
      // 1. Get GPS coordinates if allowed
      let location: Location.LocationObject | null = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        }
      } catch (locErr) {
        console.warn('Could not read location for scan audit log:', locErr);
      }

      const scanPayload = {
        rfid_id: rfidId,
        scan_method: method,
        scan_purpose: user?.role === 'driver' ? 'coverage' : 'lookup',
        latitude: location?.coords.latitude || null,
        longitude: location?.coords.longitude || null,
        accuracy: location?.coords.accuracy || null,
        altitude: location?.coords.altitude || null,
        heading: location?.coords.heading || null,
        speed: location?.coords.speed || null,
        device_id: Platform.OS + '-' + (Platform.Version || 'unknown'),
      };

      if (!isConnected) {
        // Offline Flow: Log the scan locally and direct based on role
        await rfidLocalStore.addToQueue({
          action_type: 'scan_log',
          payload: scanPayload,
        });

        Alert.alert(
          'Offline Mode',
          'You are offline. Scanned RFID: ' + rfidId + '. Scanning has been logged locally.',
          [
            {
              text: 'OK',
              onPress: () => {
                setScanned(false);
                if (user?.role === 'driver') {
                  navigation.navigate('RFIDCoverageConfirm', { rfid_id: rfidId, offline: true });
                } else if (user?.role === 'supervisor') {
                  navigation.navigate('RFIDRegistration', { rfid_id: rfidId, offline: true });
                } else {
                  Alert.alert('Access Denied', 'RFID features are not enabled for your role.');
                }
              },
            },
          ]
        );
        setLoading(false);
        return;
      }

      // Online Flow
      const res = (await api.post('/rfid/scan', scanPayload)) as any;

      if (res) {
        const exists = res.exists;
        if (exists) {
          const property = res.property;
          const outstandingPaisa = res.outstanding_paisa;
          if (user?.role === 'driver') {
            navigation.navigate('RFIDCoverageConfirm', { rfid_id: rfidId, property });
          } else if (user?.role === 'supervisor') {
            navigation.navigate('RFIDPayment', { rfid_id: rfidId, property, outstanding_paisa: outstandingPaisa });
          } else {
            Alert.alert('Access Denied', 'RFID features are not enabled for your role.');
          }
        } else {
          // Property not found
          if (user?.role === 'driver') {
            Alert.alert('Not Found', 'This RFID Tag is not registered to any property.');
          } else if (user?.role === 'supervisor') {
            // Open registration form
            navigation.navigate('RFIDRegistration', { rfid_id: rfidId });
          } else {
            Alert.alert('Access Denied', 'RFID features are not enabled for your role.');
          }
        }
      }
    } catch (err: any) {
      const apiErr = toApiError(err);
      Alert.alert('Error', apiErr.message || 'Failed to lookup RFID Tag');
    } finally {
      setLoading(false);
      // Let user scan again after a short delay
      setTimeout(() => setScanned(false), 2000);
    }
  };

  const onBarcodeScanned = ({ data }: any) => {
    if (scanned || loading) return;
    setScanned(true);
    handleScan(data, 'camera');
  };

  if (hasPermission === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.text}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (hasPermission === false) {
    return (
      <View style={styles.center}>
        <Header title="RFID Scanner" />
        <Text style={styles.errorText}>Camera permission was denied. Please enable it in Settings.</Text>
        <Button title="Grant Permission" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="RFID Scanner" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.scannerCard}>
          <Text style={styles.instructions}>Align the printed RFID Tag inside the camera window</Text>
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'code128', 'ean13'],
              }}
              onBarcodeScanned={scanned ? undefined : onBarcodeScanned}
            />
            {loading && (
              <View style={styles.overlay}>
                <ActivityIndicator size="large" color="#ffffff" />
              </View>
            )}
          </View>
        </Card>

        <Card style={styles.manualCard}>
          <Text style={styles.sectionTitle}>Manual RFID Tag Entry</Text>
          <TextInput
            style={styles.input}
            value={manualId}
            onChangeText={setManualId}
            placeholder="Enter Numeric RFID ID"
            placeholderTextColor={theme.colors.textDim}
            autoCapitalize="characters"
          />
          <Button
            title="Search RFID Tag"
            loading={loading}
            disabled={!manualId.trim()}
            onPress={() => handleScan(manualId.trim(), 'manual_entry')}
          />
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scroll: {
    padding: 16,
    gap: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: theme.colors.background,
  },
  text: {
    ...theme.typography.body,
    color: theme.colors.textDark,
  },
  errorText: {
    ...theme.typography.body,
    color: theme.colors.error,
    textAlign: 'center',
    paddingHorizontal: 32,
    marginBottom: 16,
  },
  scannerCard: {
    alignItems: 'center',
    padding: 16,
  },
  instructions: {
    ...theme.typography.secondary,
    color: theme.colors.textDim,
    textAlign: 'center',
    marginBottom: 16,
  },
  cameraWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    position: 'relative',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  manualCard: {
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    ...theme.typography.heading,
    fontSize: 16,
    color: theme.colors.textDark,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.textDark,
    backgroundColor: '#FFFFFF',
  },
});
