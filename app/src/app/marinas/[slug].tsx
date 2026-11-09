import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import type { EventMedia } from '@/api/events';
import { getMarina, MARINA_SERVICES, type MarinaDetail } from '@/api/marinas';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EventGallery } from '@/components/EventGallery';
import { MarinaPrices } from '@/components/MarinaPrices';
import { MarinaServices } from '@/components/MarinaServices';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/utils/navigation';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Ficha de una marina: fotos, medidas, servicios, contacto y ubicación. */
export default function MarinaScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  // ?length=12 llega desde el listado si se filtró por eslora: precarga la estimación del precio.
  const { slug, length } = useLocalSearchParams<{ slug: string; length?: string }>();
  const [marina, setMarina] = useState<MarinaDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchMarina = useCallback(() => getMarina(slug).then(setMarina).catch(setError), [slug]);

  useEffect(() => {
    fetchMarina();
  }, [fetchMarina]);

  useLayoutEffect(() => {
    if (marina) navigation.setOptions({ title: marina.name });
  }, [navigation, marina]);

  if (!marina) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{notFound ? t('marinas.notFound') : errorMessage(error, t)}</Text>
            <Button
              title={notFound ? t('marinas.backToList') : t('profile.retry')}
              variant="ghost"
              onPress={
                notFound
                  ? () => goBack('/marinas')
                  : () => {
                      setError(null);
                      fetchMarina();
                    }
              }
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xxl }} />
        )}
      </Screen>
    );
  }

  // La galería de regatas sirve también para las fotos de la marina.
  const photos: EventMedia[] = marina.photos.map((p) => ({ ...p, kind: 'photo', video: null }));
  const missing = MARINA_SERVICES.filter((s) => !marina.services.includes(s));
  const hasCoords = marina.latitude !== null && marina.longitude !== null;
  const mapUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${marina.latitude},${marina.longitude}` : null;
  const whatsapp = marina.whatsapp.replace(/\D/g, '');
  const contacts: { icon: IconName; label: string; url: string }[] = [
    marina.phone ? { icon: 'call-outline', label: marina.phone, url: `tel:${marina.phone.replace(/\s/g, '')}` } : null,
    whatsapp ? { icon: 'logo-whatsapp', label: t('marinas.whatsapp'), url: `https://wa.me/${whatsapp}` } : null,
    marina.email ? { icon: 'mail-outline', label: marina.email, url: `mailto:${marina.email}` } : null,
    marina.website
      ? { icon: 'globe-outline', label: marina.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: marina.website }
      : null,
  ].filter((c): c is { icon: IconName; label: string; url: string } => c !== null);

  return (
    <Screen>
      <Card style={styles.hero}>
        <Text style={styles.name}>{marina.name}</Text>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {[marina.city, marina.region, marina.country_name]
            .filter((p, i, all): p is string => !!p && all.indexOf(p) === i)
            .join(' · ')}
        </Text>
        {!marina.verified ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={[typography.caption, { flex: 1 }]}>{t('marinas.unverified')}</Text>
          </View>
        ) : null}
      </Card>

      {photos.length ? (
        <Card>
          <Text style={typography.label}>{t('marinas.photos')}</Text>
          <EventGallery media={photos} />
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('marinas.capacity')}</Text>
        <View style={styles.stats}>
          <Stat icon="resize-outline" label={t('marinas.maxLength')} value={marina.max_length_m ? `${marina.max_length_m} m` : null} />
          <Stat icon="arrow-down-outline" label={t('marinas.maxDraft')} value={marina.max_draft_m ? `${marina.max_draft_m} m` : null} />
          <Stat icon="grid-outline" label={t('marinas.berths')} value={marina.berths ? String(marina.berths) : null} />
        </View>
      </Card>

      <MarinaPrices marina={marina} initialLength={length} />

      <Card>
        <Text style={typography.label}>{t('marinas.servicesTitle')}</Text>
        {marina.services.length ? (
          <MarinaServices services={marina.services} />
        ) : (
          <Text style={[typography.body, { color: colors.textMuted }]}>{t('marinas.noServices')}</Text>
        )}
        {marina.services.length && missing.length ? (
          <Text style={typography.caption}>
            {t('marinas.notInformed', { list: missing.map((s) => t(`marinas.services.${s}`)).join(', ') })}
          </Text>
        ) : null}
      </Card>

      {contacts.length || marina.vhf_channel ? (
        <Card>
          <Text style={typography.label}>{t('marinas.contact')}</Text>
          {contacts.map((contact) => (
            <Pressable
              key={contact.url}
              accessibilityRole="link"
              onPress={() => Linking.openURL(contact.url)}
              style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name={contact.icon} size={20} color={colors.primary} />
              <Text style={[typography.body, { flex: 1 }]}>{contact.label}</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
          {marina.vhf_channel ? (
            <View style={styles.contact}>
              <Ionicons name="radio-outline" size={20} color={colors.primary} />
              <Text style={typography.body}>{t('marinas.vhf', { channel: marina.vhf_channel })}</Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('event.location')}</Text>
        {marina.address ? <Text style={typography.body}>{marina.address}</Text> : null}
        <Text style={typography.body}>{[marina.city, marina.country_name].filter(Boolean).join(', ')}</Text>
        {mapUrl ? <Button title={t('event.openMap')} variant="secondary" onPress={() => Linking.openURL(mapUrl)} /> : null}
      </Card>

      {marina.description ? (
        <Card>
          <Text style={typography.label}>{t('marinas.about')}</Text>
          <Text style={typography.body}>{marina.description}</Text>
        </Card>
      ) : null}
    </Screen>
  );
}

function Stat({ icon, label, value }: { icon: IconName; label: string; value: string | null }) {
  const { t } = useTranslation();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={[styles.statValue, !value && { color: colors.textMuted, fontSize: 13 }]}>{value ?? t('marinas.notInformedShort')}</Text>
      <Text style={typography.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.sm, paddingVertical: spacing.xl },
  name: { ...typography.title, fontSize: 26, lineHeight: 32 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceRaised,
  },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
