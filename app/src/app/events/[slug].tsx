import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getEvent, setFollowing, type EventDetail } from '@/api/events';
import { ApiError } from '@/api/client';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { EventGallery } from '@/components/EventGallery';
import { EventResults, EventSailors } from '@/components/EventResults';
import { NewsRow } from '@/components/NewsCards';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/utils/navigation';

const parseDate = (value: string) => new Date(`${value}T12:00:00`);

function daysUntil(value: string) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((parseDate(value).getTime() - today.getTime()) / 86_400_000);
}

export default function EventScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const classes = useBoatClasses();
  const { user } = useAuth();
  const { notify } = useDialogs();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [following, setFollowingState] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    getEvent(slug).then(setEvent).catch(setError);
  }, [slug]);

  useEffect(load, [load]);

  async function toggleFollow() {
    if (!event) return;
    if (!user) {
      router.push({ pathname: '/login', params: { next: `/events/${event.slug}` } });
      return;
    }
    const next = !(following ?? event.is_following);
    setFollowBusy(true);
    try {
      const result = await setFollowing(event.slug, next);
      setFollowingState(result.following);
      setEvent({ ...event, is_following: result.following, followers_count: result.followers_count });
      notify(t(result.following ? 'event.followed' : 'event.unfollowed'));
    } catch (e) {
      notify(errorMessage(e, t));
    } finally {
      setFollowBusy(false);
    }
  }

  // El encabezado (y la pestaña del navegador, en la web) muestra el nombre de la regata.
  useLayoutEffect(() => {
    if (event) navigation.setOptions({ title: event.name });
  }, [navigation, event]);

  if (!event) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{notFound ? t('event.notFound') : errorMessage(error, t)}</Text>
            <Button
              title={notFound ? t('event.backToCalendar') : t('profile.retry')}
              variant="ghost"
              onPress={notFound ? () => goBack('/races') : load}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  const longDate = (value: string) =>
    parseDate(value).toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const remaining = daysUntil(event.start_date);
  const statusLabel =
    event.status === 'live'
      ? t('event.live')
      : event.status === 'finished'
        ? t('event.finished')
        : remaining === 0
          ? t('event.today')
          : t('event.inDays', { count: remaining });
  const isFollowing = following ?? event.is_following;
  const hasCoords = event.latitude !== null && event.longitude !== null;
  const mapUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${event.latitude},${event.longitude}` : null;
  // Sede, ciudad, región y país, sin repetir (ej. ciudad y región "Sídney").
  const place = [event.venue, event.city, event.region, event.country_name].filter(
    (line, index, all): line is string => !!line && all.findIndex((other) => other?.toLowerCase() === line.toLowerCase()) === index,
  );

  return (
    <Screen>
      <Card style={styles.hero}>
        <View style={styles.badges}>
          <Text style={styles.typeTag}>{t(`calendar.types.${event.event_type}`)}</Text>
          <View style={[styles.status, event.status === 'live' && styles.statusLive, event.status === 'finished' && styles.statusDone]}>
            <Text style={[styles.statusText, event.status === 'live' && { color: '#fff' }]}>{statusLabel}</Text>
          </View>
        </View>
        <Text style={styles.name}>{event.name}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>{[event.city, event.country_name].filter(Boolean).join(' · ')}</Text>
        <View style={styles.followRow}>
          <Pressable
            accessibilityRole="button"
            aria-pressed={isFollowing}
            disabled={followBusy}
            onPress={toggleFollow}
            style={({ pressed }) => [styles.follow, isFollowing && styles.following, (pressed || followBusy) && { opacity: 0.7 }]}
          >
            <Ionicons name={isFollowing ? 'star' : 'star-outline'} size={18} color={isFollowing ? '#fff' : colors.primary} />
            <Text style={[styles.followText, isFollowing && { color: '#fff' }]}>{isFollowing ? t('event.following') : t('event.follow')}</Text>
          </Pressable>
          <Text style={[typography.caption, { flex: 1 }]}>{isFollowing ? t('event.followingHint') : t('event.followHint')}</Text>
        </View>
      </Card>

      {event.status === 'finished' ? (
        <>
          <EventResults event={event} />
          <EventSailors sailors={event.msail_sailors} />
        </>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('event.dates')}</Text>
        {hasCoords && (event.status === 'live' || (event.status === 'upcoming' && remaining <= 7)) ? (
          <Button
            title={t('weather.seeForecast')}
            variant="secondary"
            onPress={() => router.push({ pathname: '/weather', params: { place: `event:${event.slug}` } })}
          />
        ) : null}
        {event.end_date ? (
          <>
            <InfoRow icon="calendar-outline" label={t('event.start')} value={longDate(event.start_date)} />
            <InfoRow icon="flag-outline" label={t('event.end')} value={longDate(event.end_date)} />
            {event.duration_days ? <Text style={typography.caption}>{t('event.days', { count: event.duration_days })}</Text> : null}
          </>
        ) : (
          <InfoRow icon="flag-outline" label={t('event.startOnly')} value={longDate(event.start_date)} />
        )}
      </Card>

      {event.entry_url && event.status !== 'finished' ? (
        <Card style={styles.entry}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[typography.body, { fontWeight: '700' }]}>{event.entries_open ? t('event.entriesOpen') : t('event.entriesClosed')}</Text>
            {event.entries_open ? (
              <Text style={typography.caption}>{t('event.entriesUntil', { date: longDate(event.entry_deadline ?? event.start_date) })}</Text>
            ) : null}
          </View>
          {event.entries_open ? <Button title={t('event.enter')} onPress={() => Linking.openURL(event.entry_url)} /> : null}
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('event.location')}</Text>
        {place.map((line, index) => (
          <Text key={line} style={index === 0 ? [typography.body, { fontWeight: '700' }] : typography.body}>
            {line}
          </Text>
        ))}
        {mapUrl ? <Button title={t('event.openMap')} variant="secondary" onPress={() => Linking.openURL(mapUrl)} /> : null}
      </Card>

      {event.organizer ? (
        <Card>
          <Text style={typography.label}>{t('event.organizer')}</Text>
          <View style={styles.organizer}>
            <View style={styles.organizerIcon}>
              <Ionicons name={event.organizer_club ? 'people' : 'ribbon-outline'} size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[typography.body, { fontWeight: '700' }]}>{event.organizer}</Text>
              {event.organizer_club?.city ? <Text style={typography.caption}>{event.organizer_club.city}</Text> : null}
            </View>
          </View>
          {event.organizer_club?.website ? (
            <LinkRow label={event.organizer_club.website.replace(/^https?:\/\//, '').replace(/\/$/, '')} url={event.organizer_club.website} />
          ) : null}
        </Card>
      ) : null}

      {event.categories.length > 0 || event.boat_classes.length > 0 ? (
        <Card>
          <Text style={typography.label}>{event.categories.length > 0 ? t('event.categories') : t('event.classes')}</Text>
          {event.categories.length > 0 ? (
            event.categories.map((category) => (
              <View key={category.name} style={styles.category}>
                <Ionicons name="trophy-outline" size={18} color={colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={typography.body}>{category.name}</Text>
                  {category.notes ? <Text style={typography.caption}>{category.notes}</Text> : null}
                </View>
              </View>
            ))
          ) : (
            <View style={styles.tags}>
              {event.boat_classes.map((slug) => (
                <Text key={slug} style={styles.classTag}>
                  {className(classes, slug)}
                </Text>
              ))}
            </View>
          )}
        </Card>
      ) : null}

      {event.status !== 'finished' ? (
        <>
          <EventResults event={event} />
          <EventSailors sailors={event.msail_sailors} />
        </>
      ) : null}

      {event.documents.length > 0 ? (
        <Card>
          <Text style={typography.label}>{t('event.documents')}</Text>
          {event.documents.map((document) => (
            <Pressable
              key={document.id}
              accessibilityRole="link"
              accessibilityHint={t('event.openDocument')}
              onPress={() => Linking.openURL(document.url)}
              style={({ pressed }) => [styles.document, pressed && { opacity: 0.7 }]}
            >
              <View style={styles.pdfIcon}>
                <Ionicons name="document-text-outline" size={20} color={colors.primary} />
                <Text style={styles.pdfText}>PDF</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[typography.body, { fontWeight: '600' }]}>{document.title}</Text>
                <Text style={typography.caption}>
                  {[
                    t(`event.documentKinds.${document.kind}`),
                    document.source === 'link' ? t('event.externalLink') : document.size_kb ? `${document.size_kb} KB` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name={document.source === 'link' ? 'open-outline' : 'download-outline'} size={18} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {event.news_count > 0 ? (
        <Card>
          <Text style={typography.label}>{t('event.news', { count: event.news_count })}</Text>
          <View>
            {event.news.map((article) => (
              <NewsRow key={article.id} article={article} />
            ))}
          </View>
          {event.news_count > event.news.length ? (
            <Button
              title={t('event.allNews', { count: event.news_count })}
              variant="secondary"
              onPress={() => router.push({ pathname: '/news', params: { event: event.slug } })}
            />
          ) : null}
        </Card>
      ) : null}

      {/* Track de la carrera: la repetición con el GPS de cada barco (lo que Miguel llama trackdays). */}
      {event.tracks?.length ? (
        <Card>
          <Text style={typography.label}>{t('track.section')}</Text>
          {event.tracks.map((race) => (
            <Pressable
              key={race.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/events/track/[id]', params: { id: String(race.id) } })}
              style={({ pressed }) => [styles.proRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="navigate-circle-outline" size={22} color="#2fd4e0" />
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: '700' }]}>{race.name}</Text>
                <Text style={typography.caption}>
                  {t('track.boats', { count: race.boats })}
                  {race.is_demo ? ` · ${t('track.demoShort')}` : ''}
                </Text>
              </View>
              <Text style={styles.trackLink}>{t('track.watch')}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      {event.professionals?.items.length ? (
        <Card>
          <Text style={typography.label}>{t(event.professionals.linked ? 'event.professionals' : 'event.professionalsNearby')}</Text>
          {event.professionals.items.map((pro) => (
            <Pressable
              key={pro.id}
              accessibilityRole="link"
              onPress={() => router.push({ pathname: '/professionals/[slug]', params: { slug: pro.slug } })}
              style={({ pressed }) => [styles.proRow, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name="construct-outline" size={18} color={colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: '700' }]}>{pro.name}</Text>
                <Text style={typography.caption} numberOfLines={1}>
                  {[
                    pro.specialties.map((s) => s.name).join(' · '),
                    pro.city,
                    pro.distance_km !== undefined ? t('event.km', { km: pro.distance_km }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          <Button title={t('event.allProfessionals')} variant="secondary" onPress={() => router.navigate('/professionals')} />
        </Card>
      ) : null}

      {event.media_count > 0 ? (
        <Card>
          <Text style={typography.label}>{t('gallery.section', { count: event.media_count })}</Text>
          <EventGallery media={event.media_preview} />
          {event.media_count > event.media_preview.length ? (
            <Button
              title={t('gallery.seeAll', { count: event.media_count })}
              variant="secondary"
              onPress={() => router.push({ pathname: '/events/gallery/[slug]', params: { slug: event.slug } })}
            />
          ) : null}
        </Card>
      ) : null}

      {event.description ? (
        <Card>
          <Text style={typography.label}>{t('event.about')}</Text>
          <Text style={typography.body}>{event.description}</Text>
        </Card>
      ) : null}

      {event.website ? <Button title={t('event.website')} onPress={() => Linking.openURL(event.website)} /> : null}
    </Screen>
  );
}

function InfoRow({ icon, label, value }: { icon: ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={18} color={colors.primary} />
      <Text style={[typography.caption, { width: 64 }]}>{label}</Text>
      <Text style={[typography.body, { flex: 1 }]}>{value.charAt(0).toUpperCase() + value.slice(1)}</Text>
    </View>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url)} style={styles.link} hitSlop={6}>
      <Ionicons name="open-outline" size={16} color={colors.primary} />
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trackLink: { color: '#2fd4e0', fontWeight: '700', fontSize: 13 },
  proRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  hero: { gap: spacing.sm, paddingVertical: spacing.xl },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  follow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  following: { backgroundColor: colors.primary },
  followText: { color: colors.primary, fontWeight: '700' },
  badges: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  typeTag: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  status: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.surfaceRaised },
  statusLive: { backgroundColor: colors.live },
  statusDone: { backgroundColor: colors.background },
  statusText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  name: { ...typography.title, fontSize: 26, lineHeight: 32 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 2 },
  organizer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  organizerIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap', borderColor: colors.primary },
  document: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pdfIcon: {
    width: 44,
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfText: { color: colors.primary, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  linkText: { color: colors.primary, fontWeight: '600' },
  category: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  classTag: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
