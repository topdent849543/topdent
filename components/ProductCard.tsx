import { useEffect, useState } from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { Heart, Star } from 'lucide-react-native';
import { colors, spacing, radius, typography, shadows } from '@/lib/theme';
import { useWishlist } from '@/lib/WishlistContext';
import type { Product } from '@/lib/supabase';
import { primaryImageUrl } from '@/lib/productImages';
import { formatSyp } from '@/lib/currency';

type Props = {
  product: Product;
  onPress: () => void;
  priceColor?: string;
};

export function ProductCard({ product, onPress, priceColor }: Props) {
  const { isWishlisted, toggle } = useWishlist();
  const wished = isWishlisted(product.id);
  const hasDiscount = product.compare_at_price && product.compare_at_price > product.price;
  const discountPct = hasDiscount
    ? Math.round(((product.compare_at_price! - product.price) / product.compare_at_price!) * 100)
    : 0;
  // الصورة الرئيسية التي اختارها التاجر/الأدمن
  const imageUrl = primaryImageUrl(product) ?? product.images?.[0]?.image_url;

  const priceSyp = product.price;
  const comparePriceSyp = hasDiscount ? product.compare_at_price! : 0;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageContainer}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={[styles.image, styles.placeholder]} />
        )}
        {hasDiscount ? (
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>-{discountPct}%</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={styles.heartBtn}
          onPress={() => toggle(product.id).catch(() => {})}
        >
          <Heart
            size={18}
            color={wished ? colors.error[500] : colors.white}
            fill={wished ? colors.error[500] : 'transparent'}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.info}>
        <Text style={styles.brand}>{product.brand ?? ''}</Text>
        <Text style={styles.name} numberOfLines={2}>{product.name}</Text>
        <View style={styles.priceRow}>
          <Text style={[styles.price, priceColor ? { color: priceColor } : null]}>
            {formatSyp(priceSyp)}
          </Text>
          {hasDiscount ? (
            <Text style={styles.oldPrice}>{formatSyp(comparePriceSyp)}</Text>
          ) : null}
        </View>
        {product.rating > 0 ? (
          <View style={styles.ratingRow}>
            <Star size={12} color={colors.accent[500]} fill={colors.accent[500]} />
            <Text style={styles.rating}>{product.rating.toFixed(1)}</Text>
            <Text style={styles.reviewCount}>({product.review_count})</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    ...shadows.sm,
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    aspectRatio: 1,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    backgroundColor: colors.neutral[200],
  },
  discountBadge: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: colors.error[500],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  discountText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  heartBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    padding: spacing.sm,
  },
  brand: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  name: {
    ...typography.bodySmall,
    fontWeight: '500',
    color: colors.text,
    marginBottom: spacing.xs,
    minHeight: 40,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  price: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
    fontSize: 15,
  },
  oldPrice: {
    ...typography.caption,
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rating: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.text,
  },
  reviewCount: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
