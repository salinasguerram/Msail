import Ionicons from '@expo/vector-icons/Ionicons';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { colors, radius, spacing, typography } from '@/theme';

/**
 * Popups propios de la app (iguales en web, iOS y Android):
 * - confirm(): pregunta antes de una acción, sobre todo las destructivas.
 * - choose(): menú de opciones.
 * - notify(): aviso breve arriba de la pantalla ("Foto actualizada").
 */

type ConfirmOptions = { title: string; message?: string; confirmLabel: string; destructive?: boolean };
type Choice = { key: string; label: string; destructive?: boolean };
type ChooseOptions = { title: string; message?: string; choices: Choice[] };
type NoticeKind = 'success' | 'error' | 'info';

type DialogsValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  choose: (options: ChooseOptions) => Promise<string | null>;
  notify: (message: string, kind?: NoticeKind) => void;
};

type OpenDialog =
  | { type: 'confirm'; options: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: 'choose'; options: ChooseOptions; resolve: (value: string | null) => void };

const DialogsContext = createContext<DialogsValue | null>(null);

const NOTICE_ICON: Record<NoticeKind, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle',
  error: 'alert-circle',
  info: 'information-circle',
};
const NOTICE_COLOR: Record<NoticeKind, string> = { success: colors.success, error: colors.danger, info: colors.primary };

export function DialogsProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [notice, setNotice] = useState<{ id: number; message: string; kind: NoticeKind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;

  const close = useCallback(() => setDialog(null), []);

  const value = useMemo<DialogsValue>(
    () => ({
      confirm: (options) => new Promise((resolve) => setDialog({ type: 'confirm', options, resolve })),
      choose: (options) => new Promise((resolve) => setDialog({ type: 'choose', options, resolve })),
      notify: (message, kind = 'success') => setNotice({ id: Date.now(), message, kind }),
    }),
    [],
  );

  // El aviso aparece, se queda unos segundos y desaparece solo.
  useEffect(() => {
    if (!notice) return;
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setNotice(null));
    }, 2800);
    return () => clearTimeout(timer);
  }, [notice, opacity]);

  function answer(result: boolean | string | null) {
    if (!dialog) return;
    if (dialog.type === 'confirm') dialog.resolve(result === true);
    else dialog.resolve(typeof result === 'string' ? result : null);
    close();
  }

  return (
    <DialogsContext.Provider value={value}>
      {children}

      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={() => answer(null)}>
        <Pressable style={styles.backdrop} onPress={() => answer(null)} accessibilityLabel={t('common.cancel')}>
          {/* El panel frena el toque para que no cierre el popup. */}
          <Pressable style={styles.panel} onPress={() => {}} accessibilityRole="alert">
            {dialog ? (
              <>
                <Text style={typography.heading}>{dialog.options.title}</Text>
                {dialog.options.message ? (
                  <Text style={[typography.body, { color: colors.textMuted }]}>{dialog.options.message}</Text>
                ) : null}
                <View style={styles.buttons}>
                  {dialog.type === 'confirm' ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => answer(true)}
                      style={({ pressed }) => [
                        styles.action,
                        dialog.options.destructive ? styles.destructive : styles.primary,
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Text style={styles.actionText}>{dialog.options.confirmLabel}</Text>
                    </Pressable>
                  ) : (
                    dialog.options.choices.map((choice) => (
                      <Pressable
                        key={choice.key}
                        accessibilityRole="button"
                        onPress={() => answer(choice.key)}
                        style={({ pressed }) => [styles.action, styles.option, pressed && { opacity: 0.8 }]}
                      >
                        <Text style={[styles.optionText, choice.destructive && { color: colors.danger }]}>{choice.label}</Text>
                      </Pressable>
                    ))
                  )}
                  <Button title={t('common.cancel')} variant="ghost" onPress={() => answer(null)} />
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {notice ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[styles.notice, { top: insets.top + spacing.md, opacity }]}
        >
          <Ionicons name={NOTICE_ICON[notice.kind]} size={20} color={NOTICE_COLOR[notice.kind]} />
          <Text style={styles.noticeText}>{notice.message}</Text>
        </Animated.View>
      ) : null}
    </DialogsContext.Provider>
  );
}

export function useDialogs() {
  const context = useContext(DialogsContext);
  if (!context) throw new Error('useDialogs debe usarse dentro de <DialogsProvider>');
  return context;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(3,7,18,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  panel: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  buttons: { gap: spacing.sm, marginTop: spacing.sm },
  action: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.lg },
  primary: { backgroundColor: colors.primary },
  destructive: { backgroundColor: colors.danger },
  actionText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  option: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  optionText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  notice: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: 420,
    marginHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  noticeText: { color: colors.text, fontSize: 14, fontWeight: '600', flexShrink: 1 },
});
