import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { deployShopCampaign } from '@/lib/booking/offerRepository';
import type { OfferType } from '@/lib/booking/types';
import { userAlert } from '@/lib/ui/userAlert';

type Props = {
  shopId: string;
  onDeployed?: () => void | Promise<void>;
};

const OFFER_TYPES: OfferType[] = ['percentage', 'flat_amount', 'buy_x_get_y', 'bogo'];

export function MerchantCampaignForm({ shopId, onDeployed }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [offerType, setOfferType] = useState<OfferType>('percentage');
  const [discountValue, setDiscountValue] = useState('20');
  const [requiredWashCount, setRequiredWashCount] = useState('2');
  const [buyQuantity, setBuyQuantity] = useState('1');
  const [getFreeQuantity, setGetFreeQuantity] = useState('1');
  const [validDays, setValidDays] = useState('30');
  const [deploying, setDeploying] = useState(false);

  const fieldStyle = useMemo(
    () => [
      styles.field,
      { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
    ],
    [theme],
  );

  const typeOptions = useMemo(
    () =>
      OFFER_TYPES.map((type) => ({
        id: type,
        label:
          type === 'percentage'
            ? t('campaign_type_percentage')
            : type === 'flat_amount'
              ? t('campaign_type_flat')
              : type === 'bogo'
                ? t('campaign_type_bogo')
                : t('campaign_type_buy_x'),
      })),
    [t],
  );

  async function onDeploy() {
    if (!title.trim()) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }

    const value = Number(discountValue);
    const days = Number(validDays);
    const buyCount = Number(requiredWashCount);
    const buyQty = Number(buyQuantity);
    const freeQty = Number(getFreeQuantity);

    if (offerType !== 'buy_x_get_y' && offerType !== 'bogo' && (Number.isNaN(value) || value <= 0)) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }
    if (offerType === 'percentage' && value > 100) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }
    if (offerType === 'buy_x_get_y' && (Number.isNaN(buyCount) || buyCount < 1)) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }
    if (
      offerType === 'bogo' &&
      (Number.isNaN(buyQty) || buyQty < 1 || Number.isNaN(freeQty) || freeQty < 1)
    ) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }
    if (Number.isNaN(days) || days < 1) {
      userAlert(t('campaign_invalid_title'), t('campaign_invalid_body'));
      return;
    }

    setDeploying(true);
    try {
      await deployShopCampaign({
        shopId,
        title: title.trim(),
        description: description.trim(),
        offerType,
        discountValue: offerType === 'buy_x_get_y' || offerType === 'bogo' ? 0 : value,
        requiredWashCount: offerType === 'buy_x_get_y' ? buyCount : 0,
        buyQuantity: offerType === 'bogo' ? buyQty : undefined,
        getFreeQuantity: offerType === 'bogo' ? freeQty : undefined,
        validDays: days,
      });
      setTitle('');
      setDescription('');
      setDiscountValue('20');
      setRequiredWashCount('2');
      setBuyQuantity('1');
      setGetFreeQuantity('1');
      setValidDays('30');
      await onDeployed?.();
      userAlert(t('campaign_deploy_success_title'), t('campaign_deploy_success_body'));
    } catch {
      userAlert(t('campaign_deploy_fail_title'), t('campaign_deploy_fail_body'));
    } finally {
      setDeploying(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={t('campaign_title_placeholder')}
        placeholderTextColor={theme.textDim}
        style={fieldStyle}
      />
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={t('campaign_description_placeholder')}
        placeholderTextColor={theme.textDim}
        multiline
        style={[fieldStyle, styles.multiline]}
      />

      <Text style={[styles.label, { color: theme.text }]}>{t('campaign_type_label')}</Text>
      <View style={styles.typeRow}>
        {typeOptions.map((option) => {
          const active = offerType === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setOfferType(option.id)}
              style={[
                styles.typeChip,
                {
                  backgroundColor: active ? theme.accent : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Text style={[styles.typeChipText, { color: active ? theme.onAccent : theme.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {offerType === 'percentage' ? (
        <TextInput
          value={discountValue}
          onChangeText={setDiscountValue}
          placeholder={t('campaign_discount_pct_placeholder')}
          placeholderTextColor={theme.textDim}
          keyboardType="numeric"
          style={fieldStyle}
        />
      ) : null}

      {offerType === 'flat_amount' ? (
        <TextInput
          value={discountValue}
          onChangeText={setDiscountValue}
          placeholder={t('campaign_discount_egp_placeholder')}
          placeholderTextColor={theme.textDim}
          keyboardType="numeric"
          style={fieldStyle}
        />
      ) : null}

      {offerType === 'buy_x_get_y' ? (
        <TextInput
          value={requiredWashCount}
          onChangeText={setRequiredWashCount}
          placeholder={t('campaign_buy_count_placeholder')}
          placeholderTextColor={theme.textDim}
          keyboardType="numeric"
          style={fieldStyle}
        />
      ) : null}

      {offerType === 'bogo' ? (
        <>
          <TextInput
            value={buyQuantity}
            onChangeText={setBuyQuantity}
            placeholder={t('campaign_bogo_buy_placeholder')}
            placeholderTextColor={theme.textDim}
            keyboardType="numeric"
            style={fieldStyle}
          />
          <TextInput
            value={getFreeQuantity}
            onChangeText={setGetFreeQuantity}
            placeholder={t('campaign_bogo_free_placeholder')}
            placeholderTextColor={theme.textDim}
            keyboardType="numeric"
            style={fieldStyle}
          />
        </>
      ) : null}

      <TextInput
        value={validDays}
        onChangeText={setValidDays}
        placeholder={t('campaign_valid_days_placeholder')}
        placeholderTextColor={theme.textDim}
        keyboardType="numeric"
        style={fieldStyle}
      />

      <Pressable
        onPress={() => {
          void onDeploy();
        }}
        disabled={deploying}
        style={[styles.deployBtn, { backgroundColor: theme.accent, opacity: deploying ? 0.7 : 1 }]}>
        {deploying ? (
          <ActivityIndicator color={theme.onAccent} />
        ) : (
          <Text style={[styles.deployBtnText, { color: theme.onAccent }]}>{t('campaign_deploy_btn')}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  field: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  multiline: { minHeight: 72, textAlignVertical: 'top' },
  label: { fontSize: 14, fontWeight: '700', marginTop: 2 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipText: { fontSize: 12, fontWeight: '800' },
  deployBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  deployBtnText: { fontSize: 15, fontWeight: '800' },
});
