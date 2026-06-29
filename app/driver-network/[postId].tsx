import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { LikeButton } from '@/components/community/LikeButton';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  addCommunityComment,
  authorInitials,
  categoryFlairLabel,
  getCommunityPost,
  listCommunityComments,
  toggleCommunityCommentLike,
  toggleCommunityPostLike,
} from '@/lib/community/postRepository';
import type { CommunityComment, CommunityPost } from '@/lib/community/types';
import { shareDriverNetworkPost } from '@/lib/linking/share';

export default function DriverNetworkPostScreen() {
  const { postId: rawPostId } = useLocalSearchParams<{ postId: string }>();
  const postId = Array.isArray(rawPostId) ? rawPostId[0] : rawPostId;
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const [post, setPost] = useState<CommunityPost | undefined>();
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<CommunityComment | undefined>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!postId) return;
    const [postRow, commentRows] = await Promise.all([
      getCommunityPost(postId, customer?.id),
      listCommunityComments(postId, customer?.id),
    ]);
    setPost(postRow);
    setComments(commentRows);
  }, [postId, customer?.id]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await refresh();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [refresh]),
  );

  const topLevelComments = useMemo(
    () => comments.filter((comment) => !comment.parentId),
    [comments],
  );

  async function onLikePost() {
    if (!customer || isGuest || !post) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    setBusy(true);
    try {
      await toggleCommunityPostLike({ postId: post.id, userId: customer.id });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onLikeComment(commentId: string) {
    if (!customer || isGuest) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    setBusy(true);
    try {
      await toggleCommunityCommentLike({ commentId, userId: customer.id });
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitComment() {
    if (!customer || isGuest) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    if (!postId || !draft.trim()) return;
    setBusy(true);
    try {
      await addCommunityComment({
        postId,
        userId: customer.id,
        authorName: customer.name,
        content: draft.trim(),
        parentId: replyTo?.id,
      });
      setDraft('');
      setReplyTo(undefined);
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('feed_comment_fail_body');
      Alert.alert(t('feed_comment_fail_title'), message);
    } finally {
      setBusy(false);
    }
  }

  async function onSharePost() {
    if (!post) return;
    try {
      await shareDriverNetworkPost({ postId: post.id, title: post.title, locale });
    } catch {
      Alert.alert(t('settings_link_fail_title'), t('settings_link_fail_body'));
    }
  }

  function renderComment(comment: CommunityComment, nested = false) {
    const replies = comments.filter((row) => row.parentId === comment.id);
    const isOwner = comment.authorRole === 'owner';

    return (
      <View
        key={comment.id}
        style={[
          styles.commentBlock,
          nested && [styles.nestedComment, { borderLeftColor: theme.border }],
        ]}>
        <View style={styles.commentHead}>
          <View style={[styles.avatar, { backgroundColor: theme.accentSoft }]}>
            <Text style={[styles.avatarText, { color: theme.accent }]}>{authorInitials(comment.authorName)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={[styles.authorName, { color: theme.text }]}>{comment.authorName}</Text>
              {isOwner ? (
                <Text style={[styles.ownerBadge, { color: theme.accent }]}>{t('feed_merchant_badge')}</Text>
              ) : null}
            </View>
            <Text style={[styles.commentMeta, { color: theme.textMuted }]}>
              {new Date(comment.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
            </Text>
          </View>
        </View>
        <Text style={[styles.commentBody, { color: theme.textMuted }]}>{comment.content}</Text>
        <View style={styles.commentActions}>
          <LikeButton
            count={comment.likeCount}
            liked={comment.userLiked}
            label={t('driver_network_like')}
            onPress={() => onLikeComment(comment.id)}
            disabled={busy}
            compact
          />
          {!nested ? (
            <Pressable onPress={() => setReplyTo(comment)} style={styles.replyBtn}>
              <Text style={[styles.replyBtnText, { color: theme.accent }]}>{t('feed_reply')}</Text>
            </Pressable>
          ) : null}
        </View>
        {replies.map((reply) => renderComment(reply, true))}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (!post) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('feed_post_not_found')}</Text>
        <Pressable onPress={() => router.back()} style={[styles.backBtn, { borderColor: theme.border }]}>
          <Text style={{ color: theme.text }}>{t('feed_back')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.postShell, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.postHead}>
            <View style={[styles.flair, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
              <Text style={[styles.flairText, { color: theme.accent }]}>
                {categoryFlairLabel(post.categoryTag, locale)}
              </Text>
            </View>
            <Pressable onPress={onSharePost} style={[styles.shareBtn, { borderColor: theme.border }]}>
              <FontAwesome name="share-alt" size={16} color={theme.textMuted} />
            </Pressable>
          </View>
          <Text style={[styles.postTitle, { color: theme.text }]}>{post.title}</Text>
          <Text style={[styles.postBody, { color: theme.textMuted }]}>{post.content}</Text>

          <View style={styles.postActions}>
            <LikeButton
              count={post.likeCount}
              liked={post.userLiked}
              label={t('driver_network_like')}
              onPress={onLikePost}
              disabled={busy}
            />
            <Text style={[styles.commentCount, { color: theme.textMuted }]}>
              {t('feed_comments')} · {post.commentCount}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('feed_comments_section')}</Text>
        {topLevelComments.length === 0 ? (
          <Text style={[styles.emptyComments, { color: theme.textMuted }]}>{t('feed_comments_empty')}</Text>
        ) : (
          topLevelComments.map((comment) => renderComment(comment))
        )}
      </ScrollView>

      <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.bgElevated }]}>
        {replyTo ? (
          <View style={styles.replyingRow}>
            <Text style={[styles.replyingText, { color: theme.textMuted }]}>
              {t('feed_replying_to').replace('{name}', replyTo.authorName)}
            </Text>
            <Pressable onPress={() => setReplyTo(undefined)}>
              <FontAwesome name="times" size={14} color={theme.textMuted} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? t('feed_reply_placeholder') : t('feed_comment_placeholder')}
            placeholderTextColor={theme.textDim}
            multiline
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
          />
          <Pressable
            onPress={onSubmitComment}
            disabled={busy || !draft.trim()}
            style={[
              styles.sendBtn,
              { backgroundColor: theme.accent, opacity: busy || !draft.trim() ? 0.6 : 1 },
            ]}>
            {busy ? (
              <ActivityIndicator color={theme.onAccent} size="small" />
            ) : (
              <FontAwesome name="send" size={16} color={theme.onAccent} />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  content: { padding: 16, paddingBottom: 120 },
  postShell: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16, gap: 10 },
  postHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  flair: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  flairText: { fontSize: 11, fontWeight: '800' },
  shareBtn: {
    borderWidth: 1,
    borderRadius: 999,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postTitle: { fontSize: 22, fontWeight: '900' },
  postBody: { fontSize: 15, lineHeight: 22 },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  commentCount: { fontSize: 12, fontWeight: '700' },
  sectionTitle: { fontSize: 18, fontWeight: '900', marginBottom: 10 },
  emptyComments: { fontSize: 14, lineHeight: 20 },
  commentBlock: { marginBottom: 14 },
  nestedComment: { marginLeft: 18, marginTop: 10, paddingLeft: 12, borderLeftWidth: 2 },
  commentHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 12, fontWeight: '900' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  authorName: { fontSize: 13, fontWeight: '800' },
  ownerBadge: { fontSize: 10, fontWeight: '800' },
  commentMeta: { fontSize: 11, marginTop: 2 },
  commentBody: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, flexWrap: 'wrap' },
  replyBtn: {},
  replyBtnText: { fontSize: 12, fontWeight: '800' },
  inputBar: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },
  replyingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  replyingText: { fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
});
