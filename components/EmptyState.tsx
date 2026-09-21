import { View, StyleSheet } from 'react-native';
import type { ReactNode } from 'react';
import { colors, spacing, typography } from '@/lib/theme';
import { ArabicText } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

type Props = {
  icon?: ReactNode;
  title: string;
  message?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, message, action }: Props) {
  return (
    <View style={styles.container}>
      {icon}
      <ArabicText style={styles.title}>{t(title)}</ArabicText>
      {message ? <ArabicText style={styles.message}>{t(message)}</ArabicText> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.h4,
    color: colors.text,
    textAlign: 'center',
  },
  message: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
