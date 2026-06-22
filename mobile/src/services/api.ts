import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const BASE_URL = 'http://192.168.1.6:8080'; // Your computer's IP address

export const KEYS = {
  ACCESS_TOKEN: 'iswm_access_token',
  REFRESH_TOKEN: 'iswm_refresh_token',
  USER_PROFILE: 'iswm_user_profile',
};

export const api = axios.create({
  baseURL: BASE_URL + '/api/mobile',
  timeout: 10000,
});

api.interceptors.request.use(
  async (config) => {
    const token = await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => {
    if (response.data && response.data.success === true && response.data.data !== undefined) {
      return response.data.data;
    }
    return response.data;
  },
  async (error) => {
    const originalRequest = error.config;
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refresh = await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
        if (refresh) {
          const res = await axios.post(`${BASE_URL}/api/mobile/refresh`, {
            refresh_token: refresh,
          });
          const { access_token, refresh_token } = res.data.data;
          await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access_token);
          await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh_token);
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        }
      } catch (err) {
        // clear session and force login
        await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
        await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
        await SecureStore.deleteItemAsync(KEYS.USER_PROFILE);
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);
