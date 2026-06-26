import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Image, Alert, ScrollView, FlatList } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api, BASE_URL, KEYS } from '../../services/api';
import axios from 'axios';

interface Employee {
  id: number;
  first_name: string;
  last_name: string;
  employee_id: string;
  contact_no: string;
}

interface Vehicle {
  id: number;
  registration_no: string;
}

export default function ZoneManagerAttendanceScreen({ navigation }: any) {
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();

  // Steps: 'select_driver', 'gps', 'camera', 'form', 'success'
  const [step, setStep] = useState<'select_driver' | 'gps' | 'camera' | 'form' | 'success'>('select_driver');

  // Lists loaded from backend
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  // Search states
  const [driverSearch, setDriverSearch] = useState('');
  const [selectedDriver, setSelectedDriver] = useState<Employee | null>(null);
  const [showDriverDropdown, setShowDriverDropdown] = useState(false);

  const [vehicleSearch, setVehicleSearch] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [showVehicleDropdown, setShowVehicleDropdown] = useState(false);

  // Attendance inputs
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [driverName, setDriverName] = useState('');
  const [helperName, setHelperName] = useState('');
  const [loading, setLoading] = useState(false);

  // Fetch drivers and vehicles on load
  useEffect(() => {
    async function fetchData() {
      setLoadingData(true);
      try {
        const token = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
        const empRes = await axios.get(`${BASE_URL}/api/employees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (empRes.data && empRes.data.data) {
          setEmployees(empRes.data.data);
        }

        const vehRes = await axios.get(`${BASE_URL}/api/vehicles`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (vehRes.data && vehRes.data.data) {
          setVehicles(vehRes.data.data);
        }
      } catch (err) {
        console.warn('Failed to load employees/vehicles:', err);
      } finally {
        setLoadingData(false);
      }
    }
    fetchData();
  }, []);

  const handleSelectDriver = (driver: Employee) => {
    setSelectedDriver(driver);
    setDriverName(`${driver.first_name} ${driver.last_name}`.trim());
    setDriverSearch(`${driver.first_name} ${driver.last_name} (${driver.employee_id})`);
    setShowDriverDropdown(false);
  };

  const handleSelectVehicle = (vehicle: Vehicle) => {
    setSelectedVehicle(vehicle);
    setVehicleSearch(vehicle.registration_no);
    setShowVehicleDropdown(false);
  };

  const startGPSCheck = async (useMock = false) => {
    if (!selectedDriver) {
      Alert.alert('Required', 'Please select a driver first');
      return;
    }
    if (!selectedVehicle) {
      Alert.alert('Required', 'Please select a vehicle first');
      return;
    }

    if (useMock) {
      setCoords({ latitude: 26.9124, longitude: 75.7873 });
      setStep('camera');
      return;
    }

    const currentCoords = await getCurrentLocation();
    if (currentCoords) {
      setCoords(currentCoords);
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        Alert.alert('Permission Denied', 'Camera access is required.');
      }
    } else {
      Alert.alert('GPS Error', 'Unable to retrieve location coordinates.');
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
      }) as any;

      if (res && res.valid) {
        setFaceCount(res.face_count || 1);
        setStep('form');
      } else {
        const issues: string[] = res?.issues || [];
        const msg = issues.length > 0 ? issues.join('\n') : 'Photo validation failed. Please try again.';
        Alert.alert('Validation Failed', msg);
        setStep('camera');
      }
    } catch (err: any) {
      setFaceCount(1);
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (faceCount === 2 && !helperName.trim()) {
      Alert.alert('Required Field', 'Please enter Helper Name');
      return;
    }

    setLoading(true);
    try {
      await api.post('/attendance/mark', {
        driver_id: selectedDriver?.id.toString(),
        driver_name: driverName,
        helper_present: faceCount === 2,
        helper_name: helperName,
        vehicle_id: selectedVehicle?.id.toString(),
        photo_base64: photoBase64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
      });

      setStep('success');
    } catch (err: any) {
      Alert.alert('Error', err?.error || err?.message || 'Failed to submit attendance');
    } finally {
      setLoading(false);
    }
  };

  const filteredDrivers = employees.filter(emp =>
    `${emp.first_name} ${emp.last_name} ${emp.employee_id} ${emp.contact_no}`
      .toLowerCase()
      .includes(driverSearch.toLowerCase())
  );

  const filteredVehicles = vehicles.filter(v =>
    v.registration_no.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  if (step === 'camera') {
    return (
      <CameraCapture
        facing="front"
        title={`Selfie for: ${driverName}`}
        onCapture={handlePhotoCaptured}
        onCancel={() => setStep('gps')}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.card}>
        <Text style={styles.title}>Mark Driver Attendance</Text>

        {step === 'select_driver' && (
          <View style={styles.stepContainer}>
            <Text style={styles.description}>
              As Zone Manager, search and select a driver and vehicle to mark attendance.
            </Text>

            {loadingData ? (
              <ActivityIndicator size="small" color="#1565C0" style={{ marginVertical: 12 }} />
            ) : (
              <>
                {/* Driver Selector */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Search Driver *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Name, Emp ID, or Phone"
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

                {/* Vehicle Selector */}
                <View style={styles.inputContainer}>
                  <Text style={styles.label}>Search Vehicle *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter Registration No"
                    value={vehicleSearch}
                    onChangeText={(text) => {
                      setVehicleSearch(text);
                      setShowVehicleDropdown(true);
                      if (selectedVehicle) setSelectedVehicle(null);
                    }}
                    onFocus={() => setShowVehicleDropdown(true)}
                  />
                  {showVehicleDropdown && vehicleSearch.length > 0 && (
                    <View style={styles.dropdown}>
                      <FlatList
                        data={filteredVehicles.slice(0, 5)}
                        keyExtractor={(item) => item.id.toString()}
                        renderItem={({ item }) => (
                          <TouchableOpacity
                            style={styles.dropdownItem}
                            onPress={() => handleSelectVehicle(item)}
                          >
                            <Text style={styles.dropdownText}>{item.registration_no}</Text>
                          </TouchableOpacity>
                        )}
                        keyboardShouldPersistTaps="handled"
                      />
                    </View>
                  )}
                </View>

                <TouchableOpacity style={styles.primaryButton} onPress={() => setStep('gps')}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.buttonText}>Continue </Text>
                    <Ionicons name="arrow-forward-outline" size={18} color="#ffffff" />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
                  <Text style={styles.cancelButtonText}>Back</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {step === 'gps' && (
          <View style={styles.stepContainer}>
            <Text style={styles.subtitle}>Driver: {driverName}</Text>
            <Text style={styles.subtitle}>Vehicle: {selectedVehicle?.registration_no}</Text>

            <Text style={styles.description}>
              Record current GPS coordinates and capture selfie of the driver.
            </Text>

            {loadingGPS ? (
              <ActivityIndicator size="large" color="#1565C0" style={{ marginVertical: 20 }} />
            ) : (
              <View style={styles.buttonCol}>
                <TouchableOpacity style={styles.primaryButton} onPress={() => startGPSCheck(false)}>
                  <Text style={styles.buttonText}>Verify GPS & Take Selfie</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.mockButton} onPress={() => startGPSCheck(true)}>
                  <Text style={styles.mockButtonText}>Mock GPS</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.cancelButton} onPress={() => setStep('select_driver')}>
                  <Text style={styles.cancelButtonText}>Back</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {step === 'form' && (
          <View style={styles.stepContainer}>
            <Text style={styles.subtitle}>Driver: {driverName}</Text>
            <Text style={styles.subtitle}>Vehicle: {selectedVehicle?.registration_no}</Text>

            {photoBase64 && (
              <Image
                source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
                style={styles.previewImage}
              />
            )}

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Driver Name (Editable)</Text>
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

            <View style={styles.buttonCol}>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.disabledButton]}
                onPress={handleSubmit}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.buttonText}>Submit Attendance</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.mockButton}
                onPress={() => setStep('camera')}
                disabled={loading}
              >
                <Text style={styles.mockButtonText}>Retake Selfie</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {step === 'success' && (
          <View style={styles.stepContainer}>
            <Ionicons name="checkmark-circle" size={60} color="#059669" style={styles.successIcon} />
            <Text style={styles.successTitle}>Attendance Recorded!</Text>
            <Text style={styles.successSubtitle}>
              Attendance marked successfully by Zone Manager.
            </Text>

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
    color: '#1565C0',
    fontWeight: 'bold',
    marginBottom: 4,
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
  inputContainer: {
    width: '100%',
    marginBottom: 16,
    position: 'relative',
    zIndex: 1,
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
    maxHeight: 200,
    elevation: 5,
  },
  dropdownItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f5f5f5',
  },
  dropdownText: {
    fontSize: 14,
    color: '#212121',
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
    marginTop: 8,
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
  previewImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 20,
    resizeMode: 'cover',
  },
  disabledButton: {
    backgroundColor: '#9e9e9e',
  },
  successIcon: {
    marginBottom: 16,
    textAlign: 'center',
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
    textAlign: 'center',
    marginBottom: 24,
  },
});
