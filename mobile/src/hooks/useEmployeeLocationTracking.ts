import { useEffect, useRef } from 'react';
import { Alert, Vibration } from 'react-native';
import * as Location from 'expo-location';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const INTERVAL_MS = 8000;
const GPS_CHECK_INTERVAL_MS = 5000;

export function useEmployeeLocationTracking(enabled = true) {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const gpsWasEnabledRef = useRef(true);
  const gpsAlertShownRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user) return;

    let stopped = false;

    const sendLocation = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        if (stopped) return;

        await api.post('/location', {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch {
      }
    };

    const checkGpsStatus = async () => {
      try {
        const enabled = await Location.hasServicesEnabledAsync();
        if (enabled) {
          gpsWasEnabledRef.current = true;
          if (gpsAlertShownRef.current) {
            gpsAlertShownRef.current = false;
            Vibration.cancel();
          }
        } else if (gpsWasEnabledRef.current) {
          gpsWasEnabledRef.current = false;
          gpsAlertShownRef.current = true;
          Vibration.vibrate([1000, 500, 1000, 500], true);
          Alert.alert(
            'GPS Disabled!',
            'Location services have been turned off. Please enable GPS for employee tracking.',
            [{ text: 'OK' }]
          );
        } else if (!gpsAlertShownRef.current) {
          gpsAlertShownRef.current = true;
          Vibration.vibrate([1000, 500, 1000, 500], true);
          Alert.alert(
            'GPS Disabled!',
            'Location services have been turned off. Please enable GPS for employee tracking.',
            [{ text: 'OK' }]
          );
        }
      } catch {
      }
    };

    sendLocation();

    intervalRef.current = setInterval(sendLocation, INTERVAL_MS);
    gpsIntervalRef.current = setInterval(checkGpsStatus, GPS_CHECK_INTERVAL_MS);

    return () => {
      stopped = true;
      Vibration.cancel();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (gpsIntervalRef.current) {
        clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = null;
      }
    };
  }, [enabled, user]);
}
