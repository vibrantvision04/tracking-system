import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { useAuth } from '../../context/AuthContext';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/ui/LanguageToggle';
import { StepIndicator, Step } from '../driver/PunchInScreen';

export default function ZoneManagerPunchInScreen({ navigation }: any) {
  const { user } = useAuth();
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();
  const { refetch: refetchPunch } = usePunchStatus();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('gps');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [managerName, setManagerName] = useState(user?.name || '');
  const [loading, setLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [gpsVerifying, setGpsVerifying] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  // Auto-navigate home after success
  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => {
        navigation.navigate('ZoneManagerHome');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, navigation]);

  const handleGPSVerify = async () => {
    setGpsError(null);
    setGpsVerifying(true);

    const currentCoords = await getCurrentLocation();

    if (!currentCoords) {
      // Zone managers can proceed even with GPS issues, but we log coordinates for auditing
      setCoords({ latitude: 0, longitude: 0 });
      setGpsVerifying(false);
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        setGpsError(t('punch.gpsPermissionError'));
      }
      return;
    }

    setCoords(currentCoords);

    try {
      const res = await api.post('/attendance/verify-gps', {
        gps_lat: currentCoords.latitude,
        gps_lng: currentCoords.longitude,
      }) as any;

      if (res && res.valid) {
        setGpsVerifying(false);
        const cameraGranted = await requestPermission();
        if (cameraGranted) {
          setStep('camera');
        } else {
          setGpsError(t('punch.gpsPermissionError'));
        }
      } else if (res && !res.valid) {
        const wardName = res.ward_name || 'Unknown';
        setGpsError(t('punch.gpsError').replace('{ward}', wardName));
        setGpsVerifying(false);
      }
    } catch (err: any) {
      // If endpoint doesn't exist, proceed (backward compat)
      setGpsVerifying(false);
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        setGpsError(t('punch.gpsPermissionError'));
      }
    }
  };

  const handlePhotoCaptured = async (base64: string) => {
    setShowCamera(false);
    setPhotoBase64(base64);
    setPhotoError(null);
    setLoading(true);

    try {
      const res = await api.post('/attendance/validate-photo', {
        photo_base64: base64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
      }) as any;

      if (res && res.valid) {
        setStep('confirm');
      } else {
        const issues: string[] = res?.issues || [];
        if (issues.length > 0) {
          setPhotoError(issues.join('\n'));
        } else {
          setPhotoError(t('punch.photoError.generic'));
        }
      }
    } catch (err: any) {
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!managerName.trim()) {
      setSubmissionError(t('login.fieldRequired'));
      return;
    }

    setSubmissionError(null);
    setLoading(true);

    try {
      await api.post('/attendance/punch-in', {
        driver_name: managerName,
        photo_base64: photoBase64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        face_count: 1,
        vehicle_id: '0',
      });

      await refetchPunch();
      setStep('success');
    } catch (err: any) {
      setSubmissionError(t('punch.submissionError'));
    } finally {
      setLoading(false);
    }
  };

  // When in camera mode, show CameraCapture full screen
  if (showCamera) {
    return (
      <CameraCapture
        facing="front"
        title={t('punch.cameraInstruction')}
        requireFace={true}
        onCapture={handlePhotoCaptured}
        onCancel={() => setShowCamera(false)}
      />
    );
  }

  // Success state
  if (step === 'success') {
    return (
      <View style={styles.screenContainer}>
        <Header
          title={t('punch.title')}
          showBack={false}
        />
        <View style={styles.successContainer}>
          <View style={styles.successCheckmarkCircle}>
            <Text style={styles.successCheckmark}>✓</Text>
          </View>
          <Text style={styles.successTitle}>{t('punch.success')}</Text>
          <Text style={styles.successSubtitle}>{t('punch.successSubtitle')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      {/* Fixed 56px header with back navigation */}
      <Header
        title={t('punch.title')}
        showBack={true}
        onBack={() => navigation.goBack()}
      />

      {/* Language toggle below header */}
      <View style={styles.languageToggleRow}>
        <LanguageToggle compact />
      </View>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} t={t} />

      {/* Scrollable content area with base background and 16px padding */}
      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentInner}
        keyboardShouldPersistTaps="handled"
      >
        {/* GPS Step */}
        {step === 'gps' && (
          <View style={styles.stepContent}>
            {gpsVerifying || loadingGPS ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary}
                  style={styles.loadingIndicator}
                />
                <Text style={styles.loadingText}>{t('punch.gpsLoading')}</Text>
              </View>
            ) : (
              <View style={styles.stepContent}>
                <Text style={styles.stepDescription}>
                  {t('punch.step.gps')}
                </Text>

                {gpsError && (
                  <View style={styles.errorContainer}>
                    <Text style={styles.errorText}>{gpsError}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* Camera Step */}
        {step === 'camera' && (
          <View style={styles.stepContent}>
            <Text style={styles.stepInstruction}>
              {t('punch.cameraInstruction')}
            </Text>

            {loading && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  size="large"
                  color={theme.colors.primary}
                  style={styles.loadingIndicator}
                />
                <Text style={styles.loadingText}>{t('common.loading')}</Text>
              </View>
            )}

            {photoError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{photoError}</Text>
              </View>
            )}
          </View>
        )}

        {/* Confirmation Step */}
        {step === 'confirm' && (
          <View style={styles.stepContent}>
            <View style={styles.formGroup}>
              <Input
                label={t('punch.managerName')}
                value={managerName}
                onChangeText={(text) => {
                  setManagerName(text);
                  setSubmissionError(null);
                }}
                placeholder={t('punch.managerName.placeholder')}
                error={submissionError ?? undefined}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom-anchored action area with 16px padding */}
      <View style={styles.bottomAction}>
        {step === 'gps' && !gpsVerifying && !loadingGPS && (
          <Button
            title={t('punch.step.gps')}
            onPress={handleGPSVerify}
            variant="primary"
          />
        )}

        {step === 'gps' && gpsError && (
          <View style={styles.retryButtonContainer}>
            <Button
              title={t('common.retry')}
              onPress={() => {
                setGpsError(null);
                handleGPSVerify();
              }}
              variant="primary"
            />
          </View>
        )}

        {step === 'camera' && !loading && (
          <Button
            title={photoError ? t('punch.retakePhoto') : t('punch.capturePhoto')}
            onPress={() => setShowCamera(true)}
            variant="primary"
          />
        )}

        {step === 'confirm' && (
          <Button
            title={t('punch.confirm')}
            onPress={handleSubmit}
            variant="primary"
            loading={loading}
            disabled={loading}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingTop: theme.sizes.headerHeight,
  },
  languageToggleRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: theme.spacing.base,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentInner: {
    padding: theme.spacing.base,
    paddingBottom: theme.spacing.xxl,
  },
  stepContent: {
    alignItems: 'center',
    width: '100%',
  },
  stepDescription: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: theme.typography.body.fontWeight,
    lineHeight: theme.typography.body.lineHeight,
    color: theme.colors.textDark,
    textAlign: 'center',
    marginBottom: theme.spacing.base,
  },
  stepInstruction: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    lineHeight: theme.typography.body.lineHeight,
    color: theme.colors.textDark,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  loadingIndicator: {
    marginBottom: theme.spacing.base,
  },
  loadingText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: theme.colors.errorLight,
    borderRadius: theme.borderRadius.card,
    padding: theme.spacing.base,
    width: '100%',
    marginTop: theme.spacing.base,
  },
  errorText: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.error,
    textAlign: 'center',
    lineHeight: theme.typography.body.lineHeight,
  },
  formGroup: {
    width: '100%',
    marginBottom: theme.spacing.base,
  },
  bottomAction: {
    padding: theme.spacing.base,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  retryButtonContainer: {
    marginTop: theme.spacing.sm,
  },
  successContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.xxl,
  },
  successCheckmarkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
  },
  successCheckmark: {
    fontSize: 40,
    color: theme.colors.surface,
    fontWeight: '600',
  },
  successTitle: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: theme.typography.heading.fontWeight,
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  successSubtitle: {
    fontSize: theme.typography.body.fontSize,
    color: theme.colors.textDim,
    textAlign: 'center',
    lineHeight: theme.typography.body.lineHeight,
  },
});
