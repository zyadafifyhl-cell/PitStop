import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { StarRatingSelector } from '@/components/reviews/StarRatingSelector';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { addShopReview } from '@/lib/booking/reviewsStorage';

type Props = {
  shopId: string;
  alreadyRated?: boolean;
  onSubmitted?: () => void;
};

function AlreadyRatedCard() {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <View style={[styles.alreadyRatedCard, { backgroundColor: theme.bgElevated, borderColor: theme.accent }]}>
      <View style={[styles.alreadyRatedIconWrap, { backgroundColor: theme.accentSoft }]}>
        <FontAwesome name="check-circle" size={28} color={theme.accent} />
      </View>
      <Text style={[styles.alreadyRatedText, { color: theme.text }]}>{t('shop_review_already_rated')}</Text>
    </View>
  );
}

export function ShopReviewForm({ shopId, alreadyRated = false, onSubmitted }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [checkingReview, setCheckingReview] = useState(false);
  const [hasRated, setHasRated] = useState(alreadyRated);

  const customerName = useMemo(() => {
    if (!customer) return t('shop_review_anonymous');
    return customer.name?.trim() || customer.email?.split('@')[0] || t('shop_review_anonymous');
  }, [customer, t]);

  useEffect(() => {
    setHasRated(alreadyRated);
  }, [alreadyRated]);

  const checkExistingReview = useCallback(async () => {
    if (!customer?.id || isGuest) {
      setHasRated(false);
      return;
    }
    if (alreadyRated) {
      setHasRated(true);
      return;
    }
    setCheckingReview(true);
    try {
      const { getCustomerShopReview } = await import('@/lib/booking/reviewsStorage');
      const existing = await getCustomerShopReview(shopId, customer.id);
      setHasRated(!!existing);
    } finally {
      setCheckingReview(false);
    }
  }, [alreadyRated, customer?.id, isGuest, shopId]);

  useFocusEffect(
    useCallback(() => {
      checkExistingReview();
    }, [checkExistingReview]),
  );

  if (isGuest || !customer) {
    return (
      <View style={[styles.guestBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Text style={[styles.guestText, { color: theme.textMuted }]}>{t('shop_review_sign_in_hint')}</Text>
      </View>
    );
  }

  if (checkingReview && !hasRated) {
    return (
      <View style={[styles.loadingBox, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  if (hasRated) {
    return <AlreadyRatedCard />;
  }

  async function onSubmit() {
    if (!customer) return;
    if (rating < 1) {
      Alert.alert(t('shop_review_missing_title'), t('shop_review_missing_rating'));
      return;
    }
    if (!body.trim()) {
      Alert.alert(t('shop_review_missing_title'), t('shop_review_missing_body'));
      return;
    }
    setBusy(true);
    try {
      await addShopReview({
        shopId,
        customerId: customer.id,
        customerName,
        rating,
        body: body.trim(),
      });
      setHasRated(true);
      setBody('');
      setRating(0);
      onSubmitted?.();
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'shop_review_already_exists'
          ? t('shop_review_already_rated')
          : error instanceof Error
            ? error.message
            : t('shop_review_submit_fail_body');
      if (error instanceof Error && error.message === 'shop_review_already_exists') {
        setHasRated(true);
      }
      Alert.alert(t('shop_review_submit_fail_title'), message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.form, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.formTitle, { color: theme.text }]}>{t('shop_review_form_title')}</Text>
      <Text style={[styles.formLead, { color: theme.textMuted }]}>{t('shop_review_form_lead')}</Text>
      <StarRatingSelector value={rating} onChange={setRating} disabled={busy} />
      <Text style={[styles.ratingHint, { color: rating > 0 ? theme.accent : theme.textDim }]}>
        {rating > 0 ? t('shop_review_rating_selected').replace('{rating}', String(rating)) : t('shop_review_rating_hint')}
      </Text>
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={t('shop_review_body_placeholder')}
        placeholderTextColor={theme.textDim}
        multiline
        editable={!busy}
        style={[
          styles.textArea,
          { color: theme.text, borderColor: theme.border, backgroundColor: theme.card },
        ]}
      />
      <Pressable
        onPress={onSubmit}
        disabled={busy}
        style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}>
        {busy ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_review_submit')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  formLead: {
    fontSize: 13,
    lineHeight: 20,
  },
  ratingHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    minHeight: 18,
  },
  textArea: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  guestBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  guestText: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  loadingBox: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  alreadyRatedCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 22,
    paddingHorizontal: 18,
    marginBottom: 12,
    alignItems: 'center',
    gap: 12,
  },
  alreadyRatedIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alreadyRatedText: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    textAlign: 'center',
  },
});
