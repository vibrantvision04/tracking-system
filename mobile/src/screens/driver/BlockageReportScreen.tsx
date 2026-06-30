import React, { useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { getHaversineDistance } from '../../utils/gpsValidator';

export default function BlockageReportScreen({ route, navigation }: any) {
  const { pointId, pointName, latitude, longitude, prevLatitude, prevLongitude } = route.params || {};

  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();

  // Steps: 'gps', 'camera', 'confirm', 'success'
  const [step, setStep] = useState<'gps' | 'camera' | 'confirm' | 'success'>('gps');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const startGPSCheck = async (useMock = false) => {
    let currentCoords = null;

    if (useMock) {
      // Mock coordinates directly at the lane point
      currentCoords = { latitude, longitude };
    } else {
      currentCoords = await getCurrentLocation();
    }

    if (!currentCoords) {
      Alert.alert('GPS Error', 'GPS signal required. Please enable location services and try again.');
      return;
    }

    setCoords(currentCoords);

    // Calculate distance to selected point and previous point
    const distToTarget = getHaversineDistance(
      { latitude: currentCoords.latitude, longitude: currentCoords.longitude },
      { latitude, longitude }
    );

    let distToPrev = Infinity;
    if (prevLatitude !== null && prevLongitude !== null) {
      distToPrev = getHaversineDistance(
        { latitude: currentCoords.latitude, longitude: currentCoords.longitude },
        { latitude: prevLatitude, longitude: prevLongitude }
      );
    }

    // Check if within 10 meters of target or previous point
    const isWithinTarget = distToTarget <= 10;
    const isWithinPrev = distToPrev <= 10;

    if (isWithinTarget || isWithinPrev) {
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        Alert.alert('Permission Denied', 'Camera access is required to take blockage photo.');
      }
    } else {
      const msg = `You are too far from this lane point to report a blockage. Move closer and try again. (Target: ${distToTarget.toFixed(1)}m, Previous: ${distToPrev === Infinity ? 'N/A' : distToPrev.toFixed(1) + 'm'})`;
      setValidationMsg(msg);
      Alert.alert('Outside Range', msg);
    }
  };

  const handlePhotoCaptured = async (base64: string) => {
    setPhotoBase64(base64);
    setLoading(true);
    try {
      const res = await api.post('/attendance/validate-photo', {
        photo_base64: base64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        skip_face_detection: true,
      }) as any;

      if (res && res.valid) {
        setStep('confirm');
      } else {
        const issues: string[] = res?.issues || [];
        const msg = issues.length > 0 ? issues.join('\n') : 'Photo validation failed. Please try again.';
        Alert.alert('Validation Failed', msg);
      }
    } catch (err: any) {
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!photoBase64 || !coords) return;

    setLoading(true);
    try {
      await api.post('/blockages', {
        lane_point_id: pointId,
        photo_base64: photoBase64,
        gps_lat: coords.latitude,
        gps_lng: coords.longitude,
      });

      setStep('success');
    } catch (err: any) {
      Alert.alert('Submission Failed', err?.error || err?.message || 'Failed to submit blockage report');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'camera') {
    return (
      <CameraCapture
        facing="back"
        title={`Blockage Photo: ${pointName}`}
        onCapture={handlePhotoCaptured}
        onCancel={() => setStep('gps')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Report Route Blockage</Text>
        <Text style={styles.subtitle}>Selected: {pointName}</Text>

        {step === 'gps' && (
          <View style={styles.stepContainer}>
            <Text style={styles.description}>
              You must be within 10m of this lane point OR within 10m of the previous point to report a blockage.
            </Text>

            {validationMsg && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{validationMsg}</Text>
              </View>
            )}

            {loadingGPS ? (
              <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.buttonCol}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => startGPSCheck(false)}>
                  <Text style={styles.buttonText}>Verify GPS Location</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mockButton} onPress={() => startGPSCheck(true)}>
                  <Text style={styles.mockButtonText}>Mock GPS (Near Point)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.stepContainer}>
            <Text style={styles.description}>
              Verify the blockage photo and coordinates before final submission.
            </Text>

            {photoBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
                style={styles.previewImage}
              />
            )}

            <View style={styles.coordsBox}>
              <Text style={styles.coordsText}>Latitude: {coords?.latitude.toFixed(6)}</Text>
              <Text style={styles.coordsText}>Longitude: {coords?.longitude.toFixed(6)}</Text>
            </View>

            <View style={styles.buttonCol}>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>looks good, Submit Report →</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mockButton}
                onPress={() => setStep('camera')}
                disabled={loading}
              >
                <Text style={styles.mockButtonText}>Retake Photo</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'success' && (
          <View style={styles.stepContainer}>
            <Ionicons name="warning-outline" size={60} color="#E65100" />
            <Text style={styles.successTitle}>Blockage Reported!</Text>
            <Text style={styles.successSubtitle}>
              Initial approval granted. You may continue your route.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => {
                navigation.navigate('DriverRouteMap');
              }}
            >
              <Text style={styles.buttonText}>Back to Route Map</Text>
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
    marginBottom: 8,
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
    marginTop: 16,
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
  errorBox: {
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    textAlign: 'center',
  },
  previewImage: {
    width: '100%',
    height: 240,
    borderRadius: 8,
    marginBottom: 16,
    resizeMode: 'cover',
  },
  coordsBox: {
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    width: '100%',
    alignItems: 'center',
    marginBottom: 8,
  },
  coordsText: {
    fontSize: 14,
    color: '#616161',
    fontFamily: 'System',
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
    color: '#E65100', // Amber/dark orange
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 14,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 24,
  },
});
