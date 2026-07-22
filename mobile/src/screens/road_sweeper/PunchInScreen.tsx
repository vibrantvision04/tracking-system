import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, ActivityIndicator, ScrollView } from 'react-native';
import { useGPS } from '../../hooks/useGPS';
import { useCamera } from '../../hooks/useCamera';
import CameraCapture from '../../components/CameraCapture';
import { api } from '../../services/api';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { LanguageToggle } from '../../components/ui/LanguageToggle';

type Step = 'gps' | 'camera' | 'confirm' | 'success';

export default function SweeperPunchInScreen({ navigation }: any) {
  const { getCurrentLocation, loading: loadingGPS } = useGPS();
  const { requestPermission } = useCamera();
  const { refetch: refetchPunch } = usePunchStatus();
  const { t } = useTranslation();

  const [step, setStep] = useState<Step>('gps');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [faceCount, setFaceCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [gpsVerifying, setGpsVerifying] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  useEffect(() => {
    if (step === 'success') {
      const timer = setTimeout(() => navigation.navigate('SweeperHome'), 3000);
      return () => clearTimeout(timer);
    }
  }, [step, navigation]);

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
    try {
      const res = await api.post('/attendance/verify-gps', {
        gps_lat: currentCoords.latitude,
        gps_lng: currentCoords.longitude,
      }) as any;
      if (res && res.valid) {
        setGpsVerifying(false);
        const cameraGranted = await requestPermission();
        if (cameraGranted) setStep('camera');
        else setGpsError(t('punch.gpsPermissionError'));
      } else if (res && !res.valid) {
        setGpsError(t('punch.gpsError').replace('{ward}', res.ward_name || 'Unknown'));
        setGpsVerifying(false);
      }
    } catch {
      setGpsVerifying(false);
      const cameraGranted = await requestPermission();
      if (cameraGranted) setStep('camera');
      else setGpsError(t('punch.gpsPermissionError'));
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
        skip_face_detection: true,
      }) as any;
      if (res && res.valid) {
        setFaceCount(res.face_count || 1);
        setStep('confirm');
      } else {
        setPhotoError(res?.issues?.join('\n') || 'Photo validation failed');
      }
    } catch {
      setStep('confirm');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmissionError(null);
    setLoading(true);
    try {
      await api.post('/attendance/punch-in', {
        photo_base64: photoBase64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
        face_count: faceCount,
      });
      await refetchPunch();
      setStep('success');
    } catch {
      setSubmissionError(t('punch.submissionError'));
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return <CameraCapture facing="front" title={t('punch.cameraInstruction')} requireFace={true} onCapture={handlePhotoCaptured} onCancel={() => setShowCamera(false)} />;
  }

  if (step === 'success') {
    return (
      <View style={styles.screenContainer}>
        <Header title={t('punch.title')} showBack={false} />
        <View style={styles.successContainer}>
          <View style={styles.successCheckmarkCircle}><Text style={styles.successCheckmark}>✓</Text></View>
          <Text style={styles.successTitle}>{t('punch.success')}</Text>
          <Text style={styles.successSubtitle}>{t('punch.successSubtitle')}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screenContainer}>
      <Header title={t('punch.title')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.languageToggleRow}><LanguageToggle compact /></View>
      <ScrollView style={styles.scrollContent} contentContainerStyle={styles.scrollContentInner}>
        {step === 'gps' && (
          <View style={styles.stepContent}>
            {gpsVerifying || loadingGPS ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>{t('punch.gpsLoading')}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.stepDescription}>{t('punch.step.gps')}</Text>
                {gpsError && <View style={styles.errorContainer}><Text style={styles.errorText}>{gpsError}</Text></View>}
              </>
            )}
          </View>
        )}
        {step === 'camera' && (
          <View style={styles.stepContent}>
            <Text style={styles.stepInstruction}>{t('punch.cameraInstruction')}</Text>
            {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
            {photoError && <View style={styles.errorContainer}><Text style={styles.errorText}>{photoError}</Text></View>}
          </View>
        )}
        {step === 'confirm' && (
          <View style={styles.stepContent}>
            <Text style={styles.stepDescription}>{t('punch.confirm')}</Text>
            {submissionError && <View style={styles.errorContainer}><Text style={styles.errorText}>{submissionError}</Text></View>}
          </View>
        )}
      </ScrollView>
      <View style={styles.bottomAction}>
        {step === 'gps' && !gpsVerifying && !loadingGPS && (
          <Button title={t('punch.step.gps')} onPress={handleGPSVerify} variant="primary" />
        )}
        {step === 'gps' && gpsError && (
          <View style={styles.retryButtonContainer}>
            <Button title={t('common.retry')} onPress={() => { setGpsError(null); handleGPSVerify(); }} variant="primary" />
          </View>
        )}
        {step === 'camera' && !loading && (
          <Button title={photoError ? t('punch.retakePhoto') : t('punch.capturePhoto')} onPress={() => setShowCamera(true)} variant="primary" />
        )}
        {step === 'confirm' && (
          <Button title={t('punch.confirm')} onPress={handleSubmit} variant="primary" loading={loading} disabled={loading} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: { flex: 1, backgroundColor: theme.colors.background, paddingTop: theme.sizes.headerHeight },
  languageToggleRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: theme.spacing.base, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs },
  scrollContent: { flex: 1 },
  scrollContentInner: { padding: theme.spacing.base, paddingBottom: theme.spacing.xxl },
  stepContent: { alignItems: 'center', width: '100%' },
  stepDescription: { fontSize: theme.typography.body.fontSize, fontWeight: theme.typography.body.fontWeight, lineHeight: theme.typography.body.lineHeight, color: theme.colors.textDark, textAlign: 'center', marginBottom: theme.spacing.base },
  stepInstruction: { fontSize: theme.typography.body.fontSize, fontWeight: '600', lineHeight: theme.typography.body.lineHeight, color: theme.colors.textDark, textAlign: 'center', marginBottom: theme.spacing.lg },
  loadingContainer: { alignItems: 'center', paddingVertical: theme.spacing.xxl },
  loadingText: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDim, textAlign: 'center', marginTop: theme.spacing.base },
  errorContainer: { backgroundColor: theme.colors.errorLight, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, width: '100%', marginTop: theme.spacing.base },
  errorText: { fontSize: theme.typography.body.fontSize, color: theme.colors.error, textAlign: 'center', lineHeight: theme.typography.body.lineHeight },
  bottomAction: { padding: theme.spacing.base, backgroundColor: theme.colors.background, borderTopWidth: 1, borderTopColor: theme.colors.border },
  retryButtonContainer: { marginTop: theme.spacing.sm },
  successContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.xxl },
  successCheckmarkCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: theme.colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: theme.spacing.xl },
  successCheckmark: { fontSize: 40, color: theme.colors.surface, fontWeight: '600' },
  successTitle: { fontSize: theme.typography.heading.fontSize, fontWeight: theme.typography.heading.fontWeight, color: theme.colors.primary, textAlign: 'center', marginBottom: theme.spacing.sm },
  successSubtitle: { fontSize: theme.typography.body.fontSize, color: theme.colors.textDim, textAlign: 'center', lineHeight: theme.typography.body.lineHeight },
});
