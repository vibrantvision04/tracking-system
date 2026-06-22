import { useState, useCallback } from 'react';
import { Camera } from 'expo-camera';

export function useCamera() {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const requestPermission = useCallback(async () => {
    const { status } = await Camera.requestCameraPermissionsAsync();
    const isGranted = status === 'granted';
    setHasPermission(isGranted);
    return isGranted;
  }, []);

  return { hasPermission, requestPermission };
}
