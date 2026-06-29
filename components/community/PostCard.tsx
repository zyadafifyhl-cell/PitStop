import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import React from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { LikeButton } from '@/components/community/LikeButton';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { authorInitials, categoryFlairLabel, reportCommunityPost } from '@/lib/community/postRepository';
import type { CommunityPost } from '@/lib/community/types';
import { shareDriverNetworkPost } from '@/lib/linking/share';

type Props = {
  post: CommunityPost;
  onLike: (postId: string) => void;
  onOpenComments: (postId: string) => void;
  busy?: boolean;
};

export function PostCard({ post, onLike, onOpenComments, busy }: Props) {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const isOwner = post.authorRole === 'owner';

  async function onReport() {
    try {
      await reportCommunityPost(post.id);
      Alert.alert(t('wash_review_reported_title'), t('driver_network_report_done'));
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  async function onShare() {
    try {
      await shareDriverNetworkPost({ postId: post.id, title: post.title, locale });
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.avatarText, { color: theme.accent }]}>{authorInitials(post.authorName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.nameRow}>
            <Text style={[styles.authorName, { color: theme.text }]}>{post.authorName}</Text>
            {isOwner ? (
              <View style={[styles.badge, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
                <FontAwesome name="check-circle" size={11} color={theme.accent} />
                <Text style={[styles.badgeText, { color: theme.accent }]}>{t('feed_merchant_badge')}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.meta, { color: theme.textMuted }]}>
            {new Date(post.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
          </Text>
        </View>
        <View style={[styles.flair, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <Text style={[styles.flairText, { color: theme.accent }]}>
            {categoryFlairLabel(post.categoryTag, locale)}
          </Text>
        </View>
      </View>

      <Text style={[styles.title, { color: theme.text }]}>{post.title}</Text>
      <Text style={[styles.body, { color: theme.textMuted }]} numberOfLines={6}>
        {post.content}
      </Text>

      {post.imageUrl ? (
        <Image source={{ uri: post.imageUrl }} style={styles.image} contentFit="cover" />
      ) : null}

      <View style={styles.actionsRow}>
        <LikeButton
          count={post.likeCount}
          liked={post.userLiked}
          label={t('driver_network_like')}
          onPress={() => onLike(post.id)}
          disabled={busy}
        />

        <Pressable
          onPress={() => onOpenComments(post.id)}
          style={[styles.commentBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
          <FontAwesome name="comment-o" size={15} color={theme.textMuted} />
          <Text style={[styles.commentText, { color: theme.textMuted }]}>
            {t('feed_comments')} · {post.commentCount}
          </Text>
        </Pressable>

        <Pressable onPress={onShare} style={[styles.shareBtn, { borderColor: theme.border }]}>
          <FontAwesome name="share-alt" size={15} color={theme.textMuted} />
        </Pressable>
        <Pressable onPress={onReport} style={[styles.shareBtn, { borderColor: theme.border }]}>
          <FontAwesome name="flag-o" size={15} color={theme.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  authorName: { fontSize: 14, fontWeight: '800' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { fontSize: 10, fontWeight: '800' },
  meta: { fontSize: 11, marginTop: 2 },
  flair: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  flairText: { fontSize: 11, fontWeight: '800' },
  title: { fontSize: 17, fontWeight: '900', lineHeight: 24 },
  body: { fontSize: 14, lineHeight: 21 },
  image: { width: '100%', height: 180, borderRadius: 12 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  commentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  commentText: { fontSize: 12, fontWeight: '700' },
  shareBtn: {
    borderWidth: 1,
    borderRadius: 999,
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
