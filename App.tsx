import React, { useEffect, useRef } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { ToastProvider } from './src/components/Toast';
import ConsentBanner from './src/components/ConsentBanner';
import LogReminder from './src/components/LogReminder';
import { sessionStarted, track, trackRetention } from './src/utils/analytics';
import { captureError, installGlobalErrorHandlers } from './src/utils/errorMonitor';
import { ThemeContext } from './src/utils/theme';
import { useAppStore } from './src/store/appStore';

declare const __DEV__: boolean;
const IS_DEV = typeof __DEV__ !== 'undefined' && __DEV__;

interface ErrorState { error: Error | null; showDetails: boolean }
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorState> {
  state: ErrorState = { error: null, showDetails: false };
  static getDerivedStateFromError(error: Error) { return { error, showDetails: false }; }
  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // OPS-001: report root-level crashes (consent-gated + PII-scrubbed).
    captureError(error, {
      source: 'root_boundary',
      component_stack: (info?.componentStack ?? '').split('\n').slice(0, 6).join('\n'),
    });
  }
  render() {
    if (this.state.error) {
      return (
        <View style={styles.error}>
          <Text style={styles.errorEmoji}>😅</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>
            The app hit an unexpected snag. Your progress is saved on this device — reloading
            usually fixes it.
          </Text>
          <TouchableOpacity
            style={styles.reloadBtn}
            onPress={() => { if (typeof window !== 'undefined') window.location.reload(); }}
            accessibilityRole="button"
            accessibilityLabel="Reload the app"
          >
            <Text style={styles.reloadText}>Reload App</Text>
          </TouchableOpacity>
          {IS_DEV && (
            <View style={styles.devDetails}>
              <Text style={styles.errorStack}>{this.state.error.message}</Text>
              <Text style={styles.errorStack}>{this.state.error.stack?.slice(0, 600)}</Text>
            </View>
          )}
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const sessionStart = useRef(Date.now());
  const colorScheme = useAppStore((s) => s.colorScheme);
  const fontScale = useAppStore((s) => s.fontScale);
  // UX-028: only show the consent banner after onboarding is complete so it
  // never overlaps the "Begin Your Journey" CTA on the welcome screen.
  const hasOnboarded = useAppStore((s) => s.hasOnboarded);

  // Apply the user's text-size preference app-wide (web). The CSS rule
  // `#root { zoom: var(--app-font-scale) }` in index.html picks this up.
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--app-font-scale', String(fontScale));
    }
  }, [fontScale]);

  useEffect(() => {
    installGlobalErrorHandlers(); // OPS-001: catch window errors + unhandled rejections
    sessionStarted();
    trackRetention(useAppStore.getState().user?.joinedAt);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const durationSeconds = Math.round((Date.now() - sessionStart.current) / 1000);
        track('session_ended', { duration_seconds: durationSeconds });
      } else if (document.visibilityState === 'visible') {
        sessionStart.current = Date.now();
        sessionStarted({ resumed: true });
        // A resume can cross a calendar-day boundary → re-check retention.
        trackRetention(useAppStore.getState().user?.joinedAt);
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
      return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }
  }, []);

  return (
    <ThemeContext.Provider value={colorScheme}>
      <SafeAreaProvider>
        <ErrorBoundary>
          <ToastProvider>
            <AppNavigator />
            {hasOnboarded && <ConsentBanner />}
            {hasOnboarded && <LogReminder />}
          </ToastProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

const styles = StyleSheet.create({
  error: {
    flex: 1,
    backgroundColor: '#080810',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#EEEEF8',
    marginBottom: 10,
    textAlign: 'center',
  },
  errorMsg: {
    fontSize: 14,
    color: '#8888AA',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 340,
  },
  reloadBtn: {
    backgroundColor: '#7C3AED',
    borderRadius: 999,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  reloadText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  devDetails: {
    marginTop: 28,
    alignSelf: 'stretch',
  },
  errorStack: {
    fontSize: 11,
    color: '#7070A0',
    fontFamily: 'monospace',
    lineHeight: 16,
    marginBottom: 8,
  },
});
