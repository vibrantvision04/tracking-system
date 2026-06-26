import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Dimensions } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { Header } from '../../components/ui/Header';
import { theme } from '../../theme/theme';

const screenWidth = Dimensions.get('window').width;
const tileSize = (screenWidth - theme.spacing.base * 3);

export default function OpenDepotHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Header
        title="Open Depot Worker"
        rightActions={[
          {
            icon: 'log-out-outline',
            onPress: logout,
            accessibilityLabel: 'Logout',
          },
        ]}
      />

      <View style={styles.greetingSection}>
        <Text style={styles.greeting}>Welcome,</Text>
        <Text style={styles.userName}>{user?.name || 'Worker'}</Text>
      </View>

      <View style={styles.tileContainer}>
        <TouchableOpacity
          style={styles.cameraTile}
          onPress={() => navigation.navigate('OpenDepotSubmit')}
          activeOpacity={0.7}
        >
          <View style={styles.cameraIconWrapper}>
            <Text style={styles.cameraIcon}>📷</Text>
          </View>
          <Text style={styles.tileTitle}>Open Depot</Text>
          <Text style={styles.tileSubtitle}>Tap to capture photo</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  greetingSection: {
    paddingHorizontal: theme.spacing.base,
    paddingTop: 100,
    paddingBottom: theme.spacing.xl,
  },
  greeting: {
    fontSize: 16,
    color: theme.colors.textDim,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginTop: 4,
  },
  tileContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.base,
    paddingBottom: 80,
  },
  cameraTile: {
    width: tileSize,
    height: tileSize,
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cameraIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  cameraIcon: {
    fontSize: 40,
  },
  tileTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.textDark,
    marginBottom: 4,
  },
  tileSubtitle: {
    fontSize: 14,
    color: theme.colors.textDim,
  },
});
