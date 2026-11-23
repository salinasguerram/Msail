import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getMsailing, type MsailingPage, type MsailingSection, type MsailingVideo } from '@/api/msailing';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { SailsMark } from '@/components/Brand';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { PremiumBadge, PremiumEntry } from '@/components/Premium';
import { Screen } from '@/components/Screen';
import { colors, fonts, radius, spacing, typography } from '@/theme';
import { formatMoney } from '@/utils/marinaRates';

type Tab = 'about' | 'school' | 'videos' | 'foundation';
const TABS: { key: Tab; icon: ComponentProps<typeof Ionicons>['name'] }[] = [
  { key: 'about', icon: 'information-circle-outline' },
  { key: 'school', icon: 'school-outline' },
  { key: 'videos', icon: 'play-circle-outline' },
  { key: 'foundation', icon: 'heart-outline' },
];
const isTab = (value: string | undefined): value is Tab => TABS.some((tab) => tab.key === value);

/**
 * MSailing: la página institucional de la marca. Quiénes somos, Escuela de vela y formación, Videos y tips,
 * y La Fundación (a quién se apoya y en qué se usan los fondos). Los textos se editan desde el panel.
 * Acepta ?section=about|school|videos|foundation.
 */
export default function MsailingScreen() {
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ section?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(params.section) ? params.section : 'about');
  const [page, setPage] = useState<MsailingPage | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Si se vuelve a entrar con otra sección (ej. desde Formación), se muestra esa.
  const [lastParam, setLastParam] = useState(params.section);
  if (params.section !== lastParam) {
    setLastParam(params.section);
    if (isTab(params.section)) setTab(params.section);
  }

  // El estado se toca solo cuando llega la respuesta. Se recarga al volver (ej. después de hacerse Premium).
  const fetchPage = useCallback(() => {
    getMsailing().then(setPage).catch(setError);
  }, []);
  useFocusEffect(fetchPage);
  const load = () => {
    setError(null);
    fetchPage();
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <SailsMark size={44} />
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>MSailing</Text>
          <Text style={typography.caption}>{t('msailing.tagline')}</Text>
        </View>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map(({ key, icon }) => {
          const active = key === tab;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onPress={() => setTab(key)}
              style={[styles.tab, active && styles.tabActive]}
            >
              <Ionicons name={icon} size={16} color={active ? '#fff' : colors.textMuted} />
              <Text style={[styles.tabText, active && { color: '#fff' }]}>{t(`msailing.tabs.${key}`)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {error ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
          <Button title={t('profile.retry')} variant="ghost" onPress={load} />
        </Card>
      ) : !page ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : tab === 'videos' ? (
        <Videos videos={page.videos} />
      ) : tab === 'foundation' ? (
        <Foundation page={page} />
      ) : (
        <>
          <SectionCard section={page.sections[tab]} />
          {tab === 'school' ? <Button title={t('msailing.schoolVideos')} variant="secondary" onPress={() => setTab('videos')} /> : null}
        </>
      )}
    </Screen>
  );
}

function SectionCard({ section }: { section?: MsailingSection }) {
  const { t } = useTranslation();
  if (!section) {
    return (
      <Card>
        <Text style={typography.caption}>{t('msailing.empty')}</Text>
      </Card>
    );
  }
  return (
    <Card style={{ gap: spacing.md }}>
      {section.image ? <Image source={{ uri: section.image }} style={styles.image} resizeMode="cover" /> : null}
      <Text style={styles.title}>{section.title}</Text>
      {section.body
        .split(/\n\s*\n/)
        .filter((p) => p.trim())
        .map((paragraph, i) => (
          <Text key={i} style={typography.body}>
            {paragraph.trim()}
          </Text>
        ))}
      {section.cta_label && section.cta_url ? <Button title={section.cta_label} onPress={() => Linking.openURL(section.cta_url)} /> : null}
    </Card>
  );
}

type Access = 'all' | 'free' | 'premium';
const ACCESS: Access[] = ['all', 'free', 'premium'];

/** Videos, tips y lecciones: se filtran por clase de embarcación y por gratis / Premium. */
function Videos({ videos }: { videos: MsailingVideo[] }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const classes = useBoatClasses();
  const [boatClass, setBoatClass] = useState<string | null>(null);
  const [access, setAccess] = useState<Access>('all');

  // Solo las clases que tienen contenido.
  const available = useMemo(() => [...new Set(videos.flatMap((v) => v.boat_classes))].sort(), [videos]);
  const shown = videos.filter(
    (v) =>
      (!boatClass || !v.boat_classes.length || v.boat_classes.includes(boatClass)) &&
      (access === 'all' || (access === 'premium') === v.is_premium),
  );
  const lockedCount = videos.filter((v) => v.locked).length;

  if (!videos.length) {
    return (
      <Card style={{ alignItems: 'center', gap: spacing.sm }}>
        <Ionicons name="play-circle-outline" size={36} color={colors.primary} />
        <Text style={[typography.body, { textAlign: 'center' }]}>{t('msailing.noVideos')}</Text>
      </Card>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      {lockedCount && !user?.is_premium ? (
        <PremiumEntry active={false} text={t('premium.unlockCount', { count: lockedCount })} />
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {[null, ...available].map((slug) => {
          const active = slug === boatClass;
          return (
            <Pressable
              key={slug ?? 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setBoatClass(slug)}
              style={[styles.chip, active && styles.tabActive]}
            >
              <Text style={[styles.chipText, active && { color: '#fff' }]}>{slug ? className(classes, slug) : t('msailing.allClasses')}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={styles.segment}>
        {ACCESS.map((key) => {
          const active = key === access;
          return (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setAccess(key)}
              style={[styles.segmentItem, active && styles.segmentActive]}
            >
              {key === 'premium' ? <Ionicons name="star" size={12} color={active ? colors.background : colors.warning} /> : null}
              <Text style={[styles.segmentText, active && { color: colors.background }]}>{t(`msailing.access.${key}`)}</Text>
            </Pressable>
          );
        })}
      </View>

      {!shown.length ? (
        <Card>
          <Text style={typography.caption}>{t('msailing.noMatches')}</Text>
        </Card>
      ) : null}

      {shown.map((video) => (
        <Pressable
          key={video.id}
          accessibilityRole="link"
          onPress={() => router.push({ pathname: '/learn/[id]', params: { id: String(video.id) } })}
          style={({ pressed }) => [styles.video, pressed && { borderColor: colors.primary }]}
        >
          <View style={styles.thumb}>
            {video.thumbnail ? <Image source={{ uri: video.thumbnail }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
            <Ionicons
              name={video.locked ? 'lock-closed' : video.kind === 'lesson' && !video.url ? 'reader-outline' : 'play'}
              size={26}
              color="#fff"
              style={styles.play}
            />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <View style={styles.videoMeta}>
              <Text style={styles.kind} numberOfLines={1}>
                {[
                  t(`msailing.kinds.${video.kind}`),
                  video.level !== 'all' ? t(`msailing.levels.${video.level}`) : null,
                  video.boat_classes.length ? video.boat_classes.map((slug) => className(classes, slug)).join(', ') : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {video.is_premium ? <PremiumBadge locked={video.locked} /> : null}
            </View>
            <Text style={[typography.body, { fontWeight: '700' }]} numberOfLines={2}>
              {video.title}
            </Text>
            {video.description ? (
              <Text style={typography.caption} numberOfLines={2}>
                {video.description}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function Foundation({ page }: { page: MsailingPage }) {
  const { t, i18n } = useTranslation();
  const { supports, totals, athletes } = page.foundation;
  return (
    <View style={{ gap: spacing.lg }}>
      <SectionCard section={page.sections.foundation} />

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{athletes}</Text>
          <Text style={typography.caption}>{t('msailing.athletes')}</Text>
        </View>
        {totals.map((total) => (
          <View key={total.currency} style={styles.stat}>
            <Text style={styles.statValue}>{formatMoney(total.total, total.currency, i18n.language)}</Text>
            <Text style={typography.caption}>{t('msailing.contributed')}</Text>
          </View>
        ))}
      </View>

      <Text style={typography.label}>{t('msailing.whereFundsGo')}</Text>
      {supports.length ? (
        supports.map((support) => (
          <Card key={support.id} style={{ gap: 4 }}>
            <View style={styles.supportHeader}>
              <Text style={[typography.body, { fontWeight: '700', flex: 1 }]}>{support.beneficiary}</Text>
              {support.amount !== null ? (
                <Text style={styles.amount}>{formatMoney(support.amount, support.currency, i18n.language)}</Text>
              ) : null}
            </View>
            <Text style={[typography.body, { color: colors.primary }]}>{support.purpose}</Text>
            {support.description ? <Text style={typography.caption}>{support.description}</Text> : null}
            <Text style={typography.caption}>
              {new Date(`${support.date}T12:00:00`).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' })}
            </Text>
          </Card>
        ))
      ) : (
        <Card>
          <Text style={typography.caption}>{t('msailing.noSupports')}</Text>
        </Card>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  brand: { color: colors.text, fontFamily: fonts.display, fontSize: 28, letterSpacing: 1 },
  tabs: { gap: spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 14 },
  title: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
  image: { width: '100%', height: 180, borderRadius: radius.md },
  video: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  thumb: {
    width: 120,
    height: 68,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  play: { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6 },
  kind: { flexShrink: 1, color: colors.primary, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  videoMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 },
  segment: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignSelf: 'flex-start',
  },
  segmentItem: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.warning },
  segmentText: { color: colors.textMuted, fontFamily: fonts.semibold, fontSize: 13 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  stat: {
    flexGrow: 1,
    minWidth: 120,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    gap: 2,
  },
  statValue: { color: colors.text, fontFamily: fonts.heading, fontSize: 22 },
  supportHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  amount: { color: colors.success, fontWeight: '700' },
});
