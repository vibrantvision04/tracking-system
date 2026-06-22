import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';

// Driver Screens
import DriverHome from '../screens/driver/HomeScreen';
import DriverPunchIn from '../screens/driver/PunchInScreen';
import DriverRouteMap from '../screens/driver/RouteMapScreen';
import DriverCoverage from '../screens/driver/CoverageScreen';
import DriverAlerts from '../screens/driver/AlertsScreen';
import DriverBlockage from '../screens/driver/BlockageReportScreen';

// Supervisor Screens
import SupervisorHome from '../screens/supervisor/HomeScreen';
import SupervisorPunchIn from '../screens/supervisor/PunchInScreen';
import DriverAttendance from '../screens/supervisor/DriverAttendanceScreen';
import WardCoverage from '../screens/supervisor/WardCoverageScreen';
import BlockageApprovals from '../screens/supervisor/BlockageApprovalsScreen';
import SupervisorAlerts from '../screens/supervisor/AlertsScreen';
import SupervisorLiveTracking from '../screens/supervisor/LiveTrackingScreen';
import SupervisorOpenDepot from '../screens/supervisor/OpenDepotScreen';

// Zone Manager Screens
import ZoneManagerHome from '../screens/zone_manager/HomeScreen';
import ZoneManagerPunchIn from '../screens/zone_manager/PunchInScreen';
import ZoneCoverage from '../screens/zone_manager/ZoneCoverageScreen';
import ZoneManagerAlerts from '../screens/zone_manager/AlertsScreen';
import ZoneManagerLiveTracking from '../screens/zone_manager/LiveTrackingScreen';
import ZoneManagerAttendance from '../screens/zone_manager/AttendanceScreen';

// Open Depot Screens
import OpenDepotSubmit from '../screens/open_depot/SubmitPhotoScreen';

const Stack = createStackNavigator();


export default function RootNavigator() {
  const { user } = useAuth();

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : user.role === 'driver' ? (
          <>
            <Stack.Screen name="DriverHome" component={DriverHome} />
            <Stack.Screen name="DriverPunchIn" component={DriverPunchIn} />
            <Stack.Screen name="DriverRouteMap" component={DriverRouteMap} />
            <Stack.Screen name="DriverCoverage" component={DriverCoverage} />
            <Stack.Screen name="DriverAlerts" component={DriverAlerts} />
            <Stack.Screen name="DriverBlockage" component={DriverBlockage} />
          </>
        ) : user.role === 'supervisor' ? (
          <>
            <Stack.Screen name="SupervisorHome" component={SupervisorHome} />
            <Stack.Screen name="SupervisorPunchIn" component={SupervisorPunchIn} />
            <Stack.Screen name="DriverAttendance" component={DriverAttendance} />
            <Stack.Screen name="WardCoverage" component={WardCoverage} />
            <Stack.Screen name="BlockageApprovals" component={BlockageApprovals} />
            <Stack.Screen name="SupervisorAlerts" component={SupervisorAlerts} />
            <Stack.Screen name="SupervisorLiveTracking" component={SupervisorLiveTracking} />
            <Stack.Screen name="SupervisorOpenDepot" component={SupervisorOpenDepot} />
          </>
        ) : user.role === 'zone_manager' ? (
          <>
            <Stack.Screen name="ZoneManagerHome" component={ZoneManagerHome} />
            <Stack.Screen name="ZoneManagerPunchIn" component={ZoneManagerPunchIn} />
            <Stack.Screen name="ZoneCoverage" component={ZoneCoverage} />
            <Stack.Screen name="ZoneManagerAlerts" component={ZoneManagerAlerts} />
            <Stack.Screen name="ZoneManagerLiveTracking" component={ZoneManagerLiveTracking} />
            <Stack.Screen name="ZoneManagerAttendance" component={ZoneManagerAttendance} />
          </>
        ) : (
          <>
            <Stack.Screen name="OpenDepotSubmit" component={OpenDepotSubmit} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
