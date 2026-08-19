import { Image } from 'expo-image';
import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import type { AppThemeTokens } from '@/constants/Theme';

type Props = {
  theme: AppThemeTokens;
  fieldStyle: object[];
  profileName: string;
  profileNameAr: string;
  profilePhone: string;
  profileEmail: string;
  profileAddress: string;
  profileAddressAr: string;
  moreInfo: string;
  moreInfoAr: string;
  pickingImage: boolean;
  imageUrls: string[];
  onChangeProfileName: (value: string) => void;
  onChangeProfileNameAr: (value: string) => void;
  onChangeProfilePhone: (value: string) => void;
  onChangeProfileEmail: (value: string) => void;
  onChangeProfileAddress: (value: string) => void;
  onChangeProfileAddressAr: (value: string) => void;
  onChangeMoreInfo: (value: string) => void;
  onChangeMoreInfoAr: (value: string) => void;
  onSaveProfile: () => void;
  onAddImage: () => void;
  onRemoveImage: (url: string) => void;
  mapPinBusy?: boolean;
  mapPinCoords?: { latitude: number; longitude: number } | null;
  onSetMapPin?: () => void;
};

export function StoreOwnerProfileSections({
  theme,
  fieldStyle,
  profileName,
  profileNameAr,
  profilePhone,
  profileEmail,
  profileAddress,
  profileAddressAr,
  moreInfo,
  moreInfoAr,
  pickingImage,
  imageUrls,
  onChangeProfileName,
  onChangeProfileNameAr,
  onChangeProfilePhone,
  onChangeProfileEmail,
  onChangeProfileAddress,
  onChangeProfileAddressAr,
  onChangeMoreInfo,
  onChangeMoreInfoAr,
  onSaveProfile,
  onAddImage,
  onRemoveImage,
  mapPinBusy,
  mapPinCoords,
  onSetMapPin,
}: Props) {
  const { t, tp } = useI18n();

  return (
    <>
      <OwnerSectionCard theme={theme} title={t('shop_manage_profile_title')} subtitle={t('store_owner_profile_lead')}>
        <TextInput
          placeholder={t('shop_manage_profile_name_placeholder')}
          placeholderTextColor={theme.textDim}
          value={profileName}
          onChangeText={onChangeProfileName}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('shop_manage_profile_name_ar_placeholder')}
          placeholderTextColor={theme.textDim}
          value={profileNameAr}
          onChangeText={onChangeProfileNameAr}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('shop_manage_profile_phone_placeholder')}
          placeholderTextColor={theme.textDim}
          keyboardType="phone-pad"
          value={profilePhone}
          onChangeText={onChangeProfilePhone}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('shop_manage_profile_email_placeholder')}
          placeholderTextColor={theme.textDim}
          keyboardType="email-address"
          autoCapitalize="none"
          value={profileEmail}
          onChangeText={onChangeProfileEmail}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('shop_manage_profile_address_placeholder')}
          placeholderTextColor={theme.textDim}
          value={profileAddress}
          onChangeText={onChangeProfileAddress}
          style={fieldStyle}
        />
        <TextInput
          placeholder={t('shop_manage_profile_address_ar_placeholder')}
          placeholderTextColor={theme.textDim}
          value={profileAddressAr}
          onChangeText={onChangeProfileAddressAr}
          style={fieldStyle}
        />
        {onSetMapPin ? (
          <>
            <Text style={[styles.inlineTitle, { color: theme.text }]}>{t('store_map_pin_title')}</Text>
            <Text style={[styles.emptyHint, { color: theme.textMuted, marginTop: 0, marginBottom: 8 }]}>
              {t('store_map_pin_lead')}
            </Text>
            {mapPinCoords ? (
              <Text style={[styles.emptyHint, { color: theme.accent, marginTop: 0, marginBottom: 8 }]}>
                {tp('store_map_pin_coords', {
                  lat: mapPinCoords.latitude.toFixed(5),
                  lng: mapPinCoords.longitude.toFixed(5),
                })}
              </Text>
            ) : null}
            <Pressable
              onPress={onSetMapPin}
              disabled={mapPinBusy}
              style={[styles.secondaryBtn, { borderColor: theme.border, opacity: mapPinBusy ? 0.65 : 1 }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
                {mapPinBusy ? t('store_map_pin_capturing') : t('store_map_pin_button')}
              </Text>
            </Pressable>
          </>
        ) : null}
        <Text style={[styles.inlineTitle, { color: theme.text }]}>{t('shop_manage_more_info_title')}</Text>
        <TextInput
          placeholder={t('shop_manage_more_info_placeholder')}
          placeholderTextColor={theme.textDim}
          value={moreInfo}
          onChangeText={onChangeMoreInfo}
          multiline
          style={[fieldStyle, styles.noteInput]}
        />
        <TextInput
          placeholder={t('shop_manage_more_info_ar_placeholder')}
          placeholderTextColor={theme.textDim}
          value={moreInfoAr}
          onChangeText={onChangeMoreInfoAr}
          multiline
          style={[fieldStyle, styles.noteInput]}
        />
        <Pressable onPress={onSaveProfile} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_manage_save_profile')}</Text>
        </Pressable>
      </OwnerSectionCard>

      <OwnerSectionCard theme={theme} title={t('shop_profile_album')} subtitle={t('shop_manage_image_label')}>
        <Pressable
          onPress={onAddImage}
          disabled={pickingImage}
          style={[styles.secondaryBtn, { borderColor: theme.border, opacity: pickingImage ? 0.65 : 1 }]}>
          <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
            {pickingImage ? t('shop_manage_picking_image') : t('shop_manage_add_image')}
          </Text>
        </Pressable>
        {imageUrls.length ? (
          <View style={styles.albumGrid}>
            {imageUrls.map((url) => (
              <View key={url} style={[styles.albumTile, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Image source={{ uri: url }} style={styles.albumImage} contentFit="cover" />
                <Pressable onPress={() => onRemoveImage(url)} style={[styles.removePhotoBtn, { backgroundColor: theme.danger }]}>
                  <Text style={styles.removePhotoText}>{t('shop_manage_remove_image')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.emptyHint, { color: theme.textMuted }]}>{t('shop_manage_profile_image_hint')}</Text>
        )}
      </OwnerSectionCard>
    </>
  );
}

const styles = StyleSheet.create({
  inlineTitle: { fontSize: 14, fontWeight: '800', marginTop: 14, marginBottom: 8 },
  noteInput: { minHeight: 88, textAlignVertical: 'top' },
  primaryBtn: { marginTop: 14, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  primaryBtnText: { fontWeight: '800', fontSize: 15 },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  albumTile: { width: '47%', minWidth: 140, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  albumImage: { width: '100%', height: 110 },
  removePhotoBtn: { paddingVertical: 8, alignItems: 'center' },
  removePhotoText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  emptyHint: { fontSize: 13, lineHeight: 19, marginTop: 10 },
});
