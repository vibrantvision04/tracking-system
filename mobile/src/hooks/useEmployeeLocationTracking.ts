import { useEffect, useRef, useState } from 'react';
import { Alert, Vibration, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import NetInfo from '@react-native-community/netinfo';
import { AudioPlayer } from 'expo-audio';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';

const LOCATION_TASK_NAME = 'background-location-task';
const TRACKING_INTERVAL_MS = 5000; // 5 seconds tracking interval

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldVibrate: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldSetBadge: false,
  }),
});

// Register background task at the global scope
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location error:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    if (locations && locations.length > 0) {
      const loc = locations[0];
      try {
        await api.post('/location', {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
        });
      } catch (err) {
        // Silent catch for background failures to prevent app crash
      }
    }
  }
});

export function useEmployeeLocationTracking(enabled = true) {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const [isPunchedIn, setIsPunchedIn] = useState(false);
  const isAlarmActiveRef = useRef(false);

  const startAlarm = async () => {
    if (isAlarmActiveRef.current) return;
    isAlarmActiveRef.current = true;
    try {
      // Loop vibration
      Vibration.vibrate([1000, 500, 1000, 500], true);

      // Play Siren/Alarm sound using new expo-audio API
      const player = new AudioPlayer('https://www.soundjay.com/buttons/sounds/alarm-clock-elapsed-01.mp3');
      player.loop = true;
      await player.play();
      playerRef.current = player;

      // Show local notification alert
      await Notifications.scheduleNotificationAsync({
        content: {
          title: 'Tracking Status Alert!',
          body: 'GPS or Internet has been turned off during your shift. Please restore to avoid automatic punch out.',
          sound: true,
          vibrate: [1000, 500, 1000, 500],
        },
        trigger: null,
      });
    } catch (err) {
      console.warn('Failed to start alarm:', err);
    }
  };

  const stopAlarm = async () => {
    if (!isAlarmActiveRef.current) return;
    isAlarmActiveRef.current = false;
    Vibration.cancel();
    if (playerRef.current) {
      try {
        playerRef.current.stop();
        playerRef.current.release();
      } catch (err) {
        // ignore
      }
      playerRef.current = null;
    }
  };

  useEffect(() => {
    if (!enabled || !user) {
      stopAlarm();
      return;
    }

    let isMounted = true;

    const requestPermissionsAndStartBackground = async () => {
      try {
        const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
        if (fgStatus !== 'granted') return;

        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus !== 'granted') {
          // If background is not granted, fallback to foreground tracking
        }

        const { status: notifStatus } = await Notifications.requestPermissionsAsync();
        if (notifStatus !== 'granted') {
          // Permission for notifications
        }

        // Start background location updates
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: TRACKING_INTERVAL_MS,
          distanceInterval: 0,
          foregroundService: {
            notificationTitle: 'SWIFT Live Tracking',
            notificationBody: 'Your location is being tracked for your active shift.',
            notificationColor: '#10B981',
          },
        });
      } catch (err) {
        console.warn('Failed to start background location tracking:', err);
      }
    };

    // Initialize background task
    requestPermissionsAndStartBackground();

    // Check status loop
    const checkTrackingStatus = async () => {
      try {
        // 1. Fetch punch status from server
        let punchedInVal = isPunchedIn;
        try {
          const res = (await api.get('/attendance/status')) as any;
          if (res && typeof res.punched_in === 'boolean') {
            punchedInVal = res.punched_in;
            if (isMounted) {
              setIsPunchedIn(res.punched_in);
            }
          }
        } catch (err) {
          // If server is offline/unreachable, rely on cached isPunchedIn state
        }

        // 2. Check GPS status
        const gpsEnabled = await Location.hasServicesEnabledAsync();

        // 3. Check Internet status
        const netState = await NetInfo.fetch();
        const internetEnabled = !!netState.isConnected;

        if (punchedInVal) {
          if (!gpsEnabled || !internetEnabled) {
            // Trigger alarm if either GPS or Internet is off during shift
            startAlarm();
          } else {
            // Reset alarm if everything is active
            stopAlarm();
          }
        } else {
          // Reset alarm if not punched in
          stopAlarm();
        }
      } catch (err) {
        // Ignore loop check errors
      }
    };

    // Run immediately and then on interval
    checkTrackingStatus();
    intervalRef.current = setInterval(checkTrackingStatus, TRACKING_INTERVAL_MS);

    return () => {
      isMounted = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      stopAlarm();
      Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => {});
    };
  }, [enabled, user]);
}
