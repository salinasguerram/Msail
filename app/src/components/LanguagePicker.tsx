import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { LANGUAGES } from '@/i18n';
import { colors, radius, spacing } from '@/theme';

export function LanguagePicker() {
  const { t, i18n } = useTranslation();
  const { updateLanguage } = useAuth();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {LANGUAGES.map((language) => {
        const selected = i18n.language === language;
        return (
          <Pressable
            key={language}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => updateLanguage(language).catch(() => {})}
            style={[styles.option, selected && styles.selected]}
          >
            <Text style={[styles.text, selected && styles.selectedText]}>{t(`languages.${language}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
    gap: spacing.xs,
  },
  option: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  selected: { backgroundColor: colors.primary },
  text: { color: colors.textMuted, fontWeight: '600' },
  selectedText: { color: '#fff' },
});
