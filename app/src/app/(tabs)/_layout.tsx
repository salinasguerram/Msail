import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, type ColorValue } from 'react-native';

import { Brand } from '@/components/Brand';
import { NotificationBell } from '@/components/NotificationBell';
import { TopBar, useWideWeb } from '@/components/TopBar';
import { colors, spacing } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName, focusedName: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color as string} size={size} />
  );
}

/** Flecha que vuelve a Explorar. La usan todas las secciones para que se vean y naveguen igual. */
function BackToHome() {
  const { t } = useTranslation();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.backHome')}
      hitSlop={12}
      onPress={() => router.navigate('/')}
      style={{ paddingHorizontal: spacing.lg }}
    >
      <Ionicons name="arrow-back" size={24} color={colors.text} />
    </Pressable>
  );
}

const section = { headerLeft: () => <BackToHome />, headerRight: () => <NotificationBell /> };
// Secciones que se abren desde Explorar: comparten encabezado y barra inferior, pero no tienen pestaña propia.
// (Ocultar con `href: null` en esta versión también bloquea la navegación: se oculta solo el botón.)
const hidden = { ...section, tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

export default function TabsLayout() {
  const { t } = useTranslation();
  // Web ancha: barra de navegación arriba (logo y secciones) en lugar de pestañas abajo y encabezado por sección.
  const wide = useWideWeb();
  return (
    <Tabs
      tabBar={wide ? (props) => <TopBar {...props} /> : undefined}
      screenOptions={{
        ...(wide && { tabBarPosition: 'top' as const, headerShown: false }),
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        // En el encabezado va la marca; la sección en la que estás se ve resaltada en la barra de abajo.
        headerTitle: () => <Brand size={16} />,
        headerTitleAlign: 'center',
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          // En la web la barra queda en 48 px y corta las etiquetas; en iOS/Android la altura la calcula el sistema.
          ...(Platform.OS === 'web' && { height: 64, paddingTop: 4, paddingBottom: 8 }),
        },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14, flexShrink: 0 },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.explore'), headerShown: false, tabBarIcon: tabIcon('globe-outline', 'globe') }}
      />
      <Tabs.Screen
        name="races"
        options={{ ...section, title: t('tabs.races'), tabBarIcon: tabIcon('trophy-outline', 'trophy') }}
      />
      <Tabs.Screen
        name="news"
        options={{ ...section, title: t('tabs.news'), tabBarIcon: tabIcon('newspaper-outline', 'newspaper') }}
      />
      <Tabs.Screen
        name="weather"
        options={{ ...section, title: t('tabs.weather'), tabBarIcon: tabIcon('partly-sunny-outline', 'partly-sunny') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
      <Tabs.Screen name="marinas" options={{ ...hidden, title: t('sections.marinas.title') }} />
      <Tabs.Screen name="professionals" options={{ ...hidden, title: t('sections.professionals.title') }} />
      <Tabs.Screen name="learning" options={{ ...hidden, title: t('sections.learning.title') }} />
    </Tabs>
  );
}
