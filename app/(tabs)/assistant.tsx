import { router, useFocusEffect, type Href } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { CreatePostCard } from '@/components/community/CreatePostCard';
import { FeedFilterChips } from '@/components/community/FeedFilterChips';
import { PostCard } from '@/components/community/PostCard';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { listCommunityPosts, toggleCommunityPostLike } from '@/lib/community/postRepository';
import type { CommunityPost, FeedSortMode } from '@/lib/community/types';

export default function AssistantScreen() {
  const { t } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const [sortMode, setSortMode] = useState<FeedSortMode>('latest');
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [likeBusy, setLikeBusy] = useState(false);

  const loadPosts = useCallback(async () => {
    const rows = await listCommunityPosts(sortMode, customer?.id);
    setPosts(rows);
  }, [sortMode, customer?.id]);

  const onPostCreated = useCallback(
    (created: CommunityPost) => {
      setPosts((prev) => {
        const merged = [created, ...prev.filter((row) => row.id !== created.id)];
        return sortMode === 'latest'
          ? merged.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          : merged.sort((a, b) => {
              if (b.likeCount !== a.likeCount) return b.likeCount - a.likeCount;
              if (b.commentCount !== a.commentCount) return b.commentCount - a.commentCount;
              return b.createdAt.localeCompare(a.createdAt);
            });
      });
      void loadPosts();
    },
    [loadPosts, sortMode],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        setLoading(true);
        await loadPosts();
        if (active) setLoading(false);
      })();
      return () => {
        active = false;
      };
    }, [loadPosts]),
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadPosts();
    setRefreshing(false);
  }

  async function onLike(postId: string) {
    if (!customer || isGuest) {
      Alert.alert(t('guest_gate_header'), t('guest_settings_sign_in_hint'));
      return;
    }
    setLikeBusy(true);
    try {
      await toggleCommunityPostLike({ postId, userId: customer.id });
      await loadPosts();
    } catch (error) {
      Alert.alert(t('feed_like_fail_title'), logAndGetSafeErrorMessage(error, t, 'driverNetwork.likePost'));
    } finally {
      setLikeBusy(false);
    }
  }

  function onOpenComments(postId: string) {
    router.push(`/driver-network/${postId}` as Href);
  }

  const listHeader = useMemo(
    () => (
      <View style={styles.headerBlock}>
        <Text style={[styles.screenTitle, { color: theme.text }]}>{t('driver_network_title')}</Text>
        <Text style={[styles.screenLead, { color: theme.textMuted }]}>{t('feed_subtitle')}</Text>
        <FeedFilterChips value={sortMode} onChange={setSortMode} />
        <CreatePostCard onCreated={onPostCreated} />
      </View>
    ),
    [sortMode, theme, t, onPostCreated],
  );

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {loading && posts.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('driver_network_empty')}</Text>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={onLike}
              onOpenComments={onOpenComments}
              busy={likeBusy}
            />
          )}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  headerBlock: { gap: 12, marginBottom: 4 },
  screenTitle: { fontSize: 24, fontWeight: '900' },
  screenLead: { fontSize: 14, lineHeight: 21 },
  empty: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 12 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
