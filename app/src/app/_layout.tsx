import '@/i18n';

import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { restoreLanguage } from '@/i18n';
import { colors, navigationTheme } from '@/theme';

function RootStack() {
  const { t } = useTranslation();
  const { loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="marinas" options={{ title: t('sections.marinas.title') }} />
      <Stack.Screen name="professionals" options={{ title: t('sections.professionals.title') }} />
      <Stack.Screen name="learning" options={{ title: t('sections.learning.title') }} />
      <Stack.Screen name="profile/edit" options={{ title: t('editProfile.title') }} />
      <Stack.Screen name="profile/result" options={{ title: t('result.newTitle') }} />
      <Stack.Screen name="boats/[id]" options={{ title: t('boats.detailTitle') }} />
      <Stack.Screen name="boats/edit" options={{ title: t('boats.newTitle') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    restoreLanguage().finally(() => setReady(true));
  }, []);

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <StatusBar style="light" />
        <RootStack />
      </AuthProvider>
    </ThemeProvider>
  );
}
