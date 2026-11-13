import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/Brand';
import { NotificationBell } from '@/components/NotificationBell';
import { colors, fonts, radius, spacing } from '@/theme';

/** Desde este ancho, en la web, la navegación va en una barra arriba (como un sitio) y la home se arma en tres columnas. */
export const WIDE_WEB_MIN = 1024;

export function useWideWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_WEB_MIN;
}

/** Quienes escuchan el logo: la home vuelve a su estado inicial (planeta, tarjetas y botón Explorar). */
const homeResetListeners = new Set<() => void>();
export function onHomeReset(listener: () => void) {
  homeResetListeners.add(listener);
  return () => {
    homeResetListeners.delete(listener);
  };
}

/** Secciones de la barra, en orden. `name` es la ruta dentro de (tabs). */
const ITEMS = [
  { name: 'index', label: 'nav.explore' },
  { name: 'races', label: 'nav.races' },
  { name: 'marinas', label: 'nav.marinas' },
  { name: 'professionals', label: 'nav.professionals' },
  { name: 'news', label: 'nav.news' },
  { name: 'weather', label: 'nav.weather' },
  { name: 'learning', label: 'nav.learning' },
] as const;

type Props = {
  state: { index: number; routes: { name: string; key: string }[] };
  navigateToTab: (routeKey: string) => void;
};

/** Barra de navegación de la web ancha: logo, secciones, buscar, avisos y perfil. Reemplaza la barra de pestañas de abajo. */
export function TopBar({ state, navigateToTab }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const current = state.routes[state.index]?.name;
  const go = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (route) navigateToTab(route.key);
  };
  const { width } = useWindowDimensions();
  const roomy = width >= 1200;

  return (
    <View style={styles.bar} accessibilityRole="navigation">
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('nav.home')}
        onPress={() => {
          go('index');
          homeResetListeners.forEach((listener) => listener());
        }}
      >
        <Brand size={roomy ? 22 : 19} />
      </Pressable>
      <View style={styles.divider} />

      <View style={[styles.items, { gap: roomy ? spacing.xs : 0 }]}>
        {ITEMS.map((item) => {
          const active = current === item.name;
          return (
            <Pressable
              key={item.name}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              onPress={() => go(item.name)}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.item,
                { paddingHorizontal: roomy ? spacing.md : 10 },
                hovered && !active && styles.itemHover,
              ]}
            >
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{t(item.label)}</Text>
              <View style={[styles.underline, active && styles.underlineActive]} />
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('nav.search')} onPress={() => go('races')} style={styles.iconButton} hitSlop={8}>
          <Ionicons name="search" size={22} color={colors.text} />
        </Pressable>
        <NotificationBell />
        {user ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={t('tabs.profile')}
            onPress={() => go('profile')}
            style={[styles.avatar, current === 'profile' && { borderColor: colors.primary }]}
          >
            <Text style={styles.avatarText}>
              {`${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase() || user.email[0].toUpperCase()}
            </Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => router.push('/login')} style={styles.login}>
            <Text style={styles.loginText}>{t('profile.login')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 68,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(8,16,36,0.96)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  divider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xl,
  },
  items: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
  },
  item: { justifyContent: 'center', alignItems: 'center' },
  itemHover: { opacity: 0.85 },
  itemText: {
    color: colors.textMuted,
    fontSize: 15,
    fontFamily: fonts.semibold,
  },
  itemTextActive: { color: colors.text },
  underline: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  underlineActive: { backgroundColor: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center' },
  iconButton: { paddingHorizontal: spacing.sm },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.text, fontFamily: fonts.heading, fontSize: 14 },
  login: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  loginText: { color: '#fff', fontFamily: fonts.semibold, fontSize: 14 },
});
