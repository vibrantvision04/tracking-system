import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { KEYS } from '../services/api';
import { User } from '../types';

type AuthContextType = {
  user: User | null;
  login: (token: string, refresh: string, profile: User) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        const storedUser = await SecureStore.getItemAsync(KEYS.USER_PROFILE);
        if (storedUser) {
          setUser(JSON.parse(storedUser));
        }
      } catch (err) {
        console.warn('Failed to load session:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSession();
  }, []);

  const login = async (token: string, refresh: string, profile: User) => {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, token);
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh);
    await SecureStore.setItemAsync(KEYS.USER_PROFILE, JSON.stringify(profile));
    setUser(profile);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER_PROFILE);
    setUser(null);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F5' }}>
        <ActivityIndicator size="large" color="#1565C0" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
