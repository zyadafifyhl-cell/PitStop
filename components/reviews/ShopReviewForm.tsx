import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { StarRatingSelector } from '@/components/reviews/StarRatingSelector';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { addShopReview } from '@/lib/booking/reviewsStorage';

type Props = {
  shopId: string;
  onSubmitted?: () => void;
};

export function ShopReviewForm({ shopId, onSubmitted }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { customer, isGuest } = useCustomerAuth();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const customerName = useMemo(() => {
    if (!customer) return t('shop_review_anonymous');
    return customer.name?.trim() || customer.email?.split('@')[0] || t('shop_review_anonymous');
  }, [customer, t]);

  if (isGuest || !customer) {
    return (
      <View style={[styles.guestBox, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Text style={[styles.guestText, { color: theme.textMuted }]}>{t('shop_review_sign_in_hint')}</Text>
      </View>
    );
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
      setSubmitted(true);
      setBody('');
      setRating(0);
      onSubmitted?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : t('shop_review_submit_fail_body');
      Alert.alert(t('shop_review_submit_fail_title'), message);
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <View style={[styles.successBox, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        <Text style={[styles.successTitle, { color: theme.accent }]}>{t('shop_review_success_title')}</Text>
        <Text style={[styles.successBody, { color: theme.textMuted }]}>{t('shop_review_success_body')}</Text>
        <Pressable
          onPress={() => setSubmitted(false)}
          style={[styles.secondaryBtn, { borderColor: theme.border }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_review_write_another')}</Text>
        </Pressable>
      </View>
    );
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
  successBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginBottom: 12,
  },
  successTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  successBody: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
