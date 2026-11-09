import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState, type ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '@/api/client';
import type { EventMedia } from '@/api/events';
import { getProfessional, type ProfessionalDetail } from '@/api/professionals';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EventGallery } from '@/components/EventGallery';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { goBack } from '@/utils/navigation';
import { initialsOf } from '@/utils/text';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Contact = { key: string; icon: IconName; label: string; url: string; primary?: boolean };

/** Perfil de un profesional: especialidades, fotos de trabajos, zona y contacto directo. */
export default function ProfessionalScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const [professional, setProfessional] = useState<ProfessionalDetail | null>(null);
  const [error, setError] = useState<unknown>(null);

  const fetchProfessional = useCallback(() => getProfessional(slug).then(setProfessional).catch(setError), [slug]);

  useEffect(() => {
    fetchProfessional();
  }, [fetchProfessional]);

  useLayoutEffect(() => {
    if (professional) navigation.setOptions({ title: professional.name });
  }, [navigation, professional]);

  if (!professional) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={typography.body}>{notFound ? t('professionals.notFound') : errorMessage(error, t)}</Text>
            <Button
              title={notFound ? t('professionals.backToList') : t('profile.retry')}
              variant="ghost"
              onPress={
                notFound
                  ? () => goBack('/professionals')
                  : () => {
                      setError(null);
                      fetchProfessional();
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

  const p = professional;
  const whatsapp = p.whatsapp.replace(/\D/g, '');
  const greeting = encodeURIComponent(t('professionals.greeting', { name: p.name }));
  // WhatsApp y email primero: son los canales que pide el directorio.
  const contacts: Contact[] = [
    whatsapp
      ? { key: 'wa', icon: 'logo-whatsapp', label: t('professionals.whatsapp'), url: `https://wa.me/${whatsapp}?text=${greeting}`, primary: true }
      : null,
    p.email
      ? {
          key: 'mail',
          icon: 'mail-outline',
          label: p.email,
          url: `mailto:${p.email}?subject=${encodeURIComponent(t('professionals.emailSubject'))}`,
          primary: !whatsapp,
        }
      : null,
    p.phone ? { key: 'tel', icon: 'call-outline', label: p.phone, url: `tel:${p.phone.replace(/\s/g, '')}` } : null,
    p.website ? { key: 'web', icon: 'globe-outline', label: p.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: p.website } : null,
    p.instagram ? { key: 'ig', icon: 'logo-instagram', label: `@${p.instagram}`, url: `https://instagram.com/${p.instagram}` } : null,
  ].filter((c): c is Contact => c !== null);
  const primary = contacts.filter((c) => c.primary);
  const others = contacts.filter((c) => !c.primary);
  const photos: EventMedia[] = p.photos.map((photo) => ({ ...photo, kind: 'photo', video: null, credit: '' }));
  const hasCoords = p.latitude !== null && p.longitude !== null;
  const mapUrl = hasCoords ? `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}` : null;

  return (
    <Screen>
      <Card style={styles.hero}>
        <View style={styles.identity}>
          {p.logo ? (
            <Image source={{ uri: p.logo }} style={styles.logo} />
          ) : (
            <View style={[styles.logo, styles.placeholder]}>
              <Text style={styles.initials}>{initialsOf(p.name)}</Text>
            </View>
          )}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={[typography.body, { color: colors.textMuted }]}>{[p.city, p.country_name].filter(Boolean).join(' · ')}</Text>
          </View>
        </View>
        {p.headline ? <Text style={[typography.body, { fontWeight: '600' }]}>{p.headline}</Text> : null}
        <View style={styles.tags}>
          {p.specialties.map((specialty) => (
            <View key={specialty.slug} style={styles.tag}>
              <Ionicons name={(specialty.icon || 'construct-outline') as IconName} size={14} color={colors.primary} />
              <Text style={styles.tagText}>{specialty.name}</Text>
            </View>
          ))}
        </View>
        {primary.map((contact) => (
          <Button key={contact.key} title={contact.label} onPress={() => Linking.openURL(contact.url)} />
        ))}
        {!p.verified ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={colors.warning} />
            <Text style={[typography.caption, { flex: 1 }]}>{t('professionals.unverified')}</Text>
          </View>
        ) : null}
      </Card>

      {photos.length ? (
        <Card>
          <Text style={typography.label}>{t('professionals.photos')}</Text>
          <EventGallery media={photos} />
        </Card>
      ) : null}

      {p.description ? (
        <Card>
          <Text style={typography.label}>{t('professionals.about')}</Text>
          <Text style={typography.body}>{p.description}</Text>
          {p.languages ? <Text style={typography.caption}>{t('professionals.languages', { list: p.languages })}</Text> : null}
        </Card>
      ) : null}

      {others.length ? (
        <Card>
          <Text style={typography.label}>{t('marinas.contact')}</Text>
          {others.map((contact) => (
            <Pressable
              key={contact.key}
              accessibilityRole="link"
              onPress={() => Linking.openURL(contact.url)}
              style={({ pressed }) => [styles.contact, pressed && { opacity: 0.7 }]}
            >
              <Ionicons name={contact.icon} size={20} color={colors.primary} />
              <Text style={[typography.body, { flex: 1 }]}>{contact.label}</Text>
              <Ionicons name="open-outline" size={16} color={colors.textMuted} />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text style={typography.label}>{t('professionals.where')}</Text>
        {p.service_area ? (
          <View style={styles.contact}>
            <Ionicons name="navigate-circle-outline" size={20} color={colors.primary} />
            <Text style={[typography.body, { flex: 1 }]}>{t('professionals.serviceArea', { area: p.service_area })}</Text>
          </View>
        ) : null}
        {p.address ? <Text style={typography.body}>{p.address}</Text> : null}
        <Text style={typography.body}>{[p.city, p.region, p.country_name].filter((x, i, all) => x && all.indexOf(x) === i).join(', ')}</Text>
        {mapUrl ? <Button title={t('event.openMap')} variant="secondary" onPress={() => Linking.openURL(mapUrl)} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingVertical: spacing.xl },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logo: { width: 72, height: 72, borderRadius: 36 },
  placeholder: { backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.primary, fontWeight: '800', fontSize: 24 },
  name: { ...typography.title, fontSize: 24, lineHeight: 30 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  tagText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceRaised,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
