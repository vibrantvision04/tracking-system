import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface AlertBannerProps {
  message: string;
  onPress: () => void;
}

export default function AlertBanner({ message, onPress }: AlertBannerProps) {
  if (!message) return null;

  return (
    <TouchableOpacity style={styles.banner} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.content}>
        <Text style={styles.icon}>⚠️</Text>
        <Text style={styles.text} numberOfLines={1}>
          {message}
        </Text>
      </View>
      <Text style={styles.arrow}>→</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#C62828', // high-contrast warning red
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 56, // 56dp minimum touch target
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  icon: {
    fontSize: 18,
    marginRight: 8,
  },
  text: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  arrow: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
});
