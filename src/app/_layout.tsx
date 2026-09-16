import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { Suspense, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, useColorScheme } from 'react-native';

import { HAS_ONBOARDED_KEY } from '@/app/onboarding';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/database';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const segments = useSegments();
  const [gateChecked, setGateChecked] = useState(false);
  const gateRan = useRef(false);

  useEffect(() => {
    // First-launch gate: route to onboarding unless completed before.
    // Runs once; the native splash stays up until the check finishes
    // so tabs never flash underneath on a fresh install.
    if (gateRan.current) return;
    gateRan.current = true;
    (async () => {
      try {
        const onboarded = await AsyncStorage.getItem(HAS_ONBOARDED_KEY);
        if (onboarded !== 'true' && segments[0] !== 'onboarding') {
          router.replace('/onboarding');
        }
      } catch {
        // Storage unreadable — let the user into the app.
      } finally {
        setGateChecked(true);
        SplashScreen.hideAsync().catch(() => undefined);
      }
    })();
  }, [router, segments]);

  if (!gateChecked) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Suspense fallback={<ActivityIndicator style={{ flex: 1 }} />}>
        <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="deck/[id]" options={{ headerShown: true }} />
          </Stack>
        </SQLiteProvider>
      </Suspense>
    </ThemeProvider>
  );
}
