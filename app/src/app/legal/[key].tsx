import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { api } from '@/api/client';
import { errorMessage } from '@/auth/errors';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { colors, fonts, spacing, typography } from '@/theme';

type LegalPage = { key: string; title: string; body: string; updated_at: string };

/**
 * Política de privacidad (/legal/privacy) o términos (/legal/terms). Son públicas: las tiendas enlazan a estas
 * páginas de la web. El texto se edita desde el panel; una línea que empieza con «## » es un subtítulo.
 */
export default function LegalScreen() {
  const { t, i18n } = useTranslation();
  const { key } = useLocalSearchParams<{ key: string }>();
  const navigation = useNavigation();
  const [page, setPage] = useState<LegalPage | null>(null);
  const [error, setError] = useState<unknown>(null);

  // Se vuelve a pedir al cambiar el idioma: el servidor lo manda traducido.
  const fetchPage = useCallback(() => {
    api<LegalPage>(`/legal/${key}/`, { auth: false }).then(setPage).catch(setError);
  }, [key, i18n.language]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(fetchPage, [fetchPage]);

  useLayoutEffect(() => {
    if (page) navigation.setOptions({ title: page.title });
  }, [navigation, page]);

  if (!page) {
    return (
      <Screen>
        {error ? (
          <Card style={{ alignItems: 'center' }}>
            <Text style={[typography.body, { textAlign: 'center' }]}>{errorMessage(error, t)}</Text>
            <Button
              title={t('profile.retry')}
              variant="ghost"
              onPress={() => {
                setError(null);
                fetchPage();
              }}
            />
          </Card>
        ) : (
          <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.xl }} />
        )}
      </Screen>
    );
  }

  const updated = new Date(page.updated_at).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <Screen>
      <View style={styles.page}>
        <Text style={styles.title}>{page.title}</Text>
        <Text style={typography.caption}>{t('legal.updated', { date: updated })}</Text>
        <Card style={{ gap: spacing.md }}>
          {page.body
            .split(/\n\s*\n/)
            .map((block) => block.trim())
            .filter(Boolean)
            .map((block, i) =>
              block.startsWith('## ') ? (
                <Text key={i} style={styles.heading} accessibilityRole="header">
                  {block.slice(3)}
                </Text>
              ) : (
                <Text key={i} style={typography.body}>
                  {block}
                </Text>
              ),
            )}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  // En la web ancha el texto no ocupa toda la pantalla: se lee mejor en una columna.
  page: { gap: spacing.md, width: '100%', maxWidth: 760, alignSelf: 'center' },
  title: { color: colors.text, fontFamily: fonts.display, fontSize: 26 },
  heading: { color: colors.text, fontFamily: fonts.heading, fontSize: 17, marginTop: spacing.sm },
});
