import React from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { usePunchStatus } from '../../hooks/usePunchStatus';
import { api } from '../../services/api';

export default function ZoneManagerHomeScreen({ navigation }: any) {
  const { user, logout } = useAuth();
  const { data: punchData, refetch: refetchPunch } = usePunchStatus();

  const isPunchedIn = !!(punchData && punchData.punched_in);
  const showPunchOut = isPunchedIn && !!(punchData && punchData.manual_punchout_enabled);

  const handlePunchOut = async () => {
    Alert.alert(
      'Punch Out',
      'Are you sure you want to punch out of your zone manager shift?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Punch Out',
          onPress: async () => {
            try {
              await api.post('/attendance/punch-out');
              Alert.alert('Success', 'Punched out successfully');
              refetchPunch();
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to punch out');
            }
          },
        },
      ]
    );
  };

  const handleComingSoon = () => {
    Alert.alert('Coming Soon', 'This feature is not yet available in Phase 1.');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Zone Manager Panel</Text>
          <Text style={styles.nameText}>{user?.name || 'Zone Manager'}</Text>
        </View>
        <View style={styles.headerActions}>
          {showPunchOut && (
            <TouchableOpacity style={styles.punchOutButton} onPress={handlePunchOut}>
              <Text style={styles.punchOutText}>Punch Out</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.logoutButton} onPress={logout}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Punch status banner */}
      <View style={[styles.statusBanner, isPunchedIn ? styles.punchedInBanner : styles.punchedOutBanner]}>
        <Text style={[styles.statusText, isPunchedIn ? styles.punchedInText : styles.punchedOutText]}>
          {isPunchedIn ? '● PUNCHED IN – Shift Active' : '● NOT PUNCHED IN'}
        </Text>
      </View>

      {/* Dashboard Menu Grid */}
      <View style={styles.menuContainer}>
        <Text style={styles.sectionTitle}>Main Menu</Text>

        <View style={styles.grid}>
          {/* Punch In */}
          <TouchableOpacity
            style={[styles.card, styles.highlightCard]}
            onPress={() => navigation.navigate('ZoneManagerPunchIn')}
          >
            <Text style={styles.cardIcon}>⏰</Text>
            <Text style={styles.cardTitle}>{isPunchedIn ? 'Punch Status' : 'Punch In'}</Text>
            <Text style={styles.cardSubtitle}>{isPunchedIn ? 'View details' : 'Start your shift'}</Text>
          </TouchableOpacity>

          {/* Zone Coverage */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ZoneCoverage')}
          >
            <Text style={styles.cardIcon}>📈</Text>
            <Text style={styles.cardTitle}>Zone Coverage</Text>
            <Text style={styles.cardSubtitle}>Full zone coverage breakdown</Text>
          </TouchableOpacity>

          {/* Live Tracking */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ZoneManagerLiveTracking')}
          >
            <Text style={styles.cardIcon}>🗺️</Text>
            <Text style={styles.cardTitle}>Live Tracking</Text>
            <Text style={styles.cardSubtitle}>Track all zone vehicles</Text>
          </TouchableOpacity>

          {/* Attendance */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ZoneManagerAttendance')}
          >
            <Text style={styles.cardIcon}>👥</Text>
            <Text style={styles.cardTitle}>Attendance Panel</Text>
            <Text style={styles.cardSubtitle}>Mark drivers & supervisors</Text>
          </TouchableOpacity>

          {/* Alerts */}
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate('ZoneManagerAlerts')}
          >
            <Text style={styles.cardIcon}>bell</Text>
            <Text style={styles.cardTitle}>Zone Alerts</Text>
            <Text style={styles.cardSubtitle}>View all zone-level alerts</Text>
          </TouchableOpacity>

          {/* Complaints */}
          <TouchableOpacity
            style={styles.card}
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#FFEBEE',
    minHeight: 40,
    justifyContent: 'center',
  },
  logoutText: {
    color: '#C62828',
    fontWeight: 'bold',
    fontSize: 14,
  },
  punchOutButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 4,
    backgroundColor: '#FFF3E0',
    minHeight: 40,
    justifyContent: 'center',
  },
  punchOutText: {
    color: '#E65100',
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
    minHeight: 120,
    justifyContent: 'space-between',
  },
  highlightCard: {
    borderColor: '#1565C0',
    borderWidth: 1,
  },
  cardIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 11,
    color: '#757575',
  },
});
