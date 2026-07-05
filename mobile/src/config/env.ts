import { Platform } from 'react-native';

const LOCAL_API_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8080' : 'http://localhost:8080';

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL || LOCAL_API_URL;

console.log('[SWIFT] API_BASE_URL resolved to:', API_BASE_URL);
