import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  computeReviewStats,
  fetchShopReviewsHistory,
  filterOwnerReviews,
  reviewerInitial,
  sortOwnerReviews,
  type OwnerShopReview,
  type ReviewFilter,
  type ReviewSort,
} from '@/lib/booking/ownerReviewsRepository';
import {
  setReviewHidden,
  setReviewOwnerReply,
  setReviewReported,
} from '@/lib/booking/reviewsStorage';
import { getSupabase } from '@/lib/supabase/client';
import type { TranslationKey } from '@/lib/i18n/strings';
import { formatRelativeTimeAgo } from '@/lib/ui/relativeTime';

type Translate = (key: TranslationKey) => string;

type Props = {
  shopId: string;
  leadVariant?: 'owner' | 'manager';
};

const FILTER_OPTIONS: ReviewFilter[] = ['all', 'positive', 'critical', 'needs_reply'];
const SORT_OPTIONS: ReviewSort[] = ['newest', 'highest', 'lowest'];

function filterLabel(filter: ReviewFilter, t: Translate): string {
  switch (filter) {
    case 'positive':
      return t('owner_reviews_filter_positive');
    case 'critical':
      return t('owner_reviews_filter_critical');
    case 'needs_reply':
      return t('owner_reviews_filter_needs_reply');
    default:
      return t('owner_reviews_filter_all');
  }
}

function sortLabel(sort: ReviewSort, t: Translate): string {
  switch (sort) {
    case 'highest':
      return t('owner_reviews_sort_highest');
    case 'lowest':
      return t('owner_reviews_sort_lowest');
    default:
      return t('owner_reviews_sort_newest');
  }
}

export function OwnerReviewsHistory({ shopId, leadVariant = 'owner' }: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [reviews, setReviews] = useState<OwnerShopReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [sort, setSort] = useState<ReviewSort>('newest');
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadReviews = useCallback(async () => {
    try {
      const rows = await fetchShopReviewsHistory(shopId);
      setReviews(rows);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useFocusEffect(
    useCallback(() => {
      void loadReviews();
    }, [loadReviews]),
  );

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    const channel = supabase
      .channel(`owner-reviews:${shopId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shop_reviews', filter: `shop_id=eq.${shopId}` },
        () => {
          void loadReviews();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadReviews, shopId]);

  const stats = useMemo(() => computeReviewStats(reviews), [reviews]);
  const visibleReviews = useMemo(() => {
    const filtered = filterOwnerReviews(reviews, filter);
    return sortOwnerReviews(filtered, sort);
  }, [filter, reviews, sort]);
  const maxBreakdown = useMemo(
    () => Math.max(1, ...([1, 2, 3, 4, 5] as const).map((star) => stats.breakdown[star])),
    [stats.breakdown],
  );

  const fieldStyle = [
    styles.input,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  async function onSaveReply(reviewId: string) {
    const reply = replyDrafts[reviewId]?.trim();
    if (!reply) return;
    setBusyId(reviewId);
    try {
      await setReviewOwnerReply(shopId, reviewId, reply);
      await loadReviews();
      setReplyDrafts((prev) => ({ ...prev, [reviewId]: '' }));
      setReplyingId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function onToggleHidden(reviewId: string, hidden: boolean) {
    setBusyId(reviewId);
    try {
      await setReviewHidden(shopId, reviewId, hidden);
      await loadReviews();
    } finally {
      setBusyId(null);
    }
  }

  async function onReportReview(review: OwnerShopReview) {
    setBusyId(review.id);
    try {
      await setReviewReported(shopId, review.id, true);
      await setReviewHidden(shopId, review.id, true);
      if (review.customerId) {
        const supabase = getSupabase();
        if (supabase) {
          await supabase.from('notifications').insert({
            user_id: review.customerId,
            shop_id: shopId,
            review_id: review.id,
            type: 'review_dismissed',
            title: locale === 'ar' ? 'تم حذف التقييم' : 'Review removed',
            body:
              locale === 'ar'
                ? 'تم حذف تقييمك بواسطة إدارة المحل لمخالفته السياسات.'
                : 'Your review was removed by the merchant moderation team.',
            is_read: false,
            created_at: new Date().toISOString(),
          });
        }
      }
      await loadReviews();
      Alert.alert(t('wash_review_reported_title'), t('wash_review_reported_body'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <OwnerSectionCard
      theme={theme}
      title={t('owner_reviews_title')}
      subtitle={t(leadVariant === 'manager' ? 'owner_reviews_lead_manager' : 'owner_reviews_lead')}
      icon="star">
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.meta, { color: theme.textMuted }]}>{t('owner_reviews_loading')}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.summaryCard, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
            <View style={styles.summaryTop}>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>{t('owner_reviews_average')}</Text>
                <Text style={[styles.summaryAverage, { color: theme.text }]}>
                  {stats.average != null ? `★ ${stats.average.toFixed(1)} / 5.0` : '—'}
                </Text>
              </View>
              <Text style={[styles.summaryCount, { color: theme.textMuted }]}>
                {t('owner_reviews_total').replace('{count}', String(stats.total))}
              </Text>
            </View>
            {([5, 4, 3, 2, 1] as const).map((star) => (
              <View key={star} style={styles.breakdownRow}>
                <Text style={[styles.breakdownLabel, { color: theme.textMuted }]}>
                  {t('owner_reviews_star_row').replace('{stars}', String(star))}
                </Text>
                <View style={[styles.breakdownTrack, { backgroundColor: theme.card }]}>
                  <View
                    style={[
                      styles.breakdownFill,
                      {
                        backgroundColor: theme.accent,
                        width: `${Math.round((stats.breakdown[star] / maxBreakdown) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.breakdownCount, { color: theme.text }]}>{stats.breakdown[star]}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {FILTER_OPTIONS.map((option) => {
              const active = filter === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setFilter(option)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.accent : theme.bgElevated,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}>
                  <Text style={[styles.chipText, { color: active ? theme.onAccent : theme.text }]}>
                    {filterLabel(option, t)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Text style={[styles.sortLabel, { color: theme.textMuted }]}>{t('owner_reviews_sort_label')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {SORT_OPTIONS.map((option) => {
              const active = sort === option;
              return (
                <Pressable
                  key={option}
                  onPress={() => setSort(option)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.accentSoft : theme.bgElevated,
                      borderColor: active ? theme.accent : theme.border,
                    },
                  ]}>
                  <Text style={[styles.chipText, { color: active ? theme.accent : theme.text }]}>
                    {sortLabel(option, t)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {visibleReviews.length === 0 ? (
            <Text style={[styles.empty, { color: theme.textMuted }]}>{t('owner_reviews_empty')}</Text>
          ) : (
            visibleReviews.map((review) => {
              const isReplying = replyingId === review.id;
              const isBusy = busyId === review.id;
              const referenceTag =
                review.serviceReference ?? review.orderReference ?? null;
              return (
                <View
                  key={review.id}
                  style={[styles.reviewCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <View style={styles.reviewHeader}>
                    <View style={[styles.avatar, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
                      <Text style={[styles.avatarText, { color: theme.accent }]}>
                        {reviewerInitial(review.customerName)}
                      </Text>
                    </View>
                    <View style={styles.reviewHeaderText}>
                      <View style={styles.nameRow}>
                        <Text style={[styles.customerName, { color: theme.text }]} numberOfLines={1}>
                          {review.customerName}
                        </Text>
                        {review.hidden ? (
                          <View style={[styles.hiddenBadge, { backgroundColor: theme.bg }]}>
                            <Text style={[styles.hiddenBadgeText, { color: theme.textMuted }]}>
                              {t('owner_reviews_hidden_badge')}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.ratingLine, { color: theme.warm }]}>
                        {'★'.repeat(review.rating)}{'☆'.repeat(Math.max(0, 5 - review.rating))}
                      </Text>
                      <Text style={[styles.dateLine, { color: theme.textMuted }]}>
                        {formatRelativeTimeAgo(review.createdAt, locale)}
                      </Text>
                    </View>
                  </View>

                  {referenceTag ? (
                    <View style={[styles.referenceTag, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
                      <FontAwesome
                        name={review.serviceReference ? 'wrench' : 'shopping-bag'}
                        size={11}
                        color={theme.accent}
                      />
                      <Text style={[styles.referenceText, { color: theme.accent }]} numberOfLines={1}>
                        {referenceTag}
                      </Text>
                    </View>
                  ) : null}

                  <Text style={[styles.body, { color: theme.textMuted }]}>{review.body}</Text>

                  {review.ownerReply ? (
                    <View style={[styles.ownerReplyBox, { borderColor: theme.border }]}>
                      <Text style={[styles.ownerReplyLabel, { color: theme.accent }]}>
                        {t('wash_review_owner_reply')}
                      </Text>
                      <Text style={[styles.ownerReplyBody, { color: theme.text }]}>{review.ownerReply}</Text>
                    </View>
                  ) : null}

                  {isReplying ? (
                    <>
                      <TextInput
                        placeholder={t('wash_review_reply_placeholder')}
                        placeholderTextColor={theme.textDim}
                        value={replyDrafts[review.id] ?? review.ownerReply ?? ''}
                        onChangeText={(value) =>
                          setReplyDrafts((prev) => ({ ...prev, [review.id]: value }))
                        }
                        multiline
                        style={[fieldStyle, styles.noteInput]}
                      />
                      <Pressable
                        disabled={isBusy}
                        onPress={() => void onSaveReply(review.id)}
                        style={[
                          styles.primaryBtn,
                          { backgroundColor: theme.accent, opacity: isBusy ? 0.65 : 1 },
                        ]}>
                        <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
                          {t('wash_review_reply_save')}
                        </Text>
                      </Pressable>
                    </>
                  ) : null}

                  <View style={styles.actions}>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => {
                        setReplyingId(isReplying ? null : review.id);
                        if (!isReplying && review.ownerReply && !replyDrafts[review.id]) {
                          setReplyDrafts((prev) => ({ ...prev, [review.id]: review.ownerReply ?? '' }));
                        }
                      }}
                      style={[styles.chipBtn, { borderColor: theme.border, opacity: isBusy ? 0.65 : 1 }]}>
                      <Text style={[styles.chipBtnText, { color: theme.text }]}>
                        {t('owner_reviews_reply_action')}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => void onToggleHidden(review.id, !review.hidden)}
                      style={[styles.chipBtn, { borderColor: theme.border, opacity: isBusy ? 0.65 : 1 }]}>
                      <Text style={[styles.chipBtnText, { color: theme.text }]}>
                        {review.hidden ? t('owner_reviews_unhide') : t('wash_review_hide')}
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={isBusy}
                      onPress={() => void onReportReview(review)}
                      style={[
                        styles.chipBtn,
                        { backgroundColor: theme.danger, borderColor: theme.danger, opacity: isBusy ? 0.65 : 1 },
                      ]}>
                      <Text style={styles.actionText}>{t('wash_review_report')}</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </>
      )}
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  meta: { fontSize: 13 },
  summaryCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12, gap: 8 },
  summaryTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  summaryLabel: { fontSize: 12, fontWeight: '700' },
  summaryAverage: { fontSize: 22, fontWeight: '900', marginTop: 4 },
  summaryCount: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: { width: 34, fontSize: 12, fontWeight: '800' },
  breakdownTrack: { flex: 1, height: 8, borderRadius: 999, overflow: 'hidden' },
  breakdownFill: { height: '100%', borderRadius: 999 },
  breakdownCount: { width: 24, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  chipRow: { gap: 8, paddingVertical: 4, marginBottom: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  chipText: { fontSize: 12, fontWeight: '800' },
  sortLabel: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  empty: { fontSize: 14, lineHeight: 20, paddingVertical: 8 },
  reviewCard: { borderWidth: 1, borderRadius: 14, padding: 12, marginTop: 10, gap: 8 },
  reviewHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '900' },
  reviewHeaderText: { flex: 1, minWidth: 0, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  customerName: { fontSize: 15, fontWeight: '900', flexShrink: 1 },
  hiddenBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  hiddenBadgeText: { fontSize: 10, fontWeight: '800' },
  ratingLine: { fontSize: 13, fontWeight: '800' },
  dateLine: { fontSize: 12, fontWeight: '600' },
  referenceTag: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  referenceText: { fontSize: 11, fontWeight: '800', maxWidth: 220 },
  body: { fontSize: 14, lineHeight: 20 },
  ownerReplyBox: { borderLeftWidth: 3, paddingLeft: 10, gap: 4 },
  ownerReplyLabel: { fontSize: 12, fontWeight: '800' },
  ownerReplyBody: { fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginTop: 4,
  },
  noteInput: { minHeight: 72, textAlignVertical: 'top' },
  primaryBtn: { marginTop: 8, borderRadius: 9, paddingVertical: 12, alignItems: 'center' },
  primaryBtnText: { fontWeight: '600', fontSize: 14, letterSpacing: 0.5 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chipBtn: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  chipBtnText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
});
