import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import AlertBanner from '../../components/AlertBanner';
import { useAlerts } from '../../hooks/useAlerts';

export default function DriverHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: punchData, isLoading: loadingPunch } = usePunchStatus();
  const { data: alertData } = useAlerts();

  const isPunchedIn = !!(punchData && punchData.punched_in);
  const activeAlert = alertData?.alerts?.find((a: any) => !a.acknowledged);

  const handleCardPress = (screen: string) => {
    if (!isPunchedIn) {
      Alert.alert('Access Locked', 'Punch in first to access this feature.');
      return;
    }
    navigation.navigate(screen);
  };

  const handleComingSoon = () => {
    if (!isPunchedIn) {
      Alert.alert('Access Locked', 'Punch in first to access this feature.');
      return;
    }
    Alert.alert('Coming Soon', 'This feature is not yet available in Phase 1.');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Hello,</Text>
          <Text style={styles.nameText}>{user?.name || 'Driver'}</Text>
        </View>
        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Punch status banner */}
      <View style={[styles.statusBanner, isPunchedIn ? styles.punchedInBanner : styles.punchedOutBanner]}>
        <Text style={[styles.statusText, isPunchedIn ? styles.punchedInText : styles.punchedOutText]}>
          {isPunchedIn ? '● PUNCHED IN – Shift Active' : '● NOT PUNCHED IN'}
        </Text>
      </View>

      {/* Major alerts banner */}
      {isPunchedIn && activeAlert && (
        <AlertBanner 
          message={activeAlert.message} 
          onPress={() => navigation.navigate('DriverAlerts')} 
        />
      )}

      {/* Dashboard Menu Grid */}
      <View style={styles.menuContainer}>
        <Text style={styles.sectionTitle}>Main Menu</Text>
        
        <View style={styles.grid}>
          {/* Punch In - ALWAYS accessible */}
          <TouchableOpacity 
            style={[styles.card, styles.punchInCard]} 
            onPress={() => navigation.navigate('DriverPunchIn')}
          >
            <Text style={styles.cardIcon}>⏰</Text>
            <Text style={styles.cardTitle}>{isPunchedIn ? 'Punch Status' : 'Punch In'}</Text>
            <Text style={styles.cardSubtitle}>{isPunchedIn ? 'View details' : 'Start your shift'}</Text>
          </TouchableOpacity>

          {/* My Route */}
          <TouchableOpacity 
            style={[styles.card, !isPunchedIn && styles.lockedCard]} 
            onPress={() => handleCardPress('DriverRouteMap')}
          >
            <Text style={styles.cardIcon}>🗺️</Text>
            <Text style={styles.cardTitle}>My Route</Text>
            <Text style={styles.cardSubtitle}>View path & points</Text>
          </TouchableOpacity>

          {/* Coverage */}
          <TouchableOpacity 
            style={[styles.card, !isPunchedIn && styles.lockedCard]} 
            onPress={() => handleCardPress('DriverCoverage')}
          >
            <Text style={styles.cardIcon}>📈</Text>
            <Text style={styles.cardTitle}>Coverage</Text>
            <Text style={styles.cardSubtitle}>Check completion %</Text>
          </TouchableOpacity>

          {/* Alerts */}
          <TouchableOpacity 
            style={[styles.card, !isPunchedIn && styles.lockedCard]} 
            onPress={() => handleCardPress('DriverAlerts')}
          >
            <Text style={styles.cardIcon}>🔔</Text>
            <Text style={styles.cardTitle}>Alerts</Text>
            <Text style={styles.cardSubtitle}>View speed warnings</Text>
          </TouchableOpacity>

          {/* Complaints */}
          <TouchableOpacity 
            style={[styles.card, !isPunchedIn && styles.lockedCard]} 
            onPress={handleComingSoon}
          >
            <Text style={styles.cardIcon}>🚩</Text>
            <Text style={styles.cardTitle}>Complaints</Text>
            <Text style={styles.cardSubtitle}>Coming soon</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 48,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  welcomeText: {
    fontSize: 14,
    color: '#616161',
  },
  nameText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  logoutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#FFEBEE',
  },
  logoutText: {
    color: '#C62828',
    fontWeight: 'bold',
    fontSize: 14,
  },
  statusBanner: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  punchedInBanner: {
    backgroundColor: '#E8F5E9',
  },
  punchedOutBanner: {
    backgroundColor: '#FFF8E1',
  },
  statusText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  punchedInText: {
    color: '#2E7D32',
  },
  punchedOutText: {
    color: '#F57F17',
  },
  menuContainer: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  punchInCard: {
    borderColor: '#1565C0',
    borderWidth: 1,
  },
  lockedCard: {
    opacity: 0.4,
  },
  cardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 12,
    color: '#757575',
  },
});
