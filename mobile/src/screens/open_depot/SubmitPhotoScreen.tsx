import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ActivityIndicator, Image, Alert, ScrollView, FlatList } from 'react-native';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { getHaversineDistance } from '../../utils/gpsValidator';
import { OpenDepot } from '../../types';
import { useAuth } from '../../context/AuthContext';

interface DepotSubmission {
  depot_id: number;
  shift: string;
  submitted_at: string;
}

export default function SubmitPhotoScreen({ navigation }: any) {
  const { logout, user } = useAuth();
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();

  // Steps: 'select_depot', 'gps', 'camera', 'confirm', 'success'
  const [step, setStep] = useState<'select_depot' | 'gps' | 'camera' | 'confirm' | 'success'>('select_depot');
  const [depots, setDepots] = useState<OpenDepot[]>([]);
  const [submissions, setSubmissions] = useState<DepotSubmission[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Selection states
  const [selectedDepot, setSelectedDepot] = useState<OpenDepot | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationMsg, setValidationMsg] = useState<string | null>(null);

  const currentHour = new Date().getHours();
  const currentShift = currentHour < 14 ? 'morning' : 'evening';

  useEffect(() => {
    async function loadDepotsAndSubmissions() {
      setLoadingData(true);
      try {
        const depotsRes = await api.get('/open-depot/depots') as { depots: OpenDepot[] };
        if (depotsRes && depotsRes.depots) {
          setDepots(depotsRes.depots);
        }

        const subRes = await api.get('/open-depot/submissions') as DepotSubmission[];
        if (subRes) {
          setSubmissions(subRes);
        }
      } catch (err) {
        console.warn('Failed to load depots or submissions:', err);
      } finally {
        setLoadingData(false);
      }
    }
    loadDepotsAndSubmissions();
  }, [step]);

  const handleSelectDepot = (depot: OpenDepot) => {
    // Check if already submitted this shift
    const alreadySubmitted = submissions.some(
      s => s.depot_id === depot.id && s.shift.toLowerCase() === currentShift
    );

    if (alreadySubmitted) {
      Alert.alert('Already Submitted', `This depot has already been submitted for the ${currentShift} shift.`);
      return;
    }

    setSelectedDepot(depot);
    setValidationMsg(null);
    setStep('gps');
  };

  const startGPSCheck = async (useMock = false) => {
    if (!selectedDepot) return;

    let currentCoords = null;
    if (useMock) {
      currentCoords = { latitude: selectedDepot.latitude, longitude: selectedDepot.longitude };
    } else {
      currentCoords = await getCurrentLocation();
    }

    if (!currentCoords) {
      Alert.alert('GPS Error', 'GPS signal required. Please enable location services and try again.');
      return;
    }

    setCoords(currentCoords);

    // Calculate distance to selected depot
    const distance = getHaversineDistance(
      { latitude: currentCoords.latitude, longitude: currentCoords.longitude },
      { latitude: selectedDepot.latitude, longitude: selectedDepot.longitude }
    );

    const allowedRadius = selectedDepot.radius || 50;

    if (distance <= allowedRadius) {
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        Alert.alert('Permission Denied', 'Camera access is required to capture depot photo.');
      }
    } else {
      const msg = `You are not at this depot. Move closer and try again. (Current distance: ${distance.toFixed(1)}m, Allowed radius: ${allowedRadius}m)`;
      setValidationMsg(msg);
      Alert.alert('Outside Range', msg);
    }
  };

  const handlePhotoCaptured = (base64: string) => {
    setPhotoBase64(base64);
    setStep('confirm');
  };

  const handleSubmit = async () => {
    if (!photoBase64 || !coords || !selectedDepot) return;

    setLoading(true);
    try {
      await api.post('/open-depot', {
        depot_id: selectedDepot.id.toString(),
        photo_base64: photoBase64,
        gps_lat: coords.latitude,
        gps_lng: coords.longitude,
        shift: currentShift,
      });

      setStep('success');
    } catch (err: any) {
      Alert.alert('Submission Failed', err?.error || err?.message || 'Failed to submit open depot cleaning photo');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'camera') {
    return (
      <CameraCapture
        facing="back"
        title={`Depot Photo: ${selectedDepot?.name}`}
        onCapture={handlePhotoCaptured}
        onCancel={() => setStep('gps')}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Open Depot Operator</Text>
          <Text style={styles.nameText}>{user?.name || 'Operator'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {step === 'select_depot' && (
          <View style={styles.stepContainer}>
            <Text style={styles.sectionTitle}>Select Assigned Depot</Text>
            <Text style={styles.description}>
              Tap on an available depot to start your verification submission.
            </Text>

            {loadingData ? (
              <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
            ) : depots.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No depots assigned to you.</Text>
              </View>
            ) : (
              depots.map((depot) => {
                const isDone = submissions.some(
                  s => s.depot_id === depot.id && s.shift.toLowerCase() === currentShift
                );
                return (
                  <TouchableOpacity
                    key={depot.id}
                    style={[styles.depotCard, isDone && styles.disabledCard]}
                    onPress={() => handleSelectDepot(depot)}
                    disabled={isDone}
                  >
                    <View style={styles.depotInfo}>
                      <Text style={styles.depotName}>{depot.name}</Text>
                      <Text style={styles.depotSub}>
                        Radius: {depot.radius || 50}m | Shift: {currentShift.toUpperCase()}
                      </Text>
                    </View>
                    {isDone ? (
                      <View style={styles.statusBadgeDone}>
                        <Text style={styles.statusBadgeText}>✓ Cleaned</Text>
                      </View>
                    ) : (
                      <Text style={styles.arrowIcon}>→</Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}

        {step === 'gps' && (
          <View style={styles.stepContainer}>
            <View style={styles.selectedDepotHeader}>
              <Text style={styles.selectedDepotTitle}>{selectedDepot?.name}</Text>
              <Text style={styles.selectedDepotSub}>Shift: {currentShift.toUpperCase()}</Text>
            </View>

            <Text style={styles.description}>
              Verify your GPS location to ensure you are within {selectedDepot?.radius || 50}m of the depot boundary.
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
                  <Text style={styles.mockButtonText}>Mock GPS (At Depot)</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => setStep('select_depot')}>
                  <Text style={styles.cancelButtonText}>Back to List</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {step === 'confirm' && (
          <View style={styles.stepContainer}>
            <View style={styles.selectedDepotHeader}>
              <Text style={styles.selectedDepotTitle}>{selectedDepot?.name}</Text>
              <Text style={styles.selectedDepotSub}>Shift: {currentShift.toUpperCase()}</Text>
            </View>

            <Text style={styles.description}>
              Verify the depot cleanliness photo before submitting.
            </Text>

            {photoBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
                style={styles.previewImage}
              />
            )}

            <View style={styles.buttonCol}>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Submit Depot Photo →</Text>
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
            <Text style={styles.successIcon}>🎉</Text>
            <Text style={styles.successTitle}>Cleaning Photo Submitted!</Text>
            <Text style={styles.successSubtitle}>
              Open depot photo submission for {selectedDepot?.name} recorded successfully.
            </Text>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => setStep('select_depot')}
            >
              <Text style={styles.buttonText}>Back to Depot List</Text>
            </TouchableOpacity>
          </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  welcomeText: {
    fontSize: 14,
    color: '#616161',
  },
  nameText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#212121',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#FFEBEE',
  },
  logoutText: {
    color: '#C62828',
    fontWeight: 'bold',
    fontSize: 14,
  },
  scrollContainer: {
    padding: 16,
  },
  stepContainer: {
    width: '100%',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#616161',
    lineHeight: 20,
    marginBottom: 20,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    elevation: 1.5,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  disabledCard: {
    backgroundColor: '#fafafa',
    opacity: 0.6,
  },
  depotInfo: {
    flex: 1,
  },
  depotName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
  },
  depotSub: {
    fontSize: 12,
    color: '#757575',
    marginTop: 4,
  },
  arrowIcon: {
    fontSize: 18,
    color: '#1565C0',
    fontWeight: 'bold',
  },
  statusBadgeDone: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    color: '#2E7D32',
    fontWeight: 'bold',
    fontSize: 11,
  },
  selectedDepotHeader: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  selectedDepotTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1565C0',
  },
  selectedDepotSub: {
    fontSize: 13,
    color: '#757575',
    marginTop: 4,
  },
  buttonCol: {
    width: '100%',
    gap: 12,
    marginTop: 16,
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
  disabledButton: {
    backgroundColor: '#9e9e9e',
  },
  successIcon: {
    fontSize: 60,
    marginBottom: 16,
    textAlign: 'center',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2E7D32',
    marginBottom: 8,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#616161',
    textAlign: 'center',
    marginBottom: 24,
  },
});
