import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Alert, ActivityIndicator, ScrollView, Switch, Platform, TouchableOpacity, Modal, FlatList } from 'react-native';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import { api, toApiError } from '../../services/api';
import { useNetwork } from '../../hooks/useNetwork';
import { rfidLocalStore } from '../../services/rfidLocalStore';
import * as Location from 'expo-location';
import CameraCapture from '../../components/CameraCapture';
import SearchableSelect from '../../components/SearchableSelect';

// Local static fallback config in case offline
const FALLBACK_FORM_CONFIG = [
  { field_key: 'property_status', label: 'Property Type', field_type: 'select', options: [{value:'RESIDENTIAL',label:'Residential'},{value:'COMMERCIAL',label:'Commercial'}], is_required: true, section: 'property' },
  { field_key: 'house_no', label: 'House/Plot Number', field_type: 'text', is_required: true, section: 'property' },
  { field_key: 'address', label: 'Full Address', field_type: 'textarea', is_required: true, section: 'location' },
  { field_key: 'owner_first_name', label: 'First Name', field_type: 'text', is_required: true, section: 'contact' },
  { field_key: 'owner_last_name', label: 'Last Name', field_type: 'text', is_required: true, section: 'contact' },
  { field_key: 'mobile_number', label: 'Mobile Number', field_type: 'text', is_required: true, section: 'contact' },
  { field_key: 'monthly_charge', label: 'Monthly Charge (Rs)', field_type: 'number', is_required: true, section: 'financial' },
];

export default function RFIDRegistrationScreen({ route, navigation }: any) {
  const { rfid_id } = route.params;
  const isConnected = useNetwork();

  const [formConfig, setFormConfig] = useState<any[]>(FALLBACK_FORM_CONFIG);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [gpsData, setGpsData] = useState<any>(null);
  const [zones, setZones] = useState<any[]>([]);
  const [wards, setWards] = useState<any[]>([]);
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<number | null>(null);

  useEffect(() => {
    fetchFormConfig();
    fetchGps();
    fetchZonesAndWards();
  }, []);

  const fetchZonesAndWards = async () => {
    try {
      const zonesRes = (await api.get('/zones')) as any;
      if (zonesRes && zonesRes.success && Array.isArray(zonesRes.data)) {
        setZones(zonesRes.data);
      } else if (zonesRes && Array.isArray(zonesRes.data)) {
        setZones(zonesRes.data);
      } else if (Array.isArray(zonesRes)) {
        setZones(zonesRes);
      }

      const wardsRes = (await api.get('/wards')) as any;
      if (wardsRes && wardsRes.success && Array.isArray(wardsRes.data)) {
        setWards(wardsRes.data);
      } else if (wardsRes && Array.isArray(wardsRes.data)) {
        setWards(wardsRes.data);
      } else if (Array.isArray(wardsRes)) {
        setWards(wardsRes);
      }
    } catch (e) {
      console.warn('Failed to fetch zones/wards:', e);
    }
  };

  const fetchFormConfig = async () => {
    if (!isConnected) return;
    try {
      const res = (await api.get('/rfid/form-config')) as any;
      if (res && Array.isArray(res)) {
        setFormConfig(res);
      }
    } catch (e) {
      console.warn('Failed to load online form config, using fallback:', e);
    }
  };

  const fetchGps = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setGpsData({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        gps_accuracy: pos.coords.accuracy,
        gps_altitude: pos.coords.altitude,
        gps_heading: pos.coords.heading,
        gps_speed: pos.coords.speed,
        gps_timestamp: new Date(pos.timestamp).toISOString(),
        gps_device_id: Platform.OS + '-' + (Platform.Version || 'unknown'),
      });
    } catch (err) {
      console.warn('Failed to get GPS registration data:', err);
    }
  };

  const handleInputChange = (key: string, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
  };

  const validate = () => {
    if (!selectedZoneId) {
      Alert.alert('Required Field', 'Zone selection is required.');
      return false;
    }
    if (!selectedWardId) {
      Alert.alert('Required Field', 'Ward selection is required.');
      return false;
    }
    for (const field of formConfig) {
      if (field.is_required && !formData[field.field_key]) {
        Alert.alert('Required Field', `${field.label} is required.`);
        return false;
      }
    }
    if (!photoBase64) {
      Alert.alert('Photo Required', 'Please take a registration photo of the property.');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    const chargeVal = parseFloat(formData['monthly_charge']) || 0;
    const chargePaisa = Math.round(chargeVal * 100);

    const registrationPayload = {
      rfid_id,
      property_status: formData['property_status'] || 'RESIDENTIAL',
      property_type: formData['property_type'] || '',
      property_sub_type: formData['property_sub_type'] || '',
      owner_first_name: formData['owner_first_name'] || '',
      owner_middle_name: formData['owner_middle_name'] || '',
      owner_last_name: formData['owner_last_name'] || '',
      mobile_number: formData['mobile_number'] || '',
      email: formData['email'] || '',
      address: formData['address'] || '',
      landmark: formData['landmark'] || '',
      house_no: formData['house_no'] || '',
      floor: formData['floor'] || '',
      num_flats: parseInt(formData['num_flats']) || 1,
      num_floors: parseInt(formData['num_floors']) || 1,
      family_members: parseInt(formData['family_members']) || 0,
      pin_code: formData['pin_code'] || '',
      aadhaar: formData['aadhaar'] || '',
      area: formData['area'] || '',
      colony_name: formData['colony_name'] || '',
      plot_no: formData['plot_no'] || '',
      zone_id: selectedZoneId,
      ward_id: selectedWardId,
      latitude: gpsData?.latitude || null,
      longitude: gpsData?.longitude || null,
      gps_accuracy: gpsData?.gps_accuracy || null,
      gps_altitude: gpsData?.gps_altitude || null,
      gps_heading: gpsData?.gps_heading || null,
      gps_speed: gpsData?.gps_speed || null,
      gps_device_id: gpsData?.gps_device_id || '',
      photo_path: photoBase64, // local base64 will be processed by backend file writer
      monthly_charge_paisa: chargePaisa,
      bin_type: formData['bin_type'] || '',
      waste_category: formData['waste_category'] || '',
      remarks: formData['remarks'] || '',
      form_data: formData, // include everything
    };

    try {
      if (!isConnected) {
        // Offline registration queue
        await rfidLocalStore.addToQueue({
          action_type: 'registration',
          payload: registrationPayload,
        });
        Alert.alert('Saved Offline', 'Property saved locally. It will be uploaded once you reconnect.', [
          { text: 'OK', onPress: () => navigation.popToTop() }
        ]);
        setLoading(false);
        return;
      }

      await api.post('/rfid/register', registrationPayload);
      Alert.alert('Success', 'Property registered successfully!', [
        { text: 'OK', onPress: () => navigation.popToTop() }
      ]);
    } catch (err: any) {
      const apiErr = toApiError(err);
      Alert.alert('Error', apiErr.message || 'Failed to register property');
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return (
      <CameraCapture
        requireFace={false}
        title="Property Photo"
        onCapture={(base64) => {
          setPhotoBase64(base64);
          setShowCamera(false);
        }}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  // Group config by section
  const sections = ['property', 'location', 'contact', 'financial'];
  const sectionLabels: Record<string, string> = {
    property: 'Property Details',
    location: 'Location Details',
    contact: 'Contact Info',
    financial: 'Financial Details',
  };

  return (
    <View style={styles.container}>
      <Header title="Property Registration" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Card style={styles.card}>
          <Text style={styles.rfidBadge}>RFID ID: {rfid_id}</Text>
          {gpsData ? (
            <Text style={styles.gpsLabel}>GPS Locked: {gpsData.latitude.toFixed(5)}, {gpsData.longitude.toFixed(5)} (±{gpsData.gps_accuracy.toFixed(1)}m)</Text>
          ) : (
            <Text style={styles.gpsWarning}>Awaiting GPS Lock...</Text>
          )}
        </Card>

        {sections.map((section: any) => {
          const fields = formConfig.filter(f => f.section === section);
          if (fields.length === 0 && section !== 'location') return null;

          return (
            <Card key={section} style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>{sectionLabels[section] as string}</Text>
              
              {section === 'location' && (
                <>
                  {/* Zone Selector */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>
                      Zone <Text style={{ color: theme.colors.error }}>*</Text>
                    </Text>
                    <SearchableSelect
                      options={zones.map((z: any) => ({
                        value: z.id.toString(),
                        label: z.region_name,
                      }))}
                      value={selectedZoneId ? selectedZoneId.toString() : null}
                      onSelect={(val) => {
                        const zoneId = parseInt(val);
                        setSelectedZoneId(zoneId);
                        setSelectedWardId(null); // Reset ward on zone change
                      }}
                      placeholder="Select Zone..."
                      searchPlaceholder="Search zones..."
                    />
                  </View>

                  {/* Ward Selector */}
                  <View style={styles.fieldContainer}>
                    <Text style={styles.label}>
                      Ward <Text style={{ color: theme.colors.error }}>*</Text>
                    </Text>
                    <SearchableSelect
                      options={wards
                        .filter((w: any) => w.parent_id === selectedZoneId)
                        .map((w: any) => ({
                          value: w.id.toString(),
                          label: w.region_name,
                        }))}
                      value={selectedWardId ? selectedWardId.toString() : null}
                      onSelect={(val) => {
                        const wardId = parseInt(val);
                        setSelectedWardId(wardId);
                      }}
                      placeholder={selectedZoneId ? "Select Ward..." : "Please select Zone first"}
                      searchPlaceholder="Search wards..."
                    />
                  </View>
                </>
              )}

              {fields.map(field => {
                const value = formData[field.field_key] || '';
                return (
                  <View key={field.field_key} style={styles.fieldContainer}>
                    <Text style={styles.label}>
                      {field.label} {field.is_required && <Text style={{ color: theme.colors.error }}>*</Text>}
                    </Text>
                    {field.field_type === 'select' ? (
                      <SearchableSelect
                        options={(field.options || []).map((opt: any) => ({
                          value: opt.value,
                          label: opt.label,
                        }))}
                        value={value ? value.toString() : null}
                        onSelect={(val) => handleInputChange(field.field_key, val)}
                        placeholder={`Select ${field.label}...`}
                        searchPlaceholder={`Search ${field.label}...`}
                      />
                    ) : (
                      <TextInput
                        style={[styles.input, field.field_type === 'textarea' && styles.textarea]}
                        value={value.toString()}
                        onChangeText={(val: string) => handleInputChange(field.field_key, val)}
                        keyboardType={field.field_type === 'number' ? 'numeric' : 'default'}
                        placeholder={field.placeholder || ''}
                        multiline={field.field_type === 'textarea'}
                      />
                    )}
                  </View>
                );
              })}
            </Card>
          );
        })}

        <Card style={styles.photoCard}>
          <Text style={styles.sectionTitle}>Property Photo</Text>
          {photoBase64 ? (
            <Text style={styles.photoStatus}>✓ Photo Captured Successfully</Text>
          ) : (
            <Text style={styles.photoWarning}>No photo captured yet</Text>
          )}
          <View style={{ marginTop: 8 }}>
            <Button
              title={photoBase64 ? "Retake Photo" : "Capture Photo"}
              onPress={() => setShowCamera(true)}
            />
          </View>
        </Card>

        <View style={{ marginTop: 8, marginBottom: 24 }}>
          <Button
            title="Submit Registration"
            loading={loading}
            onPress={handleSubmit}
          />
        </View>
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
  card: {
    padding: 16,
    alignItems: 'center',
    gap: 8,
  },
  rfidBadge: {
    ...theme.typography.heading,
    color: theme.colors.primary,
  },
  gpsLabel: {
    ...theme.typography.caption,
    color: theme.colors.success,
  },
  gpsWarning: {
    ...theme.typography.caption,
    color: theme.colors.warning,
  },
  sectionCard: {
    padding: 16,
    gap: 16,
  },
  sectionTitle: {
    ...theme.typography.heading,
    fontSize: 16,
    color: theme.colors.textDark,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    paddingBottom: 8,
  },
  fieldContainer: {
    gap: 6,
  },
  label: {
    ...theme.typography.secondary,
    fontWeight: '600',
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
  textarea: {
    height: 80,
    textAlignVertical: 'top',
  },
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  pickerTrigger: {
    padding: 12,
    justifyContent: 'center',
  },
  pickerTriggerText: {
    fontSize: 16,
    color: theme.colors.textDark,
  },
  photoCard: {
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  photoStatus: {
    ...theme.typography.secondary,
    color: theme.colors.success,
    fontWeight: '600',
  },
  photoWarning: {
    ...theme.typography.secondary,
    color: theme.colors.error,
  },
  submitBtn: {
    marginTop: 16,
    marginBottom: 32,
  },
});
