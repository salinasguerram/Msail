import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';

import { getCrew, type CrewMember } from '@/api/crew';
import { SAILING_ROLES } from '@/api/profiles';
import { className, useBoatClasses } from '@/api/useBoatClasses';
import { useAuth } from '@/auth/AuthContext';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Chip, ChipGroup } from '@/components/Chip';
import { Screen } from '@/components/Screen';
import { colors, radius, spacing, typography } from '@/theme';
import { ModerationMenu } from '@/components/Moderation';

const SEARCH_DEBOUNCE_MS = 350;

/** Tripulaciones: navegantes con perfil público que se ofrecen para tripular, con sus puestos y clases. */
export default function CrewScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const classes = useBoatClasses();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<string | null>(null);
  const [crew, setCrew] = useState<CrewMember[] | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;
    getCrew({ q: query, role })
      .then((page) => active && setCrew(page.results))
      .catch(() => active && setCrew([]));
    return () => {
      active = false;
    };
  }, [query, role]);

  return (
    <Screen>
      <Text style={typography.title}>{t('crewDirectory.title')}</Text>
      <Text style={typography.caption}>{t('crewDirectory.intro')}</Text>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('crewDirectory.search')}
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          accessibilityLabel={t('crewDirectory.search')}
          autoCorrect={false}
        />
      </View>
      <ChipGroup>
        <Chip label={t('crewDirectory.allRoles')} selected={!role} onPress={() => setRole(null)} />
        {SAILING_ROLES.map((key) => (
          <Chip key={key} label={t(`sailor.roles.${key}`)} selected={role === key} onPress={() => setRole(role === key ? null : key)} />
        ))}
      </ChipGroup>

      {crew === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
      ) : crew.length === 0 ? (
        <Card style={{ alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="people-outline" size={30} color={colors.primary} />
          <Text style={[typography.body, { textAlign: 'center' }]}>{t('crewDirectory.empty')}</Text>
        </Card>
      ) : (
        crew.map((member) => (
          <Card key={member.user_id} style={{ gap: spacing.sm }}>
            <View style={styles.header}>
              <Avatar uri={member.avatar} initials={`${member.first_name[0] ?? ''}${member.last_name[0] ?? ''}`.toUpperCase()} size={48} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { fontWeight: '700' }]}>
                  {member.first_name} {member.last_name}
                </Text>
                <Text style={typography.caption}>
                  {[member.city, member.region, member.country_name].filter(Boolean).join(' · ')}
                  {member.experience_level ? ` · ${t(`sailor.experience.${member.experience_level}`)}` : ''}
                </Text>
              </View>
              <ModerationMenu
                userId={member.user_id}
                name={`${member.first_name} ${member.last_name}`.trim()}
                onBlocked={() => setCrew((list) => list?.filter((m) => m.user_id !== member.user_id) ?? null)}
              />
            </View>
            {member.roles.length ? (
              <ChipGroup>
                {member.roles.map((r) => (
                  <Chip key={r} label={t(`sailor.roles.${r}`)} />
                ))}
              </ChipGroup>
            ) : null}
            {member.boat_classes.length ? (
              <Text style={typography.caption}>{member.boat_classes.map((slug) => className(classes, slug)).join(' · ')}</Text>
            ) : null}
          </Card>
        ))
      )}

      {/* Para aparecer acá: marcar "Disponible para tripular" en el perfil. */}
      <Card style={styles.join}>
        <Text style={[typography.body, { flex: 1 }]}>{t('crewDirectory.joinText')}</Text>
        <Button
          title={t(user ? 'crewDirectory.joinEdit' : 'crewDirectory.joinLogin')}
          variant="secondary"
          onPress={() => router.push(user ? '/profile/edit' : '/login')}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, color: colors.text, paddingVertical: spacing.md, fontSize: 15 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  join: { gap: spacing.sm },
});
