import React, { createContext, useContext, useState, useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import axios from 'axios';
import { api, BASE_URL, KEYS, toApiError, setAuthFailureHandler } from '../services/api';
import { secureStorage } from '../services/secureStorage';
import { safeError } from '../utils/redact';
import { User } from '../types';

type AuthContextType = {
  user: User | null;
  isRestoring: boolean;
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

/**
 * Safely parse a cached user profile JSON string back into a {@link User}.
 * Returns `null` when the value is missing or unparseable so a corrupted cache
 * never crashes the launch path.
 */
function parseCachedProfile(raw: string | null): User | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.role) {
      return parsed as User;
    }
    return null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(true);

  useEffect(() => {
    async function loadSession() {
      try {
        // One-time migration of any tokens/profile left in AsyncStorage into
        // SecureStore. Must run before the first secure read on launch (Req 11.1).
        await secureStorage.migrate();

        // Auto-login on launch (Req 1.4): the session can be restored only when
        // a Refresh_Token is present. Without one we route to Login.
        const refresh = await secureStorage.get(KEYS.REFRESH_TOKEN);
        if (!refresh) {
          // Nothing to restore. Clear any stale profile remnant so a previous
          // user's cached data never leaks into an unauthenticated launch.
          await secureStorage.clear();
          setUser(null);
          return;
        }

        // Optimistically restore the cached profile so a brief offline relaunch
        // can still land on the role-appropriate home screen instead of flashing
        // the login screen the user cannot complete without connectivity.
        const cachedProfile = parseCachedProfile(
          await secureStorage.get(KEYS.USER_PROFILE)
        );
        if (cachedProfile) {
          setUser(cachedProfile);
        }

        // Explicitly refresh the session by calling POST /api/mobile/refresh to
        // obtain a fresh access token (Req 1.4). This validates the refresh token
        // server-side. On success, persist the new token pair and load the user
        // profile from /me to ensure role and profile data are authoritative.
        try {
          const refreshRes = await axios.post(`${BASE_URL}/api/mobile/refresh`, {
            refresh_token: refresh,
          });
          const { access_token, refresh_token: newRefresh } = refreshRes.data.data;
          await secureStorage.set(KEYS.ACCESS_TOKEN, access_token);
          await secureStorage.set(KEYS.REFRESH_TOKEN, newRefresh);

          // Load the user profile with the fresh access token (Req 1.4).
          const profile = (await api.get('/me')) as User;
          await secureStorage.set(KEYS.USER_PROFILE, JSON.stringify(profile));
          setUser(profile);
        } catch (err) {
          const apiErr = toApiError(err);
          if (apiErr.kind === 'offline' || apiErr.kind === 'timeout') {
            // Network problem, not an auth failure: do NOT hard-logout. Keep the
            // optimistically-restored cached profile if we have one; otherwise
            // there is nothing to show, so fall through to Login.
            if (cachedProfile) {
              safeError('Session validation deferred (offline):', apiErr);
              return;
            }
            setUser(null);
            return;
          }
          // Authoritative rejection (unauthorized/forbidden/etc): the session is
          // no longer valid. The refresh token was rejected by the backend.
          // Clear all tokens + cached profile and route to Login (Req 1.6).
          safeError('Auto-login failed:', apiErr);
          await secureStorage.clear();
          setUser(null);
        }
      } catch (err) {
        // A failed restore must never crash the app. Clear any partial token
        // state and fall through to Login.
        safeError('Auto-login error:', err);
        try {
          await secureStorage.clear();
        } catch {
          // best-effort cleanup
        }
        setUser(null);
      } finally {
        setLoading(false);
        setIsRestoring(false);
      }
    }
    loadSession();
  }, []);

  // Auto-logout wiring (Req 1.6, 1.7): when the API client's single-flight
  // refresh is rejected the session is unrecoverable — it has already cleared
  // the tokens, so we just drop the in-memory user to route back to Login.
  // Registered once on mount and unregistered on unmount to avoid a dangling
  // reference holding stale state.
  useEffect(() => {
    setAuthFailureHandler(() => setUser(null));
    return () => setAuthFailureHandler(null);
  }, []);

  const login = async (token: string, refresh: string, profile: User) => {
    // Successful login (Req 1.1, 1.3): persist tokens + profile and set the user.
    await secureStorage.set(KEYS.ACCESS_TOKEN, token);
    await secureStorage.set(KEYS.REFRESH_TOKEN, refresh);
    await secureStorage.set(KEYS.USER_PROFILE, JSON.stringify(profile));
    setUser(profile);
  };

  const logout = async () => {
    // Revoke the refresh token server-side (Req 1.7) so it cannot be replayed.
    // Best-effort: the local session must always be cleared even if the request
    // fails or the device is offline, so the network call never blocks logout.
    try {
      await api.post('/logout');
    } catch (err) {
      safeError('Logout request failed (clearing local session anyway):', toApiError(err));
    }
    // Session-end clearing (Req 1.6, 11.6): remove all tokens + cached profile
    // from secure storage and drop the in-memory user to route back to Login.
    await secureStorage.clear();
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
    <AuthContext.Provider value={{ user, isRestoring, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
