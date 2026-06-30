import React, { useState, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
} from 'react-native';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useTranslation } from '../../i18n/useTranslation';
import { theme } from '../../theme/theme';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { LanguageToggle } from '../../components/ui/LanguageToggle';

export default function LoginScreen() {
  const { login } = useAuth();
  const { t } = useTranslation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFieldErrors = useCallback(() => {
    setIdentifierError(null);
    setPasswordError(null);
  }, []);

  const handleLogin = async () => {
    // Clear previous errors
    setErrorMsg(null);
    clearFieldErrors();

    // Empty field validation
    let hasError = false;
    if (!identifier.trim()) {
      setIdentifierError(t('login.fieldRequired'));
      hasError = true;
    }
    if (!password) {
      setPasswordError(t('login.fieldRequired'));
      hasError = true;
    }
    if (hasError) return;

    setLoading(true);

    // Set 30-second timeout
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      timeoutRef.current = setTimeout(() => resolve('timeout'), 30000);
    });

    try {
      const loginPromise = api.post('/login', {
        identifier: identifier.trim(),
        password: password,
      });

      const result = await Promise.race([loginPromise, timeoutPromise]);

      // Clear the timeout if the request completed
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (result === 'timeout') {
        setErrorMsg(t('login.errorTimeout'));
        setLoading(false);
        return;
      }

      const res = result as any;
      if (res && res.access_token) {
        await login(res.access_token, res.refresh_token, res.user);
      } else {
        setErrorMsg(t('login.errorInvalid'));
      }
    } catch (err: any) {
      // Clear the timeout on error
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      // The API client rejects with a typed ApiError ({ kind, status, message }).
      // Invalid credentials surface as 401 -> 'unauthorized'; on that path no
      // token is ever stored because login() is only called on success above.
      if (err?.kind === 'offline' || err?.message === 'Network Error' || err?.code === 'ERR_NETWORK') {
        setErrorMsg(t('login.errorNetwork'));
      } else if (err?.kind === 'timeout') {
        setErrorMsg(t('login.errorTimeout'));
      } else {
        // 'unauthorized' (invalid credentials) and any other failure surface a
        // generic invalid-credentials message without persisting a token.
        setErrorMsg(t('login.errorInvalid'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      {/* Fixed 56px header with white bg and bottom border */}
      <View style={styles.header}>
        <View style={styles.headerLeft} />
        <View style={styles.headerRight}>
          <LanguageToggle compact />
        </View>
      </View>

      {/* Scrollable content area with base background and 16px padding */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Branding */}
        <View style={styles.brandingArea}>
          <View style={styles.logoBox}>
            <Image
              source={require('../../../assets/Jaipur_Municipal_Corporation_Logo.png')}
              style={styles.logoImage}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.brandTitle}>{t('login.title')}</Text>
          <Text style={styles.brandSubtitle}>{t('login.subtitle')}</Text>
          <Text style={styles.brandOrg}>{t('login.org')}</Text>
        </View>

        {/* Form */}
        <View style={styles.formArea}>
          <Input
            label={t('login.employeeId')}
            value={identifier}
            onChangeText={(text) => {
              setIdentifier(text);
              setIdentifierError(null);
              setErrorMsg(null);
            }}
            placeholder={t('login.employeeId.placeholder')}
            error={identifierError ?? undefined}
            maxLength={20}
            keyboardType="default"
          />

          <Input
            label={t('login.password')}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setPasswordError(null);
              setErrorMsg(null);
            }}
            placeholder={t('login.password.placeholder')}
            error={passwordError ?? undefined}
            secureTextEntry={true}
            maxLength={64}
          />
        </View>

        {/* Error Banner */}
        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}
      </ScrollView>

      {/* Bottom-anchored action area with 16px padding for the primary Sign In button */}
      <View style={styles.bottomActionArea}>
        <Button
          title={t('login.signIn')}
          onPress={handleLogin}
          variant="primary"
          disabled={loading}
          loading={loading}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    height: theme.sizes.headerHeight,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
  },
  headerLeft: {
    width: theme.sizes.touchTarget,
  },
  headerRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: theme.spacing.base,
    paddingVertical: theme.spacing.base,
    justifyContent: 'center',
  },
  brandingArea: {
    alignItems: 'center',
    marginBottom: theme.spacing.xxl,
  },
  logoBox: {
    width: 64,
    height: 64,
    borderRadius: theme.borderRadius.button,
    backgroundColor: theme.colors.primaryLight,
    borderWidth: 1,
    borderColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.md,
  },
  logoImage: {
    width: 44,
    height: 44,
  },
  brandTitle: {
    fontSize: theme.typography.heading.fontSize,
    fontWeight: '900',
    color: theme.colors.textDark,
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '600',
    color: theme.colors.textDim,
    marginTop: theme.spacing.xs,
    textAlign: 'center',
  },
  brandOrg: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.colors.textDim,
    marginTop: theme.spacing.xs,
    fontWeight: '500',
  },
  formArea: {
    gap: theme.spacing.base,
    marginBottom: theme.spacing.base,
  },
  errorBanner: {
    backgroundColor: theme.colors.errorLight,
    borderWidth: 1,
    borderColor: theme.colors.error,
    borderRadius: theme.borderRadius.card,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.base,
    marginTop: theme.spacing.base,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.typography.secondary.fontSize,
    fontWeight: '600',
    textAlign: 'center',
  },
  bottomActionArea: {
    padding: theme.spacing.base,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
});
