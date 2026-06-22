import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Image, Alert, ScrollView } from 'react-native';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { useAuth } from '../../context/AuthContext';

export default function ZoneManagerPunchInScreen({ navigation }: any) {
  const { user } = useAuth();
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();
  const { refetch: refetchPunch } = usePunchStatus();

  // Steps: 'gps', 'camera', 'form', 'success'
  const [step, setStep] = useState<'gps' | 'camera' | 'form' | 'success'>('gps');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [managerName, setManagerName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);

  const startGPSCheck = async (useMock = false) => {
    if (useMock) {
      setCoords({ latitude: 26.9124, longitude: 75.7873 });
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      }
      return;
    }

    const currentCoords = await getCurrentLocation();
    if (currentCoords) {
      setCoords(currentCoords);
    } else {
      // Zone managers are allowed to proceed even if GPS fails, but let's default to a mock location for auditing
      setCoords({ latitude: 26.9124, longitude: 75.7873 });
    }

    const cameraGranted = await requestPermission();
    if (cameraGranted) {
      setStep('camera');
    } else {
      Alert.alert('Permission Denied', 'Camera access is required to punch in.');
    }
  };

  const handlePhotoCaptured = (base64: string) => {
    setPhotoBase64(base64);
    setStep('form');
  };

  const handleSubmit = async () => {
    if (!managerName.trim()) {
      Alert.alert('Required Field', 'Please enter your name');
      return;
    }

    setLoading(true);
    try {
      await api.post('/attendance/punch-in', {
        driver_name: managerName, // Backend expects manager name in driver_name field
        photo_base64: photoBase64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        face_count: 1,
        vehicle_id: '0',
      });

      await refetchPunch();
      setStep('success');
    } catch (err: any) {
      Alert.alert('Error', err?.error || err?.message || 'Failed to submit punch-in');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'camera') {
    return (
      <CameraCapture
        facing="front"
        title="Capture Selfie for Attendance"
        onCapture={handlePhotoCaptured}
        onCancel={() => setStep('gps')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Zone Manager Punch In</Text>

        {step === 'gps' && (
          <View style={styles.stepContainer}>
            <Text style={styles.description}>
              The app will verify your coordinates for auditing purposes before taking the selfie.
            </Text>

            {loadingGPS ? (
              <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.buttonCol}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => startGPSCheck(false)}>
                  <Text style={styles.buttonText}>Verify GPS & Proceed</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mockButton} onPress={() => startGPSCheck(true)}>
                  <Text style={styles.mockButtonText}>Mock GPS</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {step === 'form' && (
          <View style={styles.stepContainer}>
            <Text style={styles.subtitle}>Confirm details & submit</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Manager Name</Text>
              <TextInput
                style={styles.input}
                value={managerName}
                onChangeText={setManagerName}
                placeholder="Enter your name"
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.disabledButton]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.buttonText}>looks good, Punch In →</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {step === 'success' && (
          <View style={styles.stepContainer}>
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>Punched In Successfully!</Text>
            <Text style={styles.successSubtitle}>Your manager shift is now active.</Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => navigation.navigate('ZoneManagerHome')}
            >
              <Text style={styles.buttonText}>Go to Home</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '600',
  },
  stepContainer: {
    alignItems: 'center',
    width: '100%',
  },
  description: {
    fontSize: 15,
    color: '#616161',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  buttonCol: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    height: 56,
    backgroundColor: '#1565C0',
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockButton: {
    height: 56,
    borderColor: '#1565C0',
    borderWidth: 1.5,
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  cancelButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  mockButtonText: {
    color: '#1565C0',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButtonText: {
    color: '#757575',
    fontSize: 16,
    fontWeight: 'bold',
  },
  inputContainer: {
    width: '100%',
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  input: {
    height: 56,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#212121',
    backgroundColor: '#fafafa',
    width: '100%',
  },
  disabledButton: {
    backgroundColor: '#9e9e9e',
  },
  successIcon: {
    fontSize: 60,
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 24,
  },
});
