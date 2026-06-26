import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  Image, Alert, FlatList, TextInput
} from 'react-native';
import Constants from 'expo-constants';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { getHaversineDistance } from '../../utils/gpsValidator';
import { OpenDepot } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { useGPS } from '../../hooks/useGPS';

type Step = 'camera' | 'select_depot' | 'submit' | 'success';

interface DepotOption {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

export default function SubmitPhotoScreen({ navigation }: any) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const { getCurrentLocation } = useGPS();

  const [step, setStep] = useState<Step>('camera');
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [depots, setDepots] = useState<DepotOption[]>([]);
  const [loadingDepots, setLoadingDepots] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [selectedDepot, setSelectedDepot] = useState<DepotOption | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  const [locationValidated, setLocationValidated] = useState(false);
  const [distance, setDistance] = useState<number | null>(null);
  const [locationWarning, setLocationWarning] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const appVersion = Constants?.manifest?.version || Constants?.expoConfig?.version || '';
  const deviceId = Constants?.deviceId || Constants?.sessionId || '';

  const loadDepots = useCallback(async () => {
    setLoadingDepots(true);
    try {
      const res = await api.get('/open-depot/depots') as { depots: OpenDepot[] };
      if (res && res.depots) {
        setDepots(res.depots.map(d => ({
          id: d.id,
          name: d.name,
          latitude: d.latitude,
          longitude: d.longitude,
          radius: d.radius,
        })));
      }
    } catch {
      Alert.alert(t('common.error'), 'Failed to load depots');
    } finally {
      setLoadingDepots(false);
    }
  }, [t]);

  useEffect(() => {
    if (step === 'select_depot') {
      loadDepots();
    }
  }, [step, loadDepots]);

  const handlePhotoCaptured = (base64: string) => {
    setPhotoBase64(base64);
    setStep('select_depot');
  };

  const filteredDepots = depots.filter(d =>
    d.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const handleSelectDepot = async (depot: DepotOption) => {
    setSelectedDepot(depot);
    setShowDropdown(false);
    setSearchText(depot.name);

    // Get GPS location for validation
    let currentCoords = await getCurrentLocation();
    if (!currentCoords) {
      currentCoords = { latitude: 0, longitude: 0 };
    }
    setCoords(currentCoords);

    const dist = getHaversineDistance(
      { latitude: currentCoords.latitude, longitude: currentCoords.longitude },
      { latitude: depot.latitude, longitude: depot.longitude }
    );
    setDistance(dist);

    const allowedRadius = depot.radius || 50;
    const inside = dist <= allowedRadius;
    setLocationValidated(inside);

    if (inside) {
      setLocationWarning(null);
    } else {
      setLocationWarning(
        `You appear to be outside the selected Open Depot area (${dist.toFixed(0)}m away, allowed ${allowedRadius}m). Please capture the photo from inside the depot if possible.`
      );
    }
  };

  const handleSubmit = async () => {
    if (!photoBase64 || !selectedDepot || !coords) return;
    setSubmitting(true);
    try {
      await api.post('/open-depot', {
        depot_id: selectedDepot.id.toString(),
        photo_base64: photoBase64,
        gps_lat: coords.latitude,
        gps_lng: coords.longitude,
        location_validated: locationValidated,
        device_id: deviceId,
        app_version: appVersion,
      });
      setStep('success');
    } catch (err: any) {
      Alert.alert(
        t('common.error'),
        err?.error || err?.message || 'Failed to submit. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = () => {
    setPhotoBase64(null);
    setSelectedDepot(null);
    setCoords(null);
    setLocationValidated(false);
    setDistance(null);
    setLocationWarning(null);
    setSearchText('');
    setStep('camera');
  };

  if (step === 'camera') {
    return (
      <CameraCapture
        facing="back"
        title="Open Depot Photo"
        onCapture={handlePhotoCaptured}
        onCancel={() => navigation?.goBack()}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Open Depot Worker</Text>
        <Text style={styles.headerSubtitle}>{user?.name || ''}</Text>
      </View>

      <View style={styles.content}>
        {step === 'select_depot' && photoBase64 && (
          <>
            <Image
              source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
              style={styles.previewThumb}
            />

            <Text style={styles.stepTitle}>Select Open Depot</Text>

            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search depot by name..."
                placeholderTextColor={theme.colors.textDim}
                value={searchText}
                onChangeText={(text) => {
                  setSearchText(text);
                  setShowDropdown(true);
                  if (selectedDepot) setSelectedDepot(null);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && searchText.length > 0 && (
                <View style={styles.dropdown}>
                  {loadingDepots ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} style={{ padding: 16 }} />
                  ) : filteredDepots.length === 0 ? (
                    <Text style={styles.dropdownEmpty}>No depots found</Text>
                  ) : (
                    <FlatList
                      data={filteredDepots.slice(0, 8)}
                      keyExtractor={(item) => item.id.toString()}
                      renderItem={({ item }) => (
                        <TouchableOpacity
                          style={styles.dropdownItem}
                          onPress={() => handleSelectDepot(item)}
                        >
                          <Text style={styles.dropdownItemText}>{item.name}</Text>
                        </TouchableOpacity>
                      )}
                      keyboardShouldPersistTaps="handled"
                    />
                  )}
                </View>
              )}
            </View>

            {selectedDepot && coords && (
              <View style={styles.validationSection}>
                <View style={styles.statusRow}>
                  <Text style={styles.statusLabel}>Location:</Text>
                  <View style={[
                    styles.statusBadge,
                    { backgroundColor: locationValidated ? theme.colors.primaryLight : theme.colors.warningLight }
                  ]}>
                    <Text style={[
                      styles.statusText,
                      { color: locationValidated ? theme.colors.success : theme.colors.warning }
                    ]}>
                      {locationValidated ? 'Location Verified' : 'Outside Open Depot Area'}
                    </Text>
                  </View>
                </View>

                {locationWarning && (
                  <View style={styles.warningBox}>
                    <Text style={styles.warningText}>{locationWarning}</Text>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.retakeLink}
                  onPress={handleRetake}
                >
                  <Text style={styles.retakeLinkText}>Retake Photo</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting || !selectedDepot}
                >
                  {submitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitButtonText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {!selectedDepot && (
              <TouchableOpacity
                style={styles.retakeLink}
                onPress={handleRetake}
              >
                <Text style={styles.retakeLinkText}>Retake Photo</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {step === 'success' && (
          <View style={styles.successContainer}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Submission Successful!</Text>
            <Text style={styles.successSubtitle}>
              Your open depot photo has been submitted for review.
            </Text>
            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleRetake}
            >
              <Text style={styles.submitButtonText}>Submit Another</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.spacing.base,
    paddingTop: 56,
    paddingBottom: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textDim,
    marginTop: 2,
  },
  content: {
    flex: 1,
    padding: theme.spacing.base,
  },
  previewThumb: {
    width: '100%',
    height: 200,
    borderRadius: theme.borderRadius.card,
    marginBottom: theme.spacing.base,
    resizeMode: 'cover',
  },
  stepTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.sm,
  },
  searchContainer: {
    zIndex: 10,
  },
  searchInput: {
    height: theme.sizes.inputHeight,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.input,
    paddingHorizontal: theme.spacing.base,
    fontSize: 16,
    color: theme.colors.textDark,
    backgroundColor: theme.colors.surface,
  },
  dropdown: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.card,
    maxHeight: 280,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 999,
  },
  dropdownEmpty: {
    padding: 16,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  dropdownItem: {
    paddingHorizontal: theme.spacing.base,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: 15,
    color: theme.colors.textDark,
  },
  validationSection: {
    marginTop: theme.spacing.base,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  statusLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textDark,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  warningBox: {
    backgroundColor: theme.colors.warningLight,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.base,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    lineHeight: 20,
  },
  retakeLink: {
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  retakeLinkText: {
    fontSize: 15,
    color: theme.colors.primary,
    fontWeight: '500',
  },
  submitButton: {
    height: theme.sizes.buttonHeight,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.button,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  successIcon: {
    fontSize: 64,
    color: theme.colors.success,
    marginBottom: theme.spacing.base,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.textDark,
    marginBottom: theme.spacing.sm,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: theme.colors.textDim,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 20,
  },
});
