import React, { useRef, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View, Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { useThemeColors, ColorsType, Colors, FontSize, Spacing } from '../utils/theme';

import { useAppStore } from '../store/appStore';
// ARCH-001: auth session listener
import { onAuthStateChange, isSupabaseEnabled } from '../lib/auth';
import { captureError } from '../utils/errorMonitor';
import { localDateStr } from '../utils/dates';
import { effectiveStreak } from '../domain/progression';
import type { UnlockedAchievementInfo } from '../types';

import OnboardingScreen from '../screens/OnboardingScreen';
import DashboardScreen from '../screens/DashboardScreen';
import EvolveScreen from '../screens/EvolveScreen';
import FeedScreen from '../screens/FeedScreen';
import ProfileScreen from '../screens/ProfileScreen';
import LogOutputScreen from '../screens/LogOutputScreen';
import MilestoneScreen from '../screens/MilestoneScreen';
import SettingsScreen from '../screens/SettingsScreen';
import PortfolioScreen from '../screens/PortfolioScreen';

// HIGH-006: themed fallback so the crash screen respects dark mode (was static Colors,
// which rendered a white screen with near-invisible text for dark-mode users). A function
// component is needed to call useThemeColors() from the class boundary below.
function ScreenErrorFallback({ screenName, message, onRetry }: {
  screenName: string; message: string; onRetry: () => void;
}) {
  const Colors = useThemeColors();
  const s = React.useMemo(() => makeScreenErrorStyles(Colors), [Colors]);
  return (
    <View style={s.container}>
      <Text style={s.emoji}>⚠️</Text>
      <Text style={s.title}>{screenName} failed to load</Text>
      <Text style={s.msg}>{message}</Text>
      <TouchableOpacity style={s.retryBtn} onPress={onRetry} accessibilityRole="button" accessibilityLabel="Try again">
        <Text style={s.retryText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );
}

// OPS-002: per-screen error boundaries so one crashing tab doesn't kill the whole app
interface ScreenErrorState { error: Error | null }
class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode; screenName: string },
  ScreenErrorState
> {
  state: ScreenErrorState = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // OPS-001: report which screen crashed (consent-gated + PII-scrubbed).
    captureError(error, {
      source: 'screen_boundary',
      screen: this.props.screenName,
      component_stack: (info?.componentStack ?? '').split('\n').slice(0, 6).join('\n'),
    });
  }
  render() {
    if (this.state.error) {
      return (
        <ScreenErrorFallback
          screenName={this.props.screenName}
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function withScreenBoundary<P extends object>(
  Component: React.ComponentType<P>,
  screenName: string
): React.ComponentType<P> {
  return (props: P) => (
    <ScreenErrorBoundary screenName={screenName}>
      <Component {...props} />
    </ScreenErrorBoundary>
  );
}

export type RootStackParamList = {
  Onboarding: undefined;
  Main: undefined;
  MilestoneDetail: {
    skillId: string;
    xpGained: number;
    sessionXpGained?: number; // UX-030: true total XP delta incl. achievement/streak bonuses
    achievements?: UnlockedAchievementInfo[]; // achievements unlocked alongside the milestone
    leveledUp: boolean;
    newLevel: number;
  };
  Settings: undefined;
  Portfolio: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Feed: undefined;
  Log: undefined;
  Map: undefined;
  Profile: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

const GuardedDashboard = withScreenBoundary(DashboardScreen, 'Home');
const GuardedFeed = withScreenBoundary(FeedScreen, 'Community');
const GuardedLog = withScreenBoundary(LogOutputScreen, 'Log');
const GuardedEvolve = withScreenBoundary(EvolveScreen, 'Evolve');
const GuardedProfile = withScreenBoundary(ProfileScreen, 'Profile');
const GuardedSettings = withScreenBoundary(SettingsScreen, 'Settings');
const GuardedPortfolio = withScreenBoundary(PortfolioScreen, 'Portfolio'); // LOW-004

function TabIcon({
  icon,
  label,
  focused,
}: {
  icon: string;
  label: string;
  focused: boolean;
}) {
  const Colors = useThemeColors();
  // In light mode 0.38 becomes nearly invisible — use 0.60 for better contrast
  const inactiveOpacity = Colors.bg === '#F0EDFF' ? 0.60 : 0.38;
  return (
    <View style={{ alignItems: 'center', gap: 3, paddingTop: 4 }}>
      <Text
        style={{
          fontSize: 20,
          opacity: focused ? 1 : inactiveOpacity,
        }}
      >
        {icon}
      </Text>
    </View>
  );
}

function LogTabIcon({ focused, isStreakAtRisk }: { focused: boolean; isStreakAtRisk: boolean }) {
  const Colors = useThemeColors();
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isStreakAtRisk) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.85, duration: 700, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isStreakAtRisk]);

  return (
    <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: 46,
          height: 46,
          borderRadius: 23,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 10,
          // @ts-ignore - web-only gradient (backgroundImage accepted by react-native-web)
          backgroundImage: focused
            ? 'linear-gradient(135deg, #A855F7, #4F46E5)'
            : 'linear-gradient(135deg, #7C3AED, #4F46E5)',
          backgroundColor: focused ? Colors.primaryLight : Colors.primary,
          // @ts-ignore
          boxShadow: focused
            ? '0 0 20px rgba(168,85,247,0.7)'
            : '0 0 12px rgba(124,58,237,0.4)',
          shadowColor: Colors.primary,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: 12,
          shadowOpacity: focused ? 0.8 : 0.4,
          elevation: 8,
        }}
      >
        <Text style={{ fontSize: 24, color: '#fff', fontWeight: '300', lineHeight: 28 }}>+</Text>
      </View>
      {isStreakAtRisk && (
        <Animated.View
          style={{
            position: 'absolute',
            top: 1,
            right: 1,
            width: 11,
            height: 11,
            borderRadius: 5.5,
            backgroundColor: '#EF4444',
            borderWidth: 1.5,
            borderColor: Colors.bg,
            transform: [{ scale: pulseAnim }],
          }}
        />
      )}
    </View>
  );
}

function MainTabs() {
  const Colors = useThemeColors();
  const user = useAppStore((s) => s.user);
  const todayStr = localDateStr(); // RR-5: local calendar day
  const hasLoggedToday = user?.lastActiveDate === todayStr;
  // RR-11: don't pulse "save your streak" for a streak that is already dead.
  const isStreakAtRisk = !hasLoggedToday && effectiveStreak(user?.streak ?? 0, user?.lastActiveDate) > 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface + 'D6',
          borderTopColor: Colors.border,
          borderTopWidth: 1,
          height: 78,
          paddingBottom: 'env(safe-area-inset-bottom, 10px)' as any,
          paddingTop: 6,
          // @ts-ignore - web only glassmorphism
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        },
        tabBarActiveTintColor: Colors.primaryLight,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.5,
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={GuardedDashboard}
        options={{
          tabBarLabel: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🏠" label="Home" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Feed"
        component={GuardedFeed}
        options={{
          tabBarLabel: 'Feed', // RES-002: 'Community' (9 chars) truncates at 320px; 'Feed' always fits
          tabBarAccessibilityLabel: 'Community feed tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="🌐" label="Feed" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Log"
        component={GuardedLog}
        options={{
          tabBarLabel: '',
          tabBarAccessibilityLabel: isStreakAtRisk ? 'Log output — streak at risk!' : 'Log output',
          tabBarIcon: ({ focused }) => <LogTabIcon focused={focused} isStreakAtRisk={isStreakAtRisk} />,
        }}
      />
      <Tab.Screen
        name="Map"
        component={GuardedEvolve}
        options={{
          tabBarLabel: 'Evolve',
          tabBarAccessibilityLabel: 'Evolve — career milestone map',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="⚡" label="Evolve" focused={focused} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={GuardedProfile}
        options={{
          tabBarLabel: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon="👤" label="Profile" focused={focused} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);
  const setSupabaseSession = useAppStore((s) => s.setSupabaseSession);
  const syncFromSupabase   = useAppStore((s) => s.syncFromSupabase);

  // ARCH-001: subscribe to Supabase auth state changes for the lifetime of the app.
  // When a Magic Link is clicked the browser redirects back here, Supabase picks up
  // the token via detectSessionInUrl, fires SIGNED_IN, and we sync remote → local.
  useEffect(() => {
    if (!isSupabaseEnabled) return;
    const unsub = onAuthStateChange(async (session) => {
      if (session) {
        setSupabaseSession(session.user.id, session.user.email ?? null);
        await syncFromSupabase();
      } else {
        setSupabaseSession(null, null);
      }
    });
    return unsub;
  }, [setSupabaseSession, syncFromSupabase]); // LOW-002: Zustand action refs are stable

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'fade' }}>
        {!hasOnboarded ? (
          <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="MilestoneDetail"
              component={MilestoneScreen}
              options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
            />
            <Stack.Screen
              name="Settings"
              component={GuardedSettings}
              options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
            />
            <Stack.Screen
              name="Portfolio"
              component={GuardedPortfolio}
              options={{ animation: 'slide_from_right' }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const makeScreenErrorStyles = (Colors: ColorsType) => StyleSheet.create({
  container: {
    flex: 1,
    // BUG-E2E-001 (part 3): on web, flex:1 can collapse inside a modal when no
    // parent provides an explicit height, producing a blank white screen.
    // minHeight ensures the fallback is always visible regardless of layout context.
    minHeight: 300,
    backgroundColor: Colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  emoji: { fontSize: 40, marginBottom: Spacing.md },
  title: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  msg: {
    fontSize: FontSize.sm,
    color: Colors.textSub,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Spacing.lg,
    fontFamily: 'monospace',
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 12,
  },
  retryText: {
    fontSize: FontSize.base,
    fontWeight: '700',
    color: Colors.white,
  },
});
