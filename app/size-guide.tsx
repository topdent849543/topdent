import { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, Ruler } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

const SIZE_CHARTS: Record<string, { size: string; chest: string; waist: string; hips: string }[]> = {
  Tops: [
    { size: 'XS', chest: '32-34"', waist: '26-28"', hips: '34-36"' },
    { size: 'S', chest: '34-36"', waist: '28-30"', hips: '36-38"' },
    { size: 'M', chest: '36-38"', waist: '30-32"', hips: '38-40"' },
    { size: 'L', chest: '38-40"', waist: '32-34"', hips: '40-42"' },
    { size: 'XL', chest: '40-42"', waist: '34-36"', hips: '42-44"' },
    { size: 'XXL', chest: '42-44"', waist: '36-38"', hips: '44-46"' },
  ],
  Bottoms: [
    { size: '28', chest: '-', waist: '28"', hips: '34-36"' },
    { size: '30', chest: '-', waist: '30"', hips: '36-38"' },
    { size: '32', chest: '-', waist: '32"', hips: '38-40"' },
    { size: '34', chest: '-', waist: '34"', hips: '40-42"' },
    { size: '36', chest: '-', waist: '36"', hips: '42-44"' },
    { size: '38', chest: '-', waist: '38"', hips: '44-46"' },
  ],
  Shoes: [
    { size: '40', chest: '-', waist: '-', hips: 'US 7' },
    { size: '41', chest: '-', waist: '-', hips: 'US 8' },
    { size: '42', chest: '-', waist: '-', hips: 'US 9' },
    { size: '43', chest: '-', waist: '-', hips: 'US 10' },
    { size: '44', chest: '-', waist: '-', hips: 'US 11' },
    { size: '45', chest: '-', waist: '-', hips: 'US 12' },
  ],
};

export default function SizeGuideScreen() {
  const [activeTab, setActiveTab] = useState<keyof typeof SIZE_CHARTS>('Tops');

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Size Guide</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xl }}>
        <View style={styles.introCard}>
          <View style={styles.introIcon}>
            <Ruler size={32} color={colors.primary[600]} />
          </View>
          <Text style={styles.introTitle}>How to Measure</Text>
          <Text style={styles.introText}>
            Use a flexible tape measure. For best results, measure over lightweight clothing.
            Keep the tape snug but not tight.
          </Text>
        </View>
        <View style={styles.measureSection}>
          <Text style={styles.measureTitle}>Measurement Tips</Text>
          <View style={styles.measureList}>
            <View style={styles.measureItem}>
              <Text style={styles.measureLabel}>Chest:</Text>
              <Text style={styles.measureDesc}>Measure around the fullest part of your chest.</Text>
            </View>
            <View style={styles.measureItem}>
              <Text style={styles.measureLabel}>Waist:</Text>
              <Text style={styles.measureDesc}>Measure around your natural waistline.</Text>
            </View>
            <View style={styles.measureItem}>
              <Text style={styles.measureLabel}>Hips:</Text>
              <Text style={styles.measureDesc}>Measure around the fullest part of your hips.</Text>
            </View>
          </View>
        </View>
        <View style={styles.tabsRow}>
          {(Object.keys(SIZE_CHARTS) as (keyof typeof SIZE_CHARTS)[]).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tableCard}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Size</Text>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Chest</Text>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Waist</Text>
            <Text style={[styles.tableCell, styles.tableHeaderCell, { flex: 1 }]}>Hips</Text>
          </View>
          {SIZE_CHARTS[activeTab].map((row, i) => (
            <View
              key={row.size}
              style={[styles.tableRow, i % 2 === 0 && styles.tableRowAlt]}
            >
              <Text style={[styles.tableCell, { flex: 1, fontWeight: '700' }]}>{row.size}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{row.chest}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{row.waist}</Text>
              <Text style={[styles.tableCell, { flex: 1 }]}>{row.hips}</Text>
            </View>
          ))}
        </View>
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>International Size Conversion</Text>
          <Text style={styles.noteText}>
            Sizes may vary between brands. If you're between sizes, we recommend sizing up for a more comfortable fit.
            For specific product measurements, check the product description.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  introCard: {
    margin: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.primary[50],
    borderRadius: radius.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  introIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  introTitle: {
    ...typography.h4,
    color: colors.text,
  },
  introText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  measureSection: {
    padding: spacing.md,
  },
  measureTitle: {
    ...typography.h4,
    color: colors.text,
    marginBottom: spacing.md,
  },
  measureList: {
    gap: spacing.md,
  },
  measureItem: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  measureLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary[600],
    minWidth: 60,
  },
  measureDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    flex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  tabText: {
    ...typography.bodySmall,
    color: colors.text,
    fontWeight: '600',
  },
  tabTextActive: {
    color: colors.white,
  },
  tableCard: {
    marginHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary[600],
  },
  tableHeaderCell: {
    color: colors.white,
    fontWeight: '700',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  tableRowAlt: {
    backgroundColor: colors.neutral[50],
  },
  tableCell: {
    ...typography.bodySmall,
    color: colors.text,
    textAlign: 'center',
  },
  noteCard: {
    margin: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.warning[50],
    borderRadius: radius.md,
  },
  noteTitle: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  noteText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
