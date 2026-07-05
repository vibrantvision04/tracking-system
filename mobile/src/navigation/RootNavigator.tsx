import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from '../context/AuthContext';
import { useEmployeeLocationTracking } from '../hooks/useEmployeeLocationTracking';

// Screens
import LoginScreen from '../screens/auth/LoginScreen';

// Driver Screens
import DriverHome from '../screens/driver/HomeScreen';
import DriverPunchIn from '../screens/driver/PunchInScreen';
import DriverRouteMap from '../screens/driver/RouteMapScreen';
import DriverCoverage from '../screens/driver/CoverageScreen';
import DriverAlerts from '../screens/driver/AlertsScreen';
import DriverBlockage from '../screens/driver/BlockageReportScreen';
import DriverAttendanceReport from '../screens/driver/AttendanceScreen';

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
import OpenDepotHome from '../screens/open_depot/HomeScreen';
import OpenDepotSubmit from '../screens/open_depot/SubmitPhotoScreen';

// Road Sweeper Screens
import SweeperHome from '../screens/road_sweeper/HomeScreen';
import SweeperPunchIn from '../screens/road_sweeper/PunchInScreen';
import SweeperRouteMap from '../screens/road_sweeper/RouteMapScreen';
import SweeperBeforeImage from '../screens/road_sweeper/BeforeImageScreen';
import SweeperAfterImage from '../screens/road_sweeper/AfterImageScreen';
import SweeperCoverage from '../screens/road_sweeper/CoverageScreen';
import SweeperAttendance from '../screens/road_sweeper/AttendanceScreen';
import SweeperAlerts from '../screens/road_sweeper/AlertsScreen';

// Shared Screens
import Complaints from '../screens/shared/ComplaintsScreen';

const Stack = createStackNavigator();


export default function RootNavigator() {
  const { user } = useAuth();

  useEmployeeLocationTracking(!!user);

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
            <Stack.Screen name="DriverAttendance" component={DriverAttendanceReport} />
            <Stack.Screen name="Complaints" component={Complaints} />
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
            <Stack.Screen name="Complaints" component={Complaints} />
          </>
        ) : user.role === 'zone_manager' ? (
          <>
            <Stack.Screen name="ZoneManagerHome" component={ZoneManagerHome} />
            <Stack.Screen name="ZoneManagerPunchIn" component={ZoneManagerPunchIn} />
            <Stack.Screen name="ZoneCoverage" component={ZoneCoverage} />
            <Stack.Screen name="ZoneManagerAlerts" component={ZoneManagerAlerts} />
            <Stack.Screen name="ZoneManagerLiveTracking" component={ZoneManagerLiveTracking} />
            <Stack.Screen name="ZoneManagerAttendance" component={ZoneManagerAttendance} />
            <Stack.Screen name="BlockageApprovals" component={BlockageApprovals} />
            <Stack.Screen name="ZoneManagerOpenDepot" component={SupervisorOpenDepot} />
            <Stack.Screen name="Complaints" component={Complaints} />
          </>
        ) : user.role === 'road_sweeper' ? (
          <>
            <Stack.Screen name="SweeperHome" component={SweeperHome} />
            <Stack.Screen name="SweeperPunchIn" component={SweeperPunchIn} />
            <Stack.Screen name="SweeperRouteMap" component={SweeperRouteMap} />
            <Stack.Screen name="SweeperBeforeImage" component={SweeperBeforeImage} />
            <Stack.Screen name="SweeperAfterImage" component={SweeperAfterImage} />
            <Stack.Screen name="SweeperCoverage" component={SweeperCoverage} />
            <Stack.Screen name="SweeperAttendance" component={SweeperAttendance} />
            <Stack.Screen name="SweeperAlerts" component={SweeperAlerts} />
            <Stack.Screen name="Complaints" component={Complaints} />
          </>
        ) : user.role === 'open_depot_operator' ? (
          <>
            <Stack.Screen name="OpenDepotHome" component={OpenDepotHome} />
            <Stack.Screen name="OpenDepotSubmit" component={OpenDepotSubmit} />
          </>
        ) : (
          // Unknown/unexpected backend role: do NOT leak any role-specific
          // screens. Fall back to a minimal safe stack (Login only) so no
          // controls or screens are exposed for roles we don't recognize.
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
