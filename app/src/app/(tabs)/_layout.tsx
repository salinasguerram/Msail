import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, type ColorValue } from 'react-native';

import { colors } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName, focusedName: IconName) {
  return ({ color, size, focused }: { color: ColorValue; size: number; focused: boolean }) => (
    <Ionicons name={focused ? focusedName : name} color={color as string} size={size} />
  );
}

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        headerShadowVisible: false,
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
      <Tabs.Screen name="races" options={{ title: t('tabs.races'), tabBarIcon: tabIcon('trophy-outline', 'trophy') }} />
      <Tabs.Screen
        name="news"
        options={{ title: t('tabs.news'), tabBarIcon: tabIcon('newspaper-outline', 'newspaper') }}
      />
      <Tabs.Screen
        name="weather"
        options={{ title: t('tabs.weather'), tabBarIcon: tabIcon('partly-sunny-outline', 'partly-sunny') }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: tabIcon('person-circle-outline', 'person-circle') }}
      />
    </Tabs>
  );
}
