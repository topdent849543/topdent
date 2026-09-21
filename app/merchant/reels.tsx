import { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Alert,
  FlatList,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  ChevronLeft,
  Plus,
  Trash2,
  Video,
  X,
  Film,
  Heart,
  MessageCircle,
  Shield,
} from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { ArabicText as Text, ArabicTextInput as TextInputArabic } from '@/components/ArabicText';
import { useAuth } from '@/lib/AuthContext';
import { supabase } from '@/lib/supabase';
import { confirmAction } from '@/lib/confirm';
import { Button } from '@/components/Button';
import { pickAndUploadVideo, isCloudinaryConfigured } from '@/lib/cloudinary';
import type { Reel, Product } from '@/lib/supabase';

type ReelWithProduct = Reel & {
  product: Product | null;
};

type FormState = {
  title: string;
  description: string;
  video_url: string;
  thumbnail_url: string;
  product_id: string;
};

const emptyForm: FormState = {
  title: '',
  description: '',
  video_url: '',
  thumbnail_url: '',
  product_id: '',
};

export default function MerchantReelsScreen() {
  const { user, isMerchant } = useAuth();
  const [reels, setReels] = useState<ReelWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [reelsRes, productsRes] = await Promise.all([
        supabase
          .from('reels')
          .select('*, product:products(*)')
          .eq('merchant_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('products')
          .select('*')
          .eq('merchant_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false }),
      ]);

      if (reelsRes.error) throw reelsRes.error;
      if (productsRes.error) throw productsRes.error;

      setReels((reelsRes.data as unknown as ReelWithProduct[]) ?? []);
      setProducts((productsRes.data as Product[]) ?? []);
    } catch (e: any) {
      setError(e.message || 'Failed to load reels');
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const openAdd = () => {
    setForm(emptyForm);
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!user) return;
    // Validation
    if (!form.title.trim()) {
      Alert.alert('Validation Error', 'Reel title is required.');
      return;
    }
    if (!form.video_url.trim()) {
      Alert.alert('Validation Error', 'Video URL is required.');
      return;
    }

    setSaving(true);
    try {
      const { error: createErr } = await supabase.from('reels').insert({
        title: form.title.trim(),
        description: form.description.trim() || null,
        video_url: form.video_url.trim(),
        thumbnail_url: form.thumbnail_url.trim() || null,
        product_id: form.product_id || null,
        merchant_id: user.id,
        is_active: true,
        sort_order: 0,
        likes_count: 0,
        comments_count: 0,
      });

      if (createErr) throw createErr;

      Alert.alert('Success', 'Reel created successfully.');
      setModalVisible(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to create reel');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (reel: ReelWithProduct) => {
    confirmAction(
      {
        title: 'Delete Reel',
        message: `Are you sure you want to delete "${reel.title || 'this reel'}"?`,
      },
      async () => {
        try {
          const { error: delErr } = await supabase
            .from('reels')
            .delete()
            .eq('id', reel.id);
          if (delErr) throw delErr;
          Alert.alert('Success', 'Reel deleted.');
          await load();
        } catch (e: any) {
          Alert.alert('Error', e.message || 'Failed to delete reel');
        }
      }
    );
  };

  const renderReel = ({ item }: { item: ReelWithProduct }) => (
    <View style={styles.reelCard}>
      <View style={styles.reelRow}>
        <View style={styles.reelThumb}>
          <Film size={24} color={colors.primary[600]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.reelTitle} numberOfLines={2}>
            {item.title || 'Untitled Reel'}
          </Text>
          {item.product ? (
            <Text style={styles.reelProduct} numberOfLines={1}>
              {item.product.name}
            </Text>
          ) : (
            <Text style={styles.reelProductNone}>No linked product</Text>
          )}
          <View style={styles.reelStats}>
            <View style={styles.reelStatItem}>
              <Heart size={12} color={colors.neutral[500]} />
              <Text style={styles.reelStatText}>{item.likes_count ?? 0}</Text>
            </View>
            <View style={styles.reelStatItem}>
              <MessageCircle size={12} color={colors.neutral[500]} />
              <Text style={styles.reelStatText}>{item.comments_count ?? 0}</Text>
            </View>
          </View>
        </View>
        <TouchableOpacity
          style={styles.deleteIconBtn}
          onPress={() => handleDelete(item)}
        >
          <Trash2 size={18} color={colors.error[500]} />
        </TouchableOpacity>
      </View>

      {item.description ? (
        <Text style={styles.reelDesc} numberOfLines={2}>
          {item.description}
        </Text>
      ) : null}
    </View>
  );

  // ── Access guard ──────────────────────────────────────────────
  if (!user || !isMerchant) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Reels</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.accessGuard}>
          <Shield size={64} color={colors.neutral[300]} />
          <Text style={styles.accessTitle}>Merchant Access Required</Text>
          <Text style={styles.accessMsg}>
            You need merchant privileges to manage reels.
          </Text>
          <View style={{ marginTop: spacing.lg, width: '100%' }}>
            <Button title="Back to Home" onPress={() => router.replace('/(tabs)/index')} fullWidth />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loading ────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Reels</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary[600]} />
          <Text style={styles.loadingText}>Loading reels…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──────────────────────────────────────────────────────
  if (error && reels.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Reels</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <View style={{ marginTop: spacing.lg }}>
            <Button title="Retry" onPress={load} variant="outline" />
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
          <ChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>My Reels</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={openAdd}>
          <Plus size={24} color={colors.primary[600]} />
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        renderItem={renderReel}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Video size={56} color={colors.neutral[300]} />
            <Text style={styles.emptyTitle}>No reels yet</Text>
            <Text style={styles.emptyMsg}>
              Tap the + button to create your first reel.
            </Text>
            <View style={{ marginTop: spacing.lg, width: '100%' }}>
              <Button title="Add Reel" onPress={openAdd} fullWidth />
            </View>
          </View>
        }
      />

      {/* ── Add Modal ──────────────────────────────────────────────── */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Reel</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !saving && setModalVisible(false)}
              >
                <X size={20} color={colors.neutral[500]} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Title */}
              <Text style={styles.fieldLabel}>Title *</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="Enter reel title"
                value={form.title}
                onChangeText={(v) => setForm({ ...form, title: v })}
                editable={!saving}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInputArabic
                style={[styles.input, styles.textArea]}
                placeholder="Describe your reel…"
                value={form.description}
                onChangeText={(v) => setForm({ ...form, description: v })}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                editable={!saving}
              />

              {/* Video Upload */}
              <Text style={styles.fieldLabel}>Video File *</Text>
              <TouchableOpacity
                style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
                onPress={async () => {
                  if (uploadingVideo || saving) return;
                  setUploadingVideo(true);
                  setVideoUploadProgress(0);
                  try {
                    const url = await pickAndUploadVideo((percent) => setVideoUploadProgress(percent));
                    if (url) setForm({ ...form, video_url: url });
                  } catch (e: any) {
                    Alert.alert('Upload Error', e.message || 'Failed to upload video');
                  } finally {
                    setUploadingVideo(false);
                    setVideoUploadProgress(0);
                  }
                }}
                disabled={saving || uploadingVideo}
              >
                <Text
                  style={form.video_url ? styles.uploadPreviewText : styles.uploadPlaceholder}
                  numberOfLines={1}
                >
                  {uploadingVideo
                    ? `Uploading video… ${videoUploadProgress}%`
                    : form.video_url
                    ? 'Video uploaded ✓ (tap to change)'
                    : 'Tap to upload video from device'}
                </Text>
                <Video size={20} color={colors.neutral[400]} />
              </TouchableOpacity>
              {uploadingVideo ? (
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${videoUploadProgress}%` }]} />
                </View>
              ) : null}
              {!isCloudinaryConfigured() ? (
                <Text style={styles.configWarning}>
                  Cloudinary not configured. Set EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME and EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET in .env
                </Text>
              ) : null}

              {/* Thumbnail URL */}
              <Text style={styles.fieldLabel}>Thumbnail URL</Text>
              <TextInputArabic
                style={styles.input}
                placeholder="https://example.com/thumb.jpg"
                value={form.thumbnail_url}
                onChangeText={(v) => setForm({ ...form, thumbnail_url: v })}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!saving}
              />

              {/* Product select */}
              <Text style={styles.fieldLabel}>Linked Product</Text>
              {products.length === 0 ? (
                <View style={styles.noProductsBox}>
                  <Text style={styles.noProductsText}>
                    No active products available. Add a product first to link it to a reel.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.productChipRow}
                >
                  <TouchableOpacity
                    style={[
                      styles.productChip,
                      !form.product_id && styles.productChipActive,
                    ]}
                    onPress={() => setForm({ ...form, product_id: '' })}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.productChipText,
                        !form.product_id && styles.productChipTextActive,
                      ]}
                    >
                      None
                    </Text>
                  </TouchableOpacity>
                  {products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.productChip,
                        form.product_id === p.id && styles.productChipActive,
                      ]}
                      onPress={() => setForm({ ...form, product_id: p.id })}
                      disabled={saving}
                    >
                      <Text
                        style={[
                          styles.productChipText,
                          form.product_id === p.id && styles.productChipTextActive,
                        ]}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Actions */}
              <View style={styles.modalActions}>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Cancel"
                    onPress={() => setModalVisible(false)}
                    variant="outline"
                    disabled={saving}
                    fullWidth
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button
                    title="Create"
                    onPress={handleSave}
                    loading={saving}
                    fullWidth
                  />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  // Loading
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  // Access guard
  accessGuard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  accessTitle: {
    ...typography.h3,
    color: colors.text,
    marginTop: spacing.md,
  },
  accessMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorEmoji: { fontSize: 48 },
  errorTitle: {
    ...typography.h3,
    color: colors.text,
  },
  errorMsg: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: colors.error[50],
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    margin: spacing.md,
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorBannerText: {
    ...typography.bodySmall,
    color: colors.error[700],
  },
  // Empty
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  emptyTitle: {
    ...typography.h4,
    color: colors.text,
  },
  emptyMsg: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  // Reel card
  reelCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    ...shadows.sm,
  },
  reelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  reelThumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
    flexShrink: 1,
  },
  reelProduct: {
    ...typography.caption,
    color: colors.primary[700],
    fontWeight: '500',
    marginTop: 2,
  },
  reelProductNone: {
    ...typography.caption,
    color: colors.neutral[400],
    marginTop: 2,
    fontStyle: 'italic',
  },
  reelStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  reelStatItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reelStatText: {
    ...typography.caption,
    color: colors.neutral[500],
  },
  deleteIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.error[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.lg,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  modalTitle: {
    ...typography.h4,
    color: colors.text,
    fontWeight: '700',
  },
  modalClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral[100],
  },
  // Form fields
  fieldLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.background,
    marginBottom: spacing.sm,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  uploadPreviewText: {
    ...typography.bodySmall,
    color: colors.success[700],
    fontWeight: '500',
    flex: 1,
  },
  uploadPlaceholder: {
    ...typography.body,
    color: colors.neutral[400],
    flex: 1,
  },
  configWarning: {
    ...typography.caption,
    color: colors.warning[600],
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.full ?? 999,
    backgroundColor: colors.neutral[100],
    overflow: 'hidden',
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary[500] ?? colors.success[500],
    borderRadius: radius.full ?? 999,
  },
  // No products
  noProductsBox: {
    backgroundColor: colors.warning[50],
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning[100],
    marginBottom: spacing.sm,
  },
  noProductsText: {
    ...typography.bodySmall,
    color: colors.warning[600],
  },
  // Product chips
  productChipRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  productChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.neutral[100],
    borderWidth: 1,
    borderColor: colors.border,
    maxWidth: 160,
  },
  productChipActive: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  productChipText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
  productChipTextActive: {
    color: colors.white,
    fontWeight: '600',
  },
  // Modal actions
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
