import '@/i18n';

import { Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold } from '@expo-google-fonts/montserrat';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { DialogsProvider } from '@/components/Dialogs';
import { PlanetLayer } from '@/components/explore/PlanetLayer';
import { NotificationBell } from '@/components/NotificationBell';
import { OnlyWhenFocused } from '@/components/OnlyWhenFocused';
import { restoreLanguage } from '@/i18n';
import { colors, navigationTheme } from '@/theme';
import { applyWebStyles } from '@/utils/webStyles';

// Web: barras de desplazamiento con los colores de la app.
applyWebStyles();

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
      // Solo se ve la pantalla de adelante (las de atrás quedarían superpuestas: son transparentes).
      screenLayout={({ navigation, children }) => <OnlyWhenFocused navigation={navigation}>{children}</OnlyWhenFocused>}
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        // Campanita de avisos arriba a la derecha en todas las pantallas (como en las redes sociales).
        headerRight: () => <NotificationBell />,
        contentStyle: { backgroundColor: 'transparent' },
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
      <Stack.Screen name="events/track/[id]" options={{ title: t('track.title') }} />
      <Stack.Screen name="news/[slug]" options={{ title: t('tabs.news') }} />
      <Stack.Screen name="marinas/[slug]" options={{ title: t('marinas.title') }} />
      <Stack.Screen name="marinas/request/[slug]" options={{ title: t('berth.title') }} />
      <Stack.Screen name="marinas/requests" options={{ title: t('berth.myRequests') }} />
      <Stack.Screen name="professionals/[slug]" options={{ title: t('professionals.title') }} />
      <Stack.Screen name="professionals/quote/[slug]" options={{ title: t('quotes.title') }} />
      <Stack.Screen name="professionals/quotes" options={{ title: t('quotes.myQuotes') }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  // Tipografía de la marca. Si falla la descarga se sigue con la del sistema.
  const [fontsLoaded, fontError] = useFonts({ Montserrat_600SemiBold, Montserrat_700Bold, Montserrat_800ExtraBold });

  useEffect(() => {
    restoreLanguage().finally(() => setReady(true));
  }, []);

  if (!ready || (!fontsLoaded && !fontError)) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <ThemeProvider value={navigationTheme}>
      <AuthProvider>
        <DialogsProvider>
          <StatusBar style="light" />
          {/* El planeta se monta una vez y se ve siempre: encima en Explorar, de fondo en el resto. */}
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <PlanetLayer />
            <View style={{ flex: 1, zIndex: 1 }}>
              <RootStack />
            </View>
          </View>
        </DialogsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
