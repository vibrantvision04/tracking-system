import React, { useState } from 'react';
import { StyleSheet, Text, View, Alert, ScrollView } from 'react-native';
import { Header } from '../../components/ui/Header';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { theme } from '../../theme/theme';
import { api, toApiError } from '../../services/api';
import { useNetwork } from '../../hooks/useNetwork';
import { rfidLocalStore } from '../../services/rfidLocalStore';
import * as Location from 'expo-location';

export default function RFIDCoverageConfirmScreen({ route, navigation }: any) {
  const { rfid_id, property, offline } = route.params;
  const isConnected = useNetwork();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);

    let location: Location.LocationObject | null = null;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      }
    } catch (locErr) {
      console.warn('Could not read location for coverage confirmation:', locErr);
    }

    const payload = {
      rfid_id,
      latitude: location?.coords.latitude || null,
      longitude: location?.coords.longitude || null,
      accuracy: location?.coords.accuracy || null,
    };

    try {
      if (!isConnected || offline) {
        // Offline Coverage Queue
        await rfidLocalStore.addToQueue({
          action_type: 'coverage',
          payload,
        });

        Alert.alert(
          'Saved Offline',
          'Coverage recorded offline. It will be uploaded automatically once you reconnect.',
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
        setLoading(false);
        return;
      }

      const res = (await api.post('/rfid/coverage', payload)) as any;
      if (res && res.success) {
        setConfirmed(true);
      }
    } catch (err: any) {
      const apiErr = toApiError(err);
      Alert.alert('Error', apiErr.message || 'Failed to record coverage');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Header title="Coverage Confirmation" />
      <ScrollView contentContainerStyle={styles.scroll}>
        {confirmed ? (
          <Card style={styles.successCard}>
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.successTitle}>Coverage Confirmed!</Text>
            <Text style={styles.successText}>Manual RFID scan has been recorded successfully.</Text>
            <View style={{ marginTop: 16 }}>
              <Button title="Back to Home" onPress={() => navigation.popToTop()} />
            </View>
          </Card>
        ) : (
          <>
            <Card style={styles.card}>
              <Text style={styles.title}>Confirm Property Details</Text>
              <Text style={styles.rfidText}>RFID ID: {rfid_id}</Text>
              {property ? (
                <View style={styles.details}>
                  <Text style={styles.owner}>{property.owner_first_name} {property.owner_last_name}</Text>
                  <Text style={styles.address}>{property.address}</Text>
                  <Text style={styles.meta}>Zone: {property.zone_name} | Ward: {property.ward_name}</Text>
                </View>
              ) : (
                <Text style={styles.offlineWarning}>Operating in offline mode. Property details are cached or unavailable.</Text>
              )}
            </Card>

            <View style={{ marginTop: 8 }}>
              <Button
                title="Record Coverage"
                loading={loading}
                onPress={handleConfirm}
              />
            </View>
          </>
        )}
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
    justifyContent: 'center',
  },
  card: {
    padding: 20,
    gap: 12,
  },
  title: {
    ...theme.typography.heading,
    fontSize: 18,
    color: theme.colors.textDark,
  },
  rfidText: {
    ...theme.typography.body,
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  details: {
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 12,
  },
  owner: {
    ...theme.typography.body,
    fontWeight: '600',
    color: theme.colors.textDark,
  },
  address: {
    ...theme.typography.secondary,
    color: theme.colors.textDim,
  },
  meta: {
    ...theme.typography.caption,
    color: theme.colors.textDim,
    marginTop: 4,
  },
  offlineWarning: {
    ...theme.typography.secondary,
    color: theme.colors.warning,
    fontStyle: 'italic',
  },
  confirmBtn: {
    marginTop: 8,
  },
  successCard: {
    padding: 30,
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.colors.primaryLight,
    borderColor: theme.colors.primary,
  },
  successIcon: {
    fontSize: 48,
    color: theme.colors.success,
    fontWeight: 'bold',
  },
  successTitle: {
    ...theme.typography.heading,
    color: theme.colors.success,
  },
  successText: {
    ...theme.typography.body,
    color: theme.colors.textDark,
    textAlign: 'center',
  },
});
