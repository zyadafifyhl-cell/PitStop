import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { createCommunityPost } from '@/lib/community/postRepository';
import type { CommunityPost, PostCategoryTag } from '@/lib/community/types';

type Props = {
  onCreated: (post: CommunityPost) => void;
};

const CATEGORY_OPTIONS: PostCategoryTag[] = ['questions', 'reviews', 'tips', 'general'];

export function CreatePostCard({ onCreated }: Props) {
  const { t } = useI18n();
  const theme = useAppTheme();
  const { customer, isGuest } = useCustomerAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [categoryTag, setCategoryTag] = useState<PostCategoryTag>('general');
  const [busy, setBusy] = useState(false);

  if (!customer || isGuest) {
    return (
      <View style={[styles.guestBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Text style={[styles.guestText, { color: theme.textMuted }]}>{t('feed_sign_in_hint')}</Text>
      </View>
    );
  }

  async function onSubmit() {
    if (!customer) return;
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      const created = await createCommunityPost({
        userId: customer.id,
        authorName: customer.name,
        title,
        content,
        categoryTag,
      });
      setTitle('');
      setContent('');
      setCategoryTag('general');
      onCreated(created);
    } catch (error) {
      Alert.alert(
        t('feed_create_fail_title'),
        logAndGetSafeErrorMessage(error, t, 'driverNetwork.createPost'),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.text }]}>{t('feed_create_title')}</Text>
      <View style={styles.tagRow}>
        {CATEGORY_OPTIONS.map((tag) => {
          const active = categoryTag === tag;
          return (
            <Pressable
              key={tag}
              onPress={() => setCategoryTag(tag)}
              style={[
                styles.tagChip,
                {
                  backgroundColor: active ? theme.accentSoft : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Text style={{ color: active ? theme.accent : theme.textMuted, fontSize: 12, fontWeight: '700' }}>
                {t(`feed_category_${tag}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('driver_network_post_title_placeholder')}
        placeholderTextColor={theme.textDim}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated }]}
      />
      <TextInput
        value={content}
        onChangeText={setContent}
        placeholder={t('driver_network_post_body_placeholder')}
        placeholderTextColor={theme.textDim}
        multiline
        style={[
          styles.input,
          styles.bodyInput,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
        ]}
      />
      <Pressable
        onPress={onSubmit}
        disabled={busy || !title.trim() || !content.trim()}
        style={[styles.submitBtn, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <Text style={[styles.submitText, { color: theme.onAccent }]}>{t('driver_network_create_post')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12, gap: 10 },
  title: { fontSize: 16, fontWeight: '800' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  bodyInput: { minHeight: 88, textAlignVertical: 'top' },
  submitBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  submitText: { fontSize: 14, fontWeight: '800' },
  guestBox: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  guestText: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
