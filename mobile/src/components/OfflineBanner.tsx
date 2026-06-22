import React from 'react';
import { StyleSheet, Text, View, Platform, StatusBar as RNStatusBar } from 'react-native';
import { useNetwork } from '../hooks/useNetwork';

export default function OfflineBanner() {
  const isConnected = useNetwork();

  if (isConnected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>⚠️ No Internet Connection. Some features may be limited.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#C62828', // high-contrast warning red
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    zIndex: 9999,
    // Add margin for status bar on Android/iOS if needed, but top level wraps it
    paddingTop: Platform.OS === 'ios' ? 44 : RNStatusBar.currentHeight ? RNStatusBar.currentHeight + 8 : 12,
  },
  text: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    textAlign: 'center',
  },
});
