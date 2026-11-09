import '@/i18n';

import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { DialogsProvider } from '@/components/Dialogs';
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
      <Stack.Screen name="profile/edit" options={{ title: t('editProfile.title') }} />
      <Stack.Screen name="profile/result" options={{ title: t('result.newTitle') }} />
      <Stack.Screen name="boats/[id]" options={{ title: t('boats.detailTitle') }} />
      <Stack.Screen name="boats/edit" options={{ title: t('boats.newTitle') }} />
      <Stack.Screen name="results/[id]" options={{ title: t('result.detailTitle') }} />
      <Stack.Screen name="events/[slug]" options={{ title: t('event.title') }} />
      <Stack.Screen name="events/gallery/[slug]" options={{ title: t('gallery.title') }} />
      <Stack.Screen name="notifications" options={{ title: t('notifications.title') }} />
      <Stack.Screen name="news/[slug]" options={{ title: t('tabs.news') }} />
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
        <DialogsProvider>
          <StatusBar style="light" />
          <RootStack />
        </DialogsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
