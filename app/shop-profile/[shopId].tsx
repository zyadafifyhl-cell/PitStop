import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import { useI18n } from '@/context/I18nContext';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { getShopById } from '@/lib/booking/catalogRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { getShopExtras } from '@/lib/booking/shopExtrasStorage';
import type { ShopExtras } from '@/lib/booking/types';
import { formatPhoneDisplay, openPhone, openShopInMaps } from '@/lib/linking/contact';
import { buildBookReturnTo } from '@/lib/auth/returnTo';

export default function ShopProfileScreen() {
  const { shopId } = useLocalSearchParams<{ shopId: string }>();
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { isGuest, customer } = useCustomerAuth();
  const { ready: catalogReady } = useShopCatalog();
  const [extras, setExtras] = useState<ShopExtras | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerUri, setViewerUri] = useState<string | null>(null);

  const shop = useMemo(
    () => (catalogReady && shopId ? getShopById(shopId) : undefined),
    [catalogReady, shopId],
  );

  const refreshExtras = useCallback(async () => {
    if (!shop) return;
    const row = await getShopExtras(shop.id);
    setExtras(row);
  }, [shop]);

  useFocusEffect(
    useCallback(() => {
      refreshExtras();
    }, [refreshExtras]),
  );

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  const shopName =
    locale === 'ar'
      ? extras?.profileNameAr || extras?.profileName || shop.nameAr
      : extras?.profileName || shop.name;
  const address =
    locale === 'ar'
      ? extras?.profileAddressAr || extras?.profileAddress || shop.addressAr
      : extras?.profileAddress || shop.address;
  const phone = extras?.profilePhone || shop.phone;
  const hasWinch =
    (shop.type === 'maintenance' || shop.type === 'winch') && !!extras?.winchEnabled;
  const winchPhone = extras?.winchPhone || phone;
  const email = extras?.profileEmail;
  const profileImage = extras?.profileImageUrl || extras?.imageUrls?.[0];
  const coverImage = extras?.imageUrls?.[0] || profileImage;
  const offers = (extras?.offers ?? []).filter((offer) => offer.active);

  function openViewer(uri?: string) {
    if (!uri) return;
    setViewerUri(uri);
    setViewerOpen(true);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg }} contentContainerStyle={styles.content}>
      <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {coverImage ? (
          <Pressable onPress={() => openViewer(coverImage)}>
            <Image source={{ uri: coverImage }} style={styles.coverImage} contentFit="cover" />
          </Pressable>
        ) : (
          <View style={[styles.coverImage, { backgroundColor: theme.bgElevated }]} />
        )}
        <View style={styles.profileRow}>
          {profileImage ? (
            <Pressable onPress={() => openViewer(profileImage)}>
              <Image source={{ uri: profileImage }} style={styles.profileImage} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={[styles.profileImage, { backgroundColor: theme.bgElevated, alignItems: 'center', justifyContent: 'center' }]}>
              <FontAwesome name="building" size={26} color={theme.textDim} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: theme.text }]}>{shopName}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {shopTypeLabel(shop.type, locale)} · {address}
            </Text>
            {shop.rating != null ? (
              <Text style={[styles.meta, { color: theme.textMuted }]}>★ {shop.rating.toFixed(1)}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable
            onPress={() =>
              isGuest || !customer
                ? router.push({
                    pathname: '/auth-required',
                    params: { intent: 'booking', returnTo: buildBookReturnTo(shop.id) },
                  })
                : router.push({ pathname: '/book/[shopId]', params: { shopId: shop.id } })
            }
            style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('shop_profile_book_now')}</Text>
          </Pressable>
          <Pressable onPress={() => openViewer(profileImage || coverImage)} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('shop_profile_view_image')}</Text>
          </Pressable>
        </View>
      </View>

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_contact')}</Text>
        <View style={styles.actionRow}>
          <Pressable onPress={() => openPhone(phone).catch(() => {})} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>
              {t('book_call_shop')} · {formatPhoneDisplay(phone)}
            </Text>
          </Pressable>
          <Pressable onPress={() => openShopInMaps(shop, locale).catch(() => {})} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('book_open_maps')}</Text>
          </Pressable>
        </View>
      </View>

      {extras?.imageUrls?.length ? (
        <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_album')}</Text>
          <View style={styles.albumGrid}>
            {extras.imageUrls.map((uri) => (
              <Pressable key={uri} onPress={() => openViewer(uri)}>
                <Image source={{ uri }} style={styles.albumImage} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      <View style={[styles.sectionCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('shop_profile_more_info')}</Text>
        <Text style={[styles.infoLine, { color: theme.textMuted }]}>
          {t('shop_profile_phone')}: {formatPhoneDisplay(phone)}
        </Text>
        {hasWinch ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_winch_available')}: {formatPhoneDisplay(winchPhone)}
          </Text>
        ) : null}
        {email ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_email')}: {email}
          </Text>
        ) : null}
        <Text style={[styles.infoLine, { color: theme.textMuted }]}>
          {t('shop_profile_address')}: {address}
        </Text>
        {extras?.servicePriceEgp != null ? (
          <Text style={[styles.infoLine, { color: theme.textMuted }]}>
            {t('shop_profile_price')}: {formatEgp(extras.servicePriceEgp, locale)}
          </Text>
        ) : null}
        {offers.length ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            {offers.map((offer) => (
              <View key={offer.id} style={[styles.offerChip, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.offerText, { color: theme.accent }]}>
                  {locale === 'ar' ? offer.titleAr || offer.title : offer.title}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <Modal visible={viewerOpen} transparent animationType="fade" onRequestClose={() => setViewerOpen(false)}>
        <View style={styles.viewerBackdrop}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerOpen(false)}>
            {viewerUri ? <Image source={{ uri: viewerUri }} style={styles.viewerImage} contentFit="contain" /> : null}
          </Pressable>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  heroCard: { borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  coverImage: { width: '100%', height: 170 },
  profileRow: { flexDirection: 'row', gap: 12, padding: 12, alignItems: 'center' },
  profileImage: { width: 90, height: 90, borderRadius: 45 },
  title: { fontSize: 22, fontWeight: '800' },
  meta: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 },
  primaryBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  primaryBtnText: { fontSize: 14, fontWeight: '800' },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
  sectionCard: { borderWidth: 1, borderRadius: 18, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginBottom: 8 },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  albumImage: { width: 102, height: 102, borderRadius: 10, backgroundColor: '#111' },
  infoLine: { fontSize: 14, lineHeight: 20 },
  offerChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  offerText: { fontSize: 12, fontWeight: '700' },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '92%', height: '78%' },
});
