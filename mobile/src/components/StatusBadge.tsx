import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface StatusBadgeProps {
  status: 'achieved' | 'pending' | 'missed' | 'upcoming' | string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const getStyle = () => {
    switch (status.toLowerCase()) {
      case 'achieved':
      case 'approved':
      case 'done':
        return { bg: '#2E7D32', text: '#ffffff', label: 'Done' };
      case 'pending':
      case 'pending_approval':
        return { bg: '#F57F17', text: '#ffffff', label: 'Pending' };
      case 'missed':
      case 'rejected':
        return { bg: '#C62828', text: '#ffffff', label: 'Missed' };
      case 'upcoming':
        return { bg: '#e0e0e0', text: '#424242', label: 'Upcoming' };
      default:
        return { bg: '#9e9e9e', text: '#ffffff', label: status.toUpperCase() };
    }
  };

  const { bg, text, label } = getStyle();

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: 'bold',
  },
});
