import axios from 'axios';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BASE_URL = Platform.OS === 'web' ? 'http://localhost:8080' : 'http://192.168.1.6:8080';

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
    const token = await AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;
let refreshQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

function processRefreshQueue(token: string | null, error: any) {
  refreshQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  refreshQueue = [];
}

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
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refresh = await AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
        if (!refresh) throw new Error('No refresh token');

        const res = await axios.post(`${BASE_URL}/api/mobile/refresh`, {
          refresh_token: refresh,
        });
        const { access_token, refresh_token } = res.data.data;
        await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, access_token);
        await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refresh_token);

        processRefreshQueue(access_token, null);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (err) {
        processRefreshQueue(null, err);
        await AsyncStorage.multiRemove([KEYS.ACCESS_TOKEN, KEYS.REFRESH_TOKEN, KEYS.USER_PROFILE]);
        return Promise.reject(error.response?.data || error);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error.response?.data || error);
  }
);
