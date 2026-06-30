const LOCAL_API_URL = 'http://localhost:8080';

export const API_BASE_URL: string =
  process.env.EXPO_PUBLIC_API_URL || LOCAL_API_URL;
