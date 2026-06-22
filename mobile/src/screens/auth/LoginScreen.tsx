import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!identifier.trim()) {
      setErrorMsg('Please enter your Employee ID or Phone Number');
      return;
    }
    
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await api.post('/login', {
        identifier: identifier.trim(),
        password: password,
      }) as any;
      
      if (res && res.access_token) {
        await login(res.access_token, res.refresh_token, res.user);
      } else {
        setErrorMsg('Invalid login response. Please check backend settings.');
      }
    } catch (err: any) {
      setErrorMsg(err?.error || err?.message || 'Login failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.logoContainer}>
          <Text style={styles.logoIcon}>🚛</Text>
          <Text style={styles.logoText}>ISWM Field Ops</Text>
        </View>

        <Text style={styles.title}>Account Login</Text>
        <Text style={styles.subtitle}>Enter your Employee ID/Phone and password to continue</Text>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Employee ID or Phone</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. 8769807155"
            placeholderTextColor="#9e9e9e"
            value={identifier}
            onChangeText={(text) => {
              setIdentifier(text);
              setErrorMsg(null);
            }}
            keyboardType="default"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter password"
            placeholderTextColor="#9e9e9e"
            secureTextEntry
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setErrorMsg(null);
            }}
          />
        </View>

        <TouchableOpacity 
          style={[styles.loginButton, loading && styles.disabledButton]} 
          onPress={handleLogin}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.loginButtonText}>Login</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 24,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoIcon: {
    fontSize: 50,
  },
  logoText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1565C0',
    marginTop: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#616161',
    marginBottom: 20,
  },
  errorBanner: {
    backgroundColor: '#FFEBEE',
    borderColor: '#C62828',
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#C62828',
    fontSize: 14,
    fontWeight: '600',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#212121',
    marginBottom: 6,
  },
  input: {
    height: 56, // 56dp minimum touch target
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#212121',
    backgroundColor: '#fafafa',
  },
  loginButton: {
    height: 56, // 56dp minimum touch target
    backgroundColor: '#1565C0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    backgroundColor: '#9e9e9e',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
