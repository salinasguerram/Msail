import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deleteMyReview, getReviews, saveReview, type ProfessionalDetail, type Review } from '@/api/professionals';
import { useAuth } from '@/auth/AuthContext';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { useDialogs } from '@/components/Dialogs';
import { TextField } from '@/components/TextField';
import { colors, radius, spacing, typography } from '@/theme';

const STAR = '#f5c542';

/** Estrellas de 1 a 5 (con medias estrellas al mostrar un promedio). */
export function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }} accessibilityLabel={`${value} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Ionicons key={n} name={value >= n ? 'star' : value >= n - 0.5 ? 'star-half' : 'star-outline'} size={size} color={STAR} />
      ))}
    </View>
  );
}

function StarInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }} role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable
          key={n}
          role="radio"
          aria-checked={value === n}
          accessibilityLabel={t('reviews.stars', { count: n })}
          onPress={() => onChange(n)}
          hitSlop={6}
        >
          <Ionicons name={value >= n ? 'star' : 'star-outline'} size={32} color={STAR} />
        </Pressable>
      ))}
    </View>
  );
}

function ReviewItem({ review }: { review: Review }) {
  const { t, i18n } = useTranslation();
  const date = new Date(review.created_at).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' });
  return (
    <View style={styles.review}>
      <View style={styles.reviewHeader}>
        <Stars value={review.rating} />
        <Text style={[typography.body, { fontWeight: '700' }]}>{review.author}</Text>
        {review.is_client ? (
          <View style={styles.badge}>
            <Ionicons name="checkmark-circle" size={12} color={colors.success} />
            <Text style={styles.badgeText}>{t('reviews.client')}</Text>
          </View>
        ) : null}
        <Text style={[typography.caption, { marginLeft: 'auto' }]}>{date}</Text>
      </View>
      {review.comment ? <Text style={typography.body}>{review.comment}</Text> : null}
    </View>
  );
}

/** Reseñas del profesional: promedio, las últimas, "ver todas" y el formulario para dejar la mía. */
export function Reviews({ professional, onChange }: { professional: ProfessionalDetail; onChange: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { confirm, notify } = useDialogs();
  const mine = professional.my_review;
  const [all, setAll] = useState<Review[] | null>(null);
  const [editing, setEditing] = useState(false);
  const [rating, setRating] = useState(mine?.rating ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reviews = all ?? professional.latest_reviews;

  function startEditing() {
    if (!user) {
      router.push({ pathname: '/login', params: { next: `/professionals/${professional.slug}` } });
      return;
    }
    setRating(mine?.rating ?? 0);
    setComment(mine?.comment ?? '');
    setError(null);
    setEditing(true);
  }

  async function submit() {
    if (!rating) {
      setError(t('reviews.pickRating'));
      return;
    }
    setSaving(true);
    try {
      await saveReview(professional.slug, { rating, comment: comment.trim() });
      notify(t('reviews.saved'));
      setEditing(false);
      setAll(null);
      onChange();
    } catch (e) {
      setError(errorMessage(e, t));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const ok = await confirm({ title: t('reviews.confirmDelete'), confirmLabel: t('reviews.delete'), destructive: true });
    if (!ok) return;
    try {
      await deleteMyReview(professional.slug);
      notify(t('reviews.deleted'));
      setEditing(false);
      setAll(null);
      onChange();
    } catch (e) {
      notify(errorMessage(e, t), 'error');
    }
  }

  return (
    <Card>
      <Text style={typography.label}>{t('reviews.title')}</Text>
      {professional.rating !== null ? (
        <View style={styles.summary}>
          <Text style={styles.average}>{professional.rating.toFixed(1)}</Text>
          <Stars value={professional.rating} size={18} />
          <Text style={typography.caption}>{t('reviews.count', { count: professional.reviews_count })}</Text>
        </View>
      ) : (
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('reviews.none')}</Text>
      )}

      {reviews.map((review) => (
        <ReviewItem key={review.id} review={review} />
      ))}
      {all === null && professional.reviews_count > professional.latest_reviews.length ? (
        <Button
          title={t('reviews.seeAll', { count: professional.reviews_count })}
          variant="ghost"
          onPress={() =>
            getReviews(professional.slug)
              .then((page) => setAll(page.results))
              .catch(() => {})
          }
        />
      ) : null}

      {editing ? (
        <View style={styles.form}>
          <Text style={[typography.body, { fontWeight: '700' }]}>{mine ? t('reviews.editTitle') : t('reviews.newTitle')}</Text>
          <StarInput value={rating} onChange={setRating} />
          <TextField
            label={t('reviews.comment')}
            value={comment}
            onChangeText={setComment}
            multiline
            placeholder={t('reviews.commentPlaceholder')}
          />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button title={t('reviews.publish')} onPress={submit} loading={saving} />
          <Button title={t('common.cancel')} variant="ghost" onPress={() => setEditing(false)} />
        </View>
      ) : (
        <View style={{ gap: spacing.xs }}>
          <Button title={mine ? t('reviews.editMine') : t('reviews.write')} variant="secondary" onPress={startEditing} />
          {mine ? <Button title={t('reviews.delete')} variant="ghost" onPress={remove} /> : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  average: { color: colors.text, fontSize: 28, fontWeight: '800' },
  review: { gap: 4, paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surfaceRaised, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: colors.success, fontSize: 11, fontWeight: '700' },
  form: { gap: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
});
