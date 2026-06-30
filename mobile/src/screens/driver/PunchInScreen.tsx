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
import CameraCapture, { CaptureMeta } from '../../components/CameraCapture';
import { api } from '../../services/api';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/ui/LanguageToggle';

export type Step = 'gps' | 'camera' | 'confirm' | 'success';

export interface StepIndicatorProps {
  currentStep: Step;
  t: (key: string) => string;
}

export function StepIndicator({ currentStep, t }: StepIndicatorProps) {
  const steps: { key: Step; label: string }[] = [
    { key: 'gps', label: t('punch.step.gps') },
    { key: 'camera', label: t('punch.step.camera') },
    { key: 'confirm', label: t('punch.step.confirm') },
  ];

  const stepOrder: Step[] = ['gps', 'camera', 'confirm'];
  const rawIndex = stepOrder.indexOf(currentStep);
  // When currentStep is 'success', it's past all steps — treat as index 3
  const currentIndex = rawIndex === -1 ? stepOrder.length : rawIndex;

  return (
    <View style={stepStyles.container} accessibilityRole="progressbar">
      {steps.map((step, index) => {
        const isCompleted = index < currentIndex;
        const isActive = index === currentIndex;
        const isUpcoming = index > currentIndex;

        return (
          <View key={step.key} style={stepStyles.stepWrapper}>
            <View style={stepStyles.stepRow}>
              {/* Connector line before (except first) */}
              {index > 0 && (
                <View
                  style={[
                    stepStyles.connector,
                    isCompleted || isActive
                      ? stepStyles.connectorCompleted
                      : stepStyles.connectorUpcoming,
                  ]}
                />
              )}

              {/* Step circle */}
              <View
                style={[
                  stepStyles.circle,
                  isCompleted && stepStyles.circleCompleted,
                  isActive && stepStyles.circleActive,
                  isUpcoming && stepStyles.circleUpcoming,
                ]}
                accessibilityLabel={
                  isCompleted
                    ? `${step.label} completed`
                    : isActive
                    ? `${step.label} in progress`
                    : `${step.label} upcoming`
                }
              >
                {isCompleted ? (
                  <Text style={stepStyles.checkmark}>✓</Text>
                ) : (
                  <Text
                    style={[
                      stepStyles.stepNumber,
                      isActive && stepStyles.stepNumberActive,
                      isUpcoming && stepStyles.stepNumberUpcoming,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>

              {/* Connector line after (except last) */}
              {index < steps.length - 1 && (
                <View
                  style={[
                    stepStyles.connector,
                    isCompleted
                      ? stepStyles.connectorCompleted
                      : stepStyles.connectorUpcoming,
                  ]}
                />
              )}
            </View>

            {/* Label */}
            <Text
              style={[
                stepStyles.label,
                isCompleted && stepStyles.labelCompleted,
                isActive && stepStyles.labelActive,
                isUpcoming && stepStyles.labelUpcoming,
              ]}
              numberOfLines={2}
            >
              {step.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const stepStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.base,
    paddingHorizontal: theme.spacing.sm,
  },
  stepWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  connector: {
    flex: 1,
    height: 2,
  },
  connectorCompleted: {
    backgroundColor: theme.colors.primary,
  },
  connectorUpcoming: {
    backgroundColor: theme.colors.border,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleCompleted: {
    backgroundColor: theme.colors.primary,
  },
  circleActive: {
    backgroundColor: theme.colors.primary,
  },
  circleUpcoming: {
    backgroundColor: theme.colors.background,
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  checkmark: {
    color: theme.colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: '600',
  },
  stepNumberActive: {
    color: theme.colors.surface,
  },
  stepNumberUpcoming: {
    color: theme.colors.textDim,
  },
  label: {
    fontSize: theme.typography.caption.fontSize,
    lineHeight: theme.typography.caption.lineHeight,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    paddingHorizontal: 2,
  },
  labelCompleted: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  labelActive: {
    color: theme.colors.primary,
    fontWeight: '600',
  },
  labelUpcoming: {
    color: theme.colors.textDim,
  },
});

export default function PunchInScreen({ navigation }: any) {
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();
  const { refetch: refetchPunch } = usePunchStatus();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('gps');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [driverName, setDriverName] = useState('');
  const [helperName, setHelperName] = useState('');
  const [vehicleNo, setVehicleNo] = useState('RJ47GA7244');
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
        navigation.navigate('DriverHome');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [step, navigation]);

  // GPS verification
  const handleGPSVerify = async () => {
    setGpsError(null);
    setGpsVerifying(true);

    const currentCoords = await getCurrentLocation();

    if (!currentCoords) {
      setGpsError(t('punch.gpsPermissionError'));
      setGpsVerifying(false);
      return;
    }

    setCoords(currentCoords);

    // Simulate ward boundary check (in real app, this would be validated by backend)
    // For now, assume GPS is valid — if the backend returns ward mismatch, handle below
    try {
      const res = await api.post('/attendance/verify-gps', {
        gps_lat: currentCoords.latitude,
        gps_lng: currentCoords.longitude,
      }) as any;

      if (res && res.valid) {
        setGpsVerifying(false);
        // Request camera permission and advance
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
      // If endpoint doesn't exist, proceed (backward compat with existing flow)
      setGpsVerifying(false);
      const cameraGranted = await requestPermission();
      if (cameraGranted) {
        setStep('camera');
      } else {
        setGpsError(t('punch.gpsPermissionError'));
      }
    }
  };

  // Camera photo captured
  const handlePhotoCaptured = async (base64: string, meta?: CaptureMeta) => {
    setShowCamera(false);
    setPhotoBase64(base64);
    setPhotoError(null);
    setLoading(true);

    const deviceFaceCount = meta?.faceCount;

    try {
      const res = await api.post('/attendance/validate-photo', {
        photo_base64: base64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        // Face presence/count is validated on-device (ML Kit); tell the backend to
        // skip its own (unreliable) face detection and trust the device count.
        skip_face_detection: true,
        ...(typeof deviceFaceCount === 'number' ? { face_count: deviceFaceCount } : {}),
      }) as any;

      if (res && res.valid) {
        // Prefer the on-device face count for helper detection (2 = driver + helper).
        if (typeof deviceFaceCount === 'number' && deviceFaceCount > 0) {
          setFaceCount(deviceFaceCount);
        } else {
          setFaceCount(res.face_count || 1);
        }
        setStep('confirm');
      } else {
        const issues: string[] = res?.issues || [];
        if (issues.length > 0) {
          setPhotoError(issues.join('\n'));
        } else {
          setPhotoError('Photo validation failed. Please try again.');
        }
      }
    } catch (err: any) {
      setFaceCount(typeof deviceFaceCount === 'number' && deviceFaceCount > 0 ? deviceFaceCount : 1);
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  // Final submission
  const handleSubmit = async () => {
    setSubmissionError(null);
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
        vehicle_id: '1',
      });

      await refetchPunch();
      setStep('success');
    } catch (err: any) {
      setSubmissionError(t('punch.submissionError'));
    } finally {
      setLoading(false);
    }
  };

  // When in camera mode, show the CameraCapture full screen
  if (showCamera) {
    return (
      <CameraCapture
        facing="front"
        title={t('punch.cameraInstruction')}
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
      <Header
        title={t('punch.title')}
        showBack={true}
        onBack={() => navigation.goBack()}
      />

      {/* Language Toggle below header */}
      <View style={styles.languageToggleRow}>
        <LanguageToggle compact />
      </View>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} t={t} />

      {/* Scrollable content */}
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
                label={t('punch.step.confirm') + ' - Driver Name'}
                value={driverName}
                onChangeText={setDriverName}
                placeholder="Enter driver name"
              />
            </View>

            {faceCount === 2 && (
              <View style={styles.formGroup}>
                <Input
                  label="Helper Name"
                  value={helperName}
                  onChangeText={setHelperName}
                  placeholder="Enter helper name"
                />
              </View>
            )}

            <View style={styles.formGroup}>
              <Text style={styles.readOnlyLabel}>Vehicle</Text>
              <View style={styles.readOnlyField}>
                <Text style={styles.readOnlyText}>{vehicleNo}</Text>
              </View>
            </View>

            {submissionError && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{submissionError}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom action area */}
      <View style={styles.bottomAction}>
        {step === 'gps' && !gpsVerifying && !loadingGPS && (
          <Button
            title={t('punch.step.gps')}
            onPress={handleGPSVerify}
            variant="primary"
            disabled={!!gpsError && gpsError === t('punch.gpsError')}
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
  readOnlyLabel: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: theme.typography.secondary.fontWeight,
    color: theme.colors.textDim,
    marginBottom: theme.spacing.xs,
  },
  readOnlyField: {
    height: theme.sizes.inputHeight,
    borderRadius: theme.borderRadius.input,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing.base,
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  readOnlyText: {
    fontSize: theme.typography.body.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
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
