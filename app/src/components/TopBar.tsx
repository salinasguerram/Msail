import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Brand } from '@/components/Brand';
import { setNavBarHeight } from '@/components/explore/navBar';
import { NotificationBell } from '@/components/NotificationBell';
import { colors, fonts, radius, spacing } from '@/theme';

/** Desde este ancho, en la web, la navegación va en una barra arriba (como un sitio) y la home se arma en tres columnas. */
export const WIDE_WEB_MIN = 1024;
/** Alto de la barra de arriba (web ancha). */
export const TOP_BAR_HEIGHT = 68;

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
// `also`: otras rutas que cuentan como esa sección (ej. Profesionales es parte de Servicios y amarres).
const ITEMS = [
  { name: 'index', label: 'nav.explore', also: [] },
  { name: 'races', label: 'nav.races', also: [] },
  { name: 'services', label: 'nav.services', also: ['marinas', 'professionals', 'crew'] },
  { name: 'weather', label: 'nav.weather', also: [] },
  { name: 'store', label: 'nav.store', also: [] },
  { name: 'ranking', label: 'nav.ranking', also: [] },
  { name: 'msailing', label: 'nav.msailing', also: ['learning'] },
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
  // Entre 1024 y 1200 px (notebooks chicas, iPad horizontal) todo más compacto, para que los ítems no se pisen con la lupa.

  return (
    <View style={[styles.bar, !roomy && { paddingHorizontal: spacing.lg }]} accessibilityRole="navigation" onLayout={(e) => setNavBarHeight(e.nativeEvent.layout.height)}>
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
      <View style={[styles.divider, !roomy && { marginHorizontal: spacing.md }]} />

      <View style={[styles.items, { gap: roomy ? spacing.xs : 0 }]}>
        {ITEMS.map((item) => {
          const active = current === item.name || (item.also as readonly string[]).includes(current ?? '');
          return (
            <Pressable
              key={item.name}
              accessibilityRole="link"
              accessibilityState={{ selected: active }}
              onPress={() => go(item.name)}
              style={({ hovered }: { hovered?: boolean }) => [
                styles.item,
                { paddingHorizontal: roomy ? spacing.md : 7 },
                hovered && !active && styles.itemHover,
              ]}
            >
              <Text style={[styles.itemText, !roomy && { fontSize: 14 }, active && styles.itemTextActive]} numberOfLines={1}>
                {t(item.label)}
              </Text>
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
    height: TOP_BAR_HEIGHT,
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
    minWidth: 0,
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
    left: 7,
    right: 7,
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
