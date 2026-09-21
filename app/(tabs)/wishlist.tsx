import { router } from 'expo-router';
import {
  View,
  StyleSheet,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { Heart } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { useWishlist } from '@/lib/WishlistContext';
import { ProductCard } from '@/components/ProductCard';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/Button';
import { ArabicText as Text } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

export default function WishlistScreen() {
  const { items, loading } = useWishlist();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wishlist</Text>
        {items.length > 0 ? <Text style={styles.count}>{items.length} items</Text> : null}
      </View>
      {items.length === 0 && !loading ? (
        <EmptyState
          icon={<Heart size={64} color={colors.neutral[300]} />}
          title="Your wishlist is empty"
          message="Save items you love by tapping the heart icon"
          action={<Button title="Browse Products" onPress={() => router.push('/(tabs)/index')} />}
        />
      ) : (
        <FlatList
          data={items}
          numColumns={2}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: spacing.md, gap: spacing.md }}
          columnWrapperStyle={{ gap: spacing.md }}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onPress={() => router.push(`/product/${item.slug}`)}
            />
          )}
        />
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface,
  },
  title: {
    ...typography.h2,
    color: colors.text,
  },
  count: {
    ...typography.bodySmall,
    color: colors.textMuted,
  },
});
