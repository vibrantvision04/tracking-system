import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Image, Alert, ScrollView } from 'react-native';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { usePunchStatus } from '../../hooks/usePunchStatus';

export default function PunchInScreen({ navigation }: any) {
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { hasPermission, requestPermission } = useCamera();
  const { refetch: refetchPunch } = usePunchStatus();

  // Steps: 'gps', 'camera', 'confirm_photo', 'form', 'success'
  const [step, setStep] = useState<'gps' | 'camera' | 'form' | 'success'>('gps');
  
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [driverName, setDriverName] = useState('KISHOR JI Sharma'); // Mock prefill
  const [helperName, setHelperName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('RJ47GA7244'); // Mock prefill
  const [loading, setLoading] = useState(false);

  // GPS Check
  const startGPSCheck = async (useMock = false) => {
    if (useMock) {
      setCoords({ latitude: 26.9124, longitude: 75.7873 });
      setStep('camera');
      return;
    }

    const currentCoords = await getCurrentLocation();
    if (currentCoords) {
      setCoords(currentCoords);
      // Proceed to camera
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        Alert.alert('Permission Denied', 'Camera access is required to punch in.');
      }
    } else {
      Alert.alert('GPS Error', 'Unable to retrieve location coordinates.');
    }
  };

  // Camera capture
  const handlePhotoCaptured = async (base64: string) => {
    setPhotoBase64(base64);
    setLoading(true);
    try {
      // Validate photo with backend
      const res = await api.post('/attendance/validate-photo', {
        photo_base64: base64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
      }) as any;

      if (res && res.valid) {
        setFaceCount(res.face_count || 1);
        setStep('form');
      } else {
        Alert.alert('Validation Failed', 'No face detected or photo is too blurry. Please try again.');
        setStep('camera');
      }
    } catch (err: any) {
      // Fallback/proceed anyway for testing
      setFaceCount(1);
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  // Final Submit
  const handleSubmit = async () => {
    if (faceCount === 2 && !helperName.trim()) {
      Alert.alert('Required Field', 'Please enter Helper Name');
      return;
    }

    setLoading(true);
    try {
      await api.post('/attendance/punch-in', {
        driver_name: driverName,
        helper_name: helperName,
        helper_present: faceCount === 2,
        photo_base64: photoBase64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        face_count: faceCount,
        vehicle_id: "1", // Mock vehicle ID
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
        <Text style={styles.title}>Shift Punch In</Text>

        {step === 'gps' && (
          <View style={styles.stepContainer}>
            <Text style={styles.description}>
              First, the app will verify if you are inside your assigned ward area using GPS.
            </Text>
            
            {loadingGPS ? (
              <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.buttonCol}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => startGPSCheck(false)}>
                  <Text style={styles.buttonText}>Verify GPS Location</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mockButton} onPress={() => startGPSCheck(true)}>
                  <Text style={styles.mockButtonText}>Mock GPS (Inside Ward)</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {step === 'form' && (
          <View style={styles.stepContainer}>
            <Text style={styles.subtitle}>Confirm details & submit</Text>
            
            <View style={styles.inputContainer}>
              <Text style={styles.label}>Driver Name</Text>
              <TextInput 
                style={styles.input} 
                value={driverName} 
                onChangeText={setDriverName}
              />
            </View>

            {faceCount === 2 && (
              <View style={styles.inputContainer}>
                <Text style={styles.label}>Helper Name *</Text>
                <TextInput 
                  style={styles.input} 
                  value={helperName} 
                  onChangeText={setHelperName}
                  placeholder="Enter helper's name"
                />
              </View>
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Assigned Vehicle (Read-Only)</Text>
              <Text style={styles.readOnlyText}>{vehicleNo}</Text>
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
            <Text style={styles.successSubtitle}>Your shift is now active.</Text>

            <TouchableOpacity 
              style={styles.primaryButton} 
              onPress={() => navigation.navigate('DriverHome')}
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
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
    textAlign: 'center',
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
  subtitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#757575',
    marginBottom: 20,
  },
  buttonCol: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    height: 56, // minimum 56dp
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
  inputContainer: {
    width: '100%',
    marginBottom: 16,
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
  readOnlyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#757575',
    paddingVertical: 12,
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
