import { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Animated,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Heart, MessageCircle, ShoppingBag, Share2, X, Send, Play, Volume2, VolumeX } from 'lucide-react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useCart } from '@/lib/CartContext';
import { colors, spacing, radius, typography } from '@/lib/theme';
import { router } from 'expo-router';
import type { Reel, ReelComment, Product } from '@/lib/supabase';
import { ArabicText as Text, ArabicTextInput as TextInput } from '@/components/ArabicText';
import { t } from '@/lib/i18n';

const { width, height } = Dimensions.get('window');

let VideoComponent: any = null;
let ResizeModeEnum: any = { COVER: 'cover' };

try {
  const av = require('expo-av');
  VideoComponent = av.Video;
  ResizeModeEnum = av.ResizeMode || { COVER: 'cover' };
} catch {
  VideoComponent = null;
}

export default function RelzScreen() {
  const { user } = useAuth();
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [commentReel, setCommentReel] = useState<Reel | null>(null);
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [localLikes, setLocalLikes] = useState<Record<string, number>>({});
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 });

  const loadReels = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('reels')
      .select('*, product:products(*, images:product_images(*))')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    setReels((data as Reel[]) ?? []);
    setLoading(false);
  }, []);

  const loadUserLikes = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('reel_likes')
      .select('reel_id')
      .eq('user_id', user.id);
    if (data) {
      setLikedIds(new Set(data.map((d: any) => d.reel_id)));
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      loadReels();
      loadUserLikes();
    }, [loadReels, loadUserLikes])
  );

  const handleLike = async (reel: Reel) => {
    if (!user) {
      router.push('/auth/login');
      return;
    }
    const isLiked = likedIds.has(reel.id);
    const newLikedIds = new Set(likedIds);
    if (isLiked) {
      newLikedIds.delete(reel.id);
      setLikedIds(newLikedIds);
      setLocalLikes(prev => ({ ...prev, [reel.id]: (prev[reel.id] ?? reel.likes_count) - 1 }));
      await supabase.from('reel_likes').delete().eq('reel_id', reel.id).eq('user_id', user.id);
      await supabase.from('reels').update({ likes_count: Math.max(0, reel.likes_count - 1) }).eq('id', reel.id);
    } else {
      newLikedIds.add(reel.id);
      setLikedIds(newLikedIds);
      setLocalLikes(prev => ({ ...prev, [reel.id]: (prev[reel.id] ?? reel.likes_count) + 1 }));
      await supabase.from('reel_likes').insert({ reel_id: reel.id, user_id: user.id });
      await supabase.from('reels').update({ likes_count: reel.likes_count + 1 }).eq('id', reel.id);
    }
  };

  const openComments = async (reel: Reel) => {
    setCommentReel(reel);
    const { data } = await supabase
      .from('reel_comments')
      .select('*')
      .eq('reel_id', reel.id)
      .order('created_at', { ascending: false });
    setComments((data as ReelComment[]) ?? []);
  };

  const sendComment = async () => {
    if (!user) { router.push('/auth/login'); return; }
    if (!commentText.trim() || !commentReel) return;
    setSendingComment(true);
    const { data } = await supabase.from('reel_comments').insert({
      reel_id: commentReel.id,
      user_id: user.id,
      body: commentText.trim(),
    }).select().single();
    if (data) {
      setComments(prev => [data as ReelComment, ...prev]);
      await supabase.from('reels').update({ comments_count: (commentReel.comments_count ?? 0) + 1 }).eq('id', commentReel.id);
      setCommentText('');
    }
    setSendingComment(false);
  };

  const handleAddToCart = (reel: Reel) => {
    if (reel.product) {
      router.push(`/product/${(reel.product as Product).slug}`);
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.gold} />
        <Text style={styles.loadingText}>Loading Reels...</Text>
      </View>
    );
  }

  if (reels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Play size={64} color={colors.neutral[600]} />
        <Text style={styles.emptyTitle}>No Reels Yet</Text>
        <Text style={styles.emptySubtitle}>Check back soon for new content</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        decelerationRate="fast"
        snapToAlignment="start"
        viewabilityConfig={viewabilityConfig.current}
        onViewableItemsChanged={onViewableItemsChanged.current}
        renderItem={({ item, index }) => (
          <ReelCard
            reel={item}
            isActive={index === currentIndex}
            isLiked={likedIds.has(item.id)}
            likesCount={localLikes[item.id] ?? item.likes_count}
            onLike={() => handleLike(item)}
            onComment={() => openComments(item)}
            onAddToCart={() => handleAddToCart(item)}
          />
        )}
      />

      <Modal visible={!!commentReel} animationType="slide" transparent onRequestClose={() => setCommentReel(null)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.commentSheet}>
            <View style={styles.commentHeader}>
              <Text style={styles.commentTitle}>Comments</Text>
              <TouchableOpacity onPress={() => setCommentReel(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <X size={22} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.commentList} showsVerticalScrollIndicator={false}>
              {comments.length === 0 ? (
                <Text style={styles.noComments}>Be the first to comment!</Text>
              ) : (
                comments.map((c) => (
                  <View key={c.id} style={styles.commentItem}>
                    <View style={styles.commentAvatar}>
                      <Text style={styles.commentAvatarText}>U</Text>
                    </View>
                    <View style={styles.commentBubble}>
                      <Text style={styles.commentBody}>{c.body}</Text>
                      <Text style={styles.commentTime}>{new Date(c.created_at).toLocaleDateString()}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
            <View style={styles.commentInputRow}>
              <TextInput
                style={styles.commentInput}
                placeholder="Write a comment..."
                placeholderTextColor={colors.textMuted}
                value={commentText}
                onChangeText={setCommentText}
                multiline
              />
              <TouchableOpacity
                style={[styles.sendBtn, !commentText.trim() && styles.sendBtnDisabled]}
                onPress={sendComment}
                disabled={!commentText.trim() || sendingComment}
              >
                {sendingComment ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Send size={18} color={colors.white} />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

type ReelCardProps = {
  reel: Reel;
  isActive: boolean;
  isLiked: boolean;
  likesCount: number;
  onLike: () => void;
  onComment: () => void;
  onAddToCart: () => void;
};

function ReelCard({ reel, isActive, isLiked, likesCount, onLike, onComment, onAddToCart }: ReelCardProps) {
  const videoRef = useRef<any>(null);
  const [muted, setMuted] = useState(false);
  const [showPlay, setShowPlay] = useState(false);
  const [paused, setPaused] = useState(false);
  const heartScale = useRef(new Animated.Value(1)).current;
  const product = reel.product as Product | undefined;
  const thumbnail = product?.images?.[0]?.image_url ?? reel.thumbnail_url;

  useEffect(() => {
    if (!VideoComponent) return;
    if (isActive && !paused) {
      videoRef.current?.playAsync?.();
    } else {
      videoRef.current?.pauseAsync?.();
    }
  }, [isActive, paused]);

  const togglePlayPause = () => {
    setPaused(p => !p);
    setShowPlay(true);
    setTimeout(() => setShowPlay(false), 800);
  };

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1.4, useNativeDriver: true }),
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true }),
    ]).start();
    onLike();
  };

  return (
    <View style={styles.reelCard}>
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={togglePlayPause}>
        {VideoComponent ? (
          <VideoComponent
            ref={videoRef}
            source={{ uri: reel.video_url }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeModeEnum.COVER}
            isLooping
            isMuted={muted}
            shouldPlay={isActive && !paused}
            useNativeControls={false}
          />
        ) : (
          <Image
            source={{ uri: thumbnail ?? 'https://via.placeholder.com/400x700/0a0a0a/d4af37?text=REEL' }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        )}
        <View style={styles.reelOverlay} />
        {showPlay && (
          <View style={styles.playIndicator}>
            <Play size={48} color="rgba(255,255,255,0.9)" fill="rgba(255,255,255,0.9)" />
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.reelActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={animateLike}>
          <Animated.View style={{ transform: [{ scale: heartScale }] }}>
            <Heart
              size={30}
              color={isLiked ? '#ff3b5c' : colors.white}
              fill={isLiked ? '#ff3b5c' : 'transparent'}
            />
          </Animated.View>
          <Text style={styles.actionCount}>{likesCount}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionBtn} onPress={onComment}>
          <MessageCircle size={30} color={colors.white} />
          <Text style={styles.actionCount}>{reel.comments_count}</Text>
        </TouchableOpacity>

        {product && (
          <TouchableOpacity style={styles.actionBtn} onPress={onAddToCart}>
            <ShoppingBag size={30} color={colors.gold} />
            <Text style={[styles.actionCount, { color: colors.gold }]}>Cart</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.actionBtn} onPress={() => setMuted(m => !m)}>
          {muted ? <VolumeX size={26} color={colors.white} /> : <Volume2 size={26} color={colors.white} />}
        </TouchableOpacity>
      </View>

      <View style={styles.reelInfo}>
        {(reel.title || reel.description) && (
          <View style={styles.reelTextWrap}>
            {reel.title ? <Text style={styles.reelTitle}>{reel.title}</Text> : null}
            {reel.description ? <Text style={styles.reelDesc} numberOfLines={2}>{reel.description}</Text> : null}
          </View>
        )}
        {product && (
          <TouchableOpacity style={styles.productChip} onPress={onAddToCart} activeOpacity={0.85}>
            {thumbnail ? (
              <Image source={{ uri: thumbnail }} style={styles.productChipImg} />
            ) : null}
            <View style={styles.productChipInfo}>
              <Text style={styles.productChipName} numberOfLines={1}>{product.name}</Text>
              <Text style={styles.productChipPrice}>${product.price}</Text>
            </View>
            <View style={styles.productChipCart}>
              <ShoppingBag size={14} color={colors.dark} />
            </View>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark },
  loadingContainer: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { ...typography.body, color: colors.neutral[400] },
  emptyContainer: { flex: 1, backgroundColor: colors.dark, alignItems: 'center', justifyContent: 'center', gap: 12, padding: spacing.xl },
  emptyTitle: { ...typography.h3, color: colors.white },
  emptySubtitle: { ...typography.body, color: colors.neutral[500], textAlign: 'center' },
  reelCard: { width, height, backgroundColor: colors.dark, position: 'relative' },
  reelOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
    ...({ background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.85) 100%)' } as any),
  },
  playIndicator: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reelActions: {
    position: 'absolute',
    right: spacing.md,
    bottom: 120,
    alignItems: 'center',
    gap: spacing.lg,
  },
  actionBtn: { alignItems: 'center', gap: 4 },
  actionCount: { ...typography.caption, color: colors.white, fontWeight: '600' },
  reelInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 80,
    padding: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  reelTextWrap: { gap: 4 },
  reelTitle: { ...typography.h4, color: colors.white, fontWeight: '700', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  reelDesc: { ...typography.bodySmall, color: 'rgba(255,255,255,0.85)', textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  productChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.full,
    padding: 6,
    paddingRight: spacing.sm,
    gap: spacing.sm,
    alignSelf: 'flex-start',
    maxWidth: 260,
  },
  productChipImg: { width: 36, height: 36, borderRadius: 18 },
  productChipInfo: { flex: 1, gap: 1 },
  productChipName: { ...typography.caption, color: colors.dark, fontWeight: '600' },
  productChipPrice: { ...typography.caption, color: colors.primary[600], fontWeight: '700' },
  productChipCart: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  commentSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: height * 0.92,
    paddingBottom: Platform.OS === 'ios' ? 34 : spacing.md,
  },
  commentHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  commentTitle: { ...typography.h4, fontWeight: '700', color: colors.text },
  commentList: { flex: 1, padding: spacing.md },
  noComments: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xl },
  commentItem: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, alignItems: 'flex-start' },
  commentAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary[400],
    alignItems: 'center', justifyContent: 'center',
  },
  commentAvatarText: { ...typography.caption, color: colors.white, fontWeight: '700' },
  commentBubble: { flex: 1, backgroundColor: colors.neutral[100], borderRadius: 12, padding: spacing.sm, gap: 2 },
  commentBody: { ...typography.bodySmall, color: colors.text },
  commentTime: { ...typography.caption, color: colors.textMuted },
  commentInputRow: {
    flexDirection: 'row', alignItems: 'flex-end',
    padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  commentInput: {
    flex: 1, minHeight: 40, maxHeight: 100,
    backgroundColor: colors.neutral[100],
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...typography.body,
    color: colors.text,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary[600],
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.neutral[300] },
});
