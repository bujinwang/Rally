import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

// Import screens
import CreateSessionScreen from '../screens/CreateSessionScreen';
import MySessionsScreen from '../screens/MySessionsScreen';
import JoinSessionScreen from '../screens/JoinSessionScreen';
import SessionDetailScreen from '../screens/SessionDetailScreen';
import MoreScreen from '../screens/MoreScreen';
import PlayerCardDemo from '../screens/demo/PlayerCardDemo';
import SessionOverviewScreen from '../screens/SessionOverviewScreen';
import PlayerProfileScreen from '../screens/PlayerProfileScreen';
import LiveGameScreen from '../screens/LiveGameScreen';
import SessionHistoryScreen from '../screens/SessionHistoryScreen';
import RotationScreen from '../screens/rotation/RotationScreen';
import SessionDiscoveryScreen from '../screens/SessionDiscoveryScreen';
import MatchRecordingScreen from '../screens/MatchRecordingScreen';
import StatisticsDashboardScreen from '../screens/StatisticsDashboardScreen';
import RankingScreen from '../screens/RankingScreen';
import AchievementScreen from '../screens/AchievementScreen';
import TournamentListScreen from '../screens/TournamentListScreen';
import TournamentDetailScreen from '../screens/TournamentDetailScreen';
import TournamentCreateScreen from '../screens/TournamentCreateScreen';
import PairingScreen from '../screens/pairing/PairingScreen';
import MatchSchedulingScreen from '../screens/MatchSchedulingScreen';
import CreateMatchScreen from '../screens/CreateMatchScreen';
import MatchDetailsScreen from '../screens/MatchDetailsScreen';

const Tab = createBottomTabNavigator();
const HomeStack = createNativeStackNavigator();
const SessionsStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();
const TournamentsStack = createNativeStackNavigator();

// Stack navigator for Create Session tab
function HomeStackNavigator() {
  return (
    <HomeStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#007AFF' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <HomeStack.Screen
        name="CreateSession"
        component={CreateSessionScreen}
        options={{ title: 'Create Session' }}
      />
      <HomeStack.Screen
        name="JoinSession"
        component={JoinSessionScreen}
        options={{ title: 'Join Session' }}
      />
      <HomeStack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{ title: 'Session Details' }}
      />
      <HomeStack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={{ title: 'Player Profile' }}
      />
      <HomeStack.Screen
        name="LiveGame"
        component={LiveGameScreen}
        options={{ title: 'Live Game' }}
      />
      <HomeStack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{ title: 'Session History' }}
      />
      <HomeStack.Screen
        name="RotationQueue"
        component={RotationScreen}
        options={{ title: 'Fair Play Queue' }}
      />
      <HomeStack.Screen
        name="SessionDiscovery"
        component={SessionDiscoveryScreen}
        options={{ title: 'Discover Sessions' }}
      />
    </HomeStack.Navigator>
  );
}

// Stack navigator for My Sessions tab
function SessionsStackNavigator() {
  return (
    <SessionsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#007AFF' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <SessionsStack.Screen
        name="MySessions"
        component={MySessionsScreen}
        options={{ title: 'My Sessions' }}
      />
      <SessionsStack.Screen
        name="SessionDetail"
        component={SessionDetailScreen}
        options={{ title: 'Session Details' }}
      />
      <SessionsStack.Screen
        name="JoinSession"
        component={JoinSessionScreen}
        options={{ title: 'Join Session' }}
      />
      <SessionsStack.Screen
        name="PlayerProfile"
        component={PlayerProfileScreen}
        options={{ title: 'Player Profile' }}
      />
      <SessionsStack.Screen
        name="LiveGame"
        component={LiveGameScreen}
        options={{ title: 'Live Game' }}
      />
      <SessionsStack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{ title: 'Session History' }}
      />
      <SessionsStack.Screen
        name="RotationQueue"
        component={RotationScreen}
        options={{ title: 'Fair Play Queue' }}
      />
      <SessionsStack.Screen
        name="MatchRecording"
        component={MatchRecordingScreen}
        options={{ title: 'Record Match' }}
      />
      <SessionsStack.Screen
        name="Pairing"
        component={PairingScreen}
        options={{ title: 'Player Pairing' }}
      />
      <SessionsStack.Screen
        name="MatchScheduling"
        component={MatchSchedulingScreen}
        options={{ title: 'Match Scheduling' }}
      />
      <SessionsStack.Screen
        name="CreateMatch"
        component={CreateMatchScreen}
        options={{ title: 'Schedule Match' }}
      />
      <SessionsStack.Screen
        name="MatchDetails"
        component={MatchDetailsScreen}
        options={{ title: 'Match Details' }}
      />
    </SessionsStack.Navigator>
  );
}

// Stack navigator for Profile tab
function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#007AFF' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <ProfileStack.Screen
        name="Profile"
        component={PlayerProfileScreen}
        options={{ title: 'My Profile' }}
        initialParams={{ isOwnProfile: true }}
      />
      <ProfileStack.Screen
        name="SessionHistory"
        component={SessionHistoryScreen}
        options={{ title: 'Session History' }}
      />
      <ProfileStack.Screen
        name="StatisticsDashboard"
        component={StatisticsDashboardScreen}
        options={{ title: 'Statistics' }}
      />
      <ProfileStack.Screen
        name="RankingScreen"
        component={RankingScreen}
        options={{ title: 'Rankings' }}
      />
      <ProfileStack.Screen
        name="Achievements"
        component={AchievementScreen}
        options={{ title: 'Achievements' }}
      />
    </ProfileStack.Navigator>
  );
}

// Stack navigator for Tournaments tab
function TournamentsStackNavigator() {
  return (
    <TournamentsStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#007AFF' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
      }}
    >
      <TournamentsStack.Screen
        name="TournamentList"
        component={TournamentListScreen}
        options={{ title: 'Tournaments' }}
      />
      <TournamentsStack.Screen
        name="TournamentDetail"
        component={TournamentDetailScreen}
        options={{ title: 'Tournament Details' }}
      />
      <TournamentsStack.Screen
        name="TournamentCreate"
        component={TournamentCreateScreen}
        options={{ title: 'Create Tournament' }}
      />
    </TournamentsStack.Navigator>
  );
}

const MainTabNavigator = () => {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any;

          if (route.name === 'Home') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          } else if (route.name === 'Sessions') {
            iconName = focused ? 'list' : 'list-outline';
          } else if (route.name === 'Tournaments') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          } else if (route.name === 'ProfileTab') {
            iconName = focused ? 'person' : 'person-outline';
          } else if (route.name === 'More') {
            iconName = focused ? 'menu' : 'menu-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 1,
          borderTopColor: '#E0E0E0',
          paddingBottom: 5,
          paddingTop: 5,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeStackNavigator}
        options={{
          tabBarLabel: 'Create',
          title: 'Create Session'
        }}
      />
      <Tab.Screen
        name="Sessions"
        component={SessionsStackNavigator}
        options={{
          tabBarLabel: 'My Sessions',
          title: 'My Sessions'
        }}
      />
      <Tab.Screen
        name="Tournaments"
        component={TournamentsStackNavigator}
        options={{
          tabBarLabel: 'Tournaments',
          title: 'Tournaments'
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStackNavigator}
        options={{
          tabBarLabel: 'Profile',
          title: 'My Profile'
        }}
      />
      <Tab.Screen 
        name="More" 
        component={SessionOverviewScreen}
        options={{
          tabBarLabel: 'Session',
          title: 'Session Overview'
        }}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;