import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getAreaById, listAreas, updateShopAreaRemote } from '@/lib/booking/catalogRepository';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { userAlert, userConfirm } from '@/lib/ui/userAlert';

/** Owner-only: the area customers browse to find this shop (set at registration). */
export function OwnerShopAreaCard() {
  const theme = useAppTheme();
  const { t, tp, locale, isRTL } = useI18n();
  const { shop, isOwner, patchShop } = useShopAuth();
  const { ready: catalogReady, version: catalogVersion, reload: reloadCatalog } = useShopCatalog();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const areas = useMemo(
    () => (catalogReady ? listAreas() : []),
    // catalogVersion bumps when areas load from the network.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogReady, catalogVersion],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return areas;
    return areas.filter((area) =>
      [area.name, area.nameAr, area.city, area.cityAr].some((value) => value?.toLowerCase().includes(q)),
    );
  }, [areas, search]);

  if (!shop || !isOwner) return null;

  const current = getAreaById(shop.areaId);
  const areaLabel = (area: { name: string; nameAr: string; city: string; cityAr: string }) =>
    locale === 'ar' ? `${area.nameAr} · ${area.cityAr}` : `${area.name} · ${area.city}`;

  async function saveArea(areaId: string) {
    if (!shop || areaId === shop.areaId || savingId) {
      setOpen(false);
      return;
    }
    const next = getAreaById(areaId);
    const nextLabel = next ? (locale === 'ar' ? next.nameAr : next.name) : areaId;
    const confirmed = await userConfirm(
      t('owner_area_confirm_title'),
      tp('owner_area_confirm_body', { area: nextLabel }),
    );
    if (!confirmed) return;
    setSavingId(areaId);
    try {
      await updateShopAreaRemote(shop.id, areaId);
      patchShop({ areaId });
      setOpen(false);
      setSearch('');
      void reloadCatalog();
      userAlert(t('owner_area_saved_title'), tp('owner_area_saved_body', { area: nextLabel }));
    } catch (error) {
      userAlert(t('owner_area_save_fail'), logAndGetSafeErrorMessage(error, t, 'owner.area'));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <OwnerSectionCard theme={theme} title={t('owner_area_title')} subtitle={t('owner_area_lead')} icon="map-marker">
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={[
          styles.selector,
          isRTL && styles.rowRtl,
          { borderColor: theme.border, backgroundColor: theme.bgElevated },
        ]}>
        <FontAwesome name="map-marker" size={15} color={theme.accent} />
        <View style={styles.selectorText}>
          <Text style={[styles.selectorLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
            {t('owner_area_current')}
          </Text>
          <Text style={[styles.selectorValue, { color: theme.text }, isRTL && styles.textRtl]} numberOfLines={1}>
            {current ? areaLabel(current) : t('owner_area_none')}
          </Text>
        </View>
        <FontAwesome name="chevron-down" size={12} color={theme.textMuted} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.header, isRTL && styles.rowRtl, { borderBottomColor: theme.border }]}>
              <Text style={[styles.title, { color: theme.text }]}>{t('owner_area_pick_title')}</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8} accessibilityLabel={t('alert_cancel')}>
                <FontAwesome name="times" size={18} color={theme.textMuted} />
              </Pressable>
            </View>
            <View style={[styles.searchField, isRTL && styles.rowRtl, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <FontAwesome name="search" size={13} color={theme.textMuted} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('location_search_area')}
                placeholderTextColor={theme.textDim}
                style={[styles.searchInput, { color: theme.text }, isRTL && styles.textRtl]}
              />
            </View>
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {filtered.length === 0 ? (
                <Text style={[styles.empty, { color: theme.textMuted }]}>{t('owner_area_no_match')}</Text>
              ) : (
                filtered.map((area, index) => {
                  const selected = area.id === shop.areaId;
                  return (
                    <Pressable
                      key={area.id}
                      onPress={() => void saveArea(area.id)}
                      disabled={!!savingId}
                      style={({ pressed }) => [
                        styles.row,
                        isRTL && styles.rowRtl,
                        index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                        (pressed || selected) && { backgroundColor: selected ? theme.accentSoft : theme.bgElevated },
                      ]}>
                      <View style={styles.rowText}>
                        <Text
                          style={[styles.rowTitle, { color: selected ? theme.accent : theme.text }, isRTL && styles.textRtl]}>
                          {locale === 'ar' ? area.nameAr : area.name}
                        </Text>
                        <Text style={[styles.rowSub, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                          {locale === 'ar' ? area.cityAr : area.city}
                        </Text>
                      </View>
                      {savingId === area.id ? (
                        <ActivityIndicator size="small" color={theme.accent} />
                      ) : selected ? (
                        <FontAwesome name="check" size={14} color={theme.accent} />
                      ) : null}
                    </Pressable>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  selector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  selectorText: { flex: 1, minWidth: 0 },
  selectorLabel: { fontSize: 11, fontWeight: '700' },
  selectorValue: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  rowRtl: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  backdrop: BOXED_OVERLAY.backdrop,
  card: {
    ...BOXED_OVERLAY.card,
    padding: 0,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 17, fontWeight: '900' },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    margin: 12,
    minHeight: 42,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, minWidth: 0 },
  list: { flexGrow: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 15, fontWeight: '800' },
  rowSub: { fontSize: 12, marginTop: 2 },
  empty: { padding: 16, fontSize: 13 },
});
