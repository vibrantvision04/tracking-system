import React, { useState } from 'react';
import { StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { api } from '../../services/api';
import { useGPS } from '../../hooks/useGPS';
import CameraCapture from '../../components/CameraCapture';
import { theme } from '../../theme/theme';
import { useTranslation } from '../../i18n/useTranslation';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';

export default function SweeperBeforeImageScreen({ navigation }: any) {
  const { getCurrentLocation } = useGPS();
  const { t } = useTranslation();
  const [showCamera, setShowCamera] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handlePhoto = async (base64: string) => {
    setShowCamera(false);
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const coords = await getCurrentLocation();
      await api.post('/sweeping/before-image', {
        photo_base64: base64,
        gps_lat: coords?.latitude || 0,
        gps_lng: coords?.longitude || 0,
      });
      setMessage(t('sweeping.beforeSubmitted'));
    } catch (e: any) {
      setError(e.message || t('sweeping.imageError'));
    } finally {
      setLoading(false);
    }
  };

  if (showCamera) {
    return <CameraCapture facing="back" title={t('sweeping.beforeInstruction')} onCapture={handlePhoto} onCancel={() => setShowCamera(false)} />;
  }

  return (
    <View style={styles.container}>
      <Header title={t('menu.beforeImage')} showBack={true} onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={styles.instruction}>{t('sweeping.beforeInstruction')}</Text>
        {message && <View style={styles.success}><Text style={styles.successText}>{message}</Text></View>}
        {error && <View style={styles.errorContainer}><Text style={styles.errorText}>{error}</Text></View>}
        {loading && <ActivityIndicator size="large" color={theme.colors.primary} />}
        <Button title={t('sweeping.captureBefore')} onPress={() => setShowCamera(true)} variant="primary" disabled={loading} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { flex: 1, padding: theme.spacing.base, paddingTop: theme.sizes.headerHeight + theme.spacing.base, alignItems: 'center' },
  instruction: { fontSize: theme.typography.body.fontSize, textAlign: 'center', marginBottom: theme.spacing.xl, color: theme.colors.textDark, lineHeight: 22 },
  success: { backgroundColor: theme.colors.primaryLight, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, width: '100%', marginBottom: theme.spacing.base },
  successText: { color: theme.colors.success, textAlign: 'center', fontWeight: '600' },
  errorContainer: { backgroundColor: theme.colors.errorLight, borderRadius: theme.borderRadius.card, padding: theme.spacing.base, width: '100%', marginBottom: theme.spacing.base },
  errorText: { color: theme.colors.error, textAlign: 'center' },
});
