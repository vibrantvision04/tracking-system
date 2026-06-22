import { useState, useCallback } from 'react';
import * as Location from 'expo-location';

export function useGPS() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getCurrentLocation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission was denied. Please enable location services.');
        setLoading(false);
        return null;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLoading(false);
      return location.coords;
    } catch (err: any) {
      setError(err?.message || 'Failed to retrieve location');
      setLoading(false);
      return null;
    }
  }, []);

  return { getCurrentLocation, loading, error };
}
