import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { applyOfferDiscount, normalizeOfferDiscount, type BogoPricingResult } from '@/lib/booking/offerPricing';
import type { ShopService } from '@/lib/booking/types';

type CampaignPricing = {
  originalEgp: number;
  discountedEgp: number;
  offerLabel: string;
  savingsEgp: number;
  isBogo?: boolean;
};

type Props = {
  services: ShopService[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  discountPercentage?: number;
  campaignPricing?: CampaignPricing | null;
  allowDuplicateServices?: boolean;
  bogoPricing?: BogoPricingResult | null;
};

export function ServiceMultiPicker({
  services,
  selectedIds,
  onChange,
  disabled,
  discountPercentage = 0,
  campaignPricing = null,
  allowDuplicateServices = false,
  bogoPricing = null,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const [openPickerIndex, setOpenPickerIndex] = useState<number | null>(null);
  const [addDropdownOpen, setAddDropdownOpen] = useState(false);

  const activeServices = useMemo(
    () => services.filter((s) => s.active && s.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [services],
  );

  const rows = selectedIds.length ? selectedIds : activeServices[0]?.id ? [activeServices[0].id] : [];

  const availableToAdd = useMemo(
    () =>
      allowDuplicateServices
        ? activeServices
        : activeServices.filter((s) => !rows.includes(s.id)),
    [activeServices, rows, allowDuplicateServices],
  );

  const serviceQuantityInCart = useMemo(() => {
    const counts = new Map<string, number>();
    for (const id of rows) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [rows]);

  function serviceLabel(service: ShopService | undefined): string {
    if (!service) return t('book_service_pick_hint');
    return locale === 'ar' ? service.nameAr || service.name : service.name;
  }

  function setRowService(index: number, serviceId: string) {
    const next = [...rows];
    next[index] = serviceId;
    onChange(next);
    setOpenPickerIndex(null);
  }

  function addServiceFromDropdown(serviceId: string) {
    if (!allowDuplicateServices && rows.includes(serviceId)) return;
    onChange([...rows, serviceId]);
    setAddDropdownOpen(false);
  }

  function duplicateRow(index: number) {
    const serviceId = rows[index];
    if (!serviceId) return;
    onChange([...rows.slice(0, index + 1), serviceId, ...rows.slice(index + 1)]);
  }

  function removeRow(index: number) {
    if (rows.length <= 1) return;
    onChange(rows.filter((_, i) => i !== index));
  }

  const discountPct = normalizeOfferDiscount(discountPercentage);

  const totalPrice = rows.reduce((sum, id) => {
    const svc = activeServices.find((s) => s.id === id);
    return sum + (svc?.priceEgp ?? 0);
  }, 0);

  const showCampaignBreakdown = !!campaignPricing && campaignPricing.savingsEgp > 0;
  const displayOriginalTotal = showCampaignBreakdown ? campaignPricing!.originalEgp : totalPrice;
  const displayFinalTotal = showCampaignBreakdown
    ? campaignPricing!.discountedEgp
    : discountPct > 0
      ? applyOfferDiscount(totalPrice, discountPct)
      : totalPrice;
  const showStrikePrice = showCampaignBreakdown || discountPct > 0;

  function priceLabel(priceEgp: number): string {
    if (discountPct <= 0) return formatEgp(priceEgp, locale);
    const discounted = applyOfferDiscount(priceEgp, discountPct);
    return `${formatEgp(discounted, locale)} (${formatEgp(priceEgp, locale)})`;
  }

  const totalMinutes = rows.reduce((sum, id) => {
    const svc = activeServices.find((s) => s.id === id);
    return sum + (svc?.durationMinutes ?? 0);
  }, 0);

  if (!activeServices.length) {
    return (
      <Text style={[styles.empty, { color: theme.textMuted }]}>{t('book_no_services_available')}</Text>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: theme.text }]}>{t('book_services_heading')}</Text>
      {rows.map((serviceId, index) => {
        const service = activeServices.find((s) => s.id === serviceId) ?? activeServices[0];
        const qtyForService = serviceQuantityInCart.get(serviceId) ?? 0;
        const freeUnitsForService = bogoPricing?.lineFreeUnits[serviceId] ?? 0;
        const showFreeBadge = freeUnitsForService > 0 && qtyForService > 0;
        return (
          <View key={`${index}-${serviceId}`} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Pressable
              onPress={() => !disabled && setOpenPickerIndex(index)}
              disabled={disabled}
              style={styles.selector}>
              <Text style={[styles.selectorLabel, { color: theme.textMuted }]}>
                {t('book_service_row_label').replace('{n}', String(index + 1))}
              </Text>
              <Text style={[styles.selectorValue, { color: theme.text }]} numberOfLines={2}>
                {serviceLabel(service)}
              </Text>
              {service ? (
                <Text style={[styles.selectorMeta, { color: theme.accent }]}>
                  {priceLabel(service.priceEgp)} · {service.durationMinutes}{' '}
                  {locale === 'ar' ? 'د' : 'min'}
                  {qtyForService > 1 ? ` · ×${qtyForService}` : ''}
                </Text>
              ) : null}
              {showFreeBadge ? (
                <View style={[styles.promoBadge, { backgroundColor: theme.warmSoft, borderColor: theme.warm }]}>
                  <Text style={[styles.promoBadgeText, { color: theme.warm }]}>
                    {t('book_bogo_item_free_badge').replace('{count}', String(freeUnitsForService))}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {allowDuplicateServices ? (
              <Pressable
                onPress={() => !disabled && duplicateRow(index)}
                disabled={disabled}
                style={styles.duplicateBtn}>
                <Text style={[styles.duplicateText, { color: theme.accent }]}>+</Text>
              </Pressable>
            ) : null}
            {rows.length > 1 ? (
              <Pressable onPress={() => removeRow(index)} disabled={disabled} style={styles.removeBtn}>
                <Text style={[styles.removeText, { color: theme.danger }]}>×</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}

      {availableToAdd.length > 0 ? (
        <View style={styles.addBlock}>
          <Text style={[styles.addLabel, { color: theme.textMuted }]}>
            {allowDuplicateServices ? t('book_add_service_bogo') : t('book_add_service')}
          </Text>
          <Pressable
            onPress={() => !disabled && setAddDropdownOpen(true)}
            disabled={disabled}
            style={[styles.dropdown, { borderColor: theme.border, backgroundColor: theme.card }]}>
            <Text style={[styles.dropdownPlaceholder, { color: theme.textDim }]}>
              {t('book_add_service_dropdown_hint')}
            </Text>
            <FontAwesome name="chevron-down" size={12} color={theme.textMuted} />
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.totals, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.totalsLabel, { color: theme.textMuted }]}>{t('book_services_total')}</Text>
        <View style={styles.totalsValueWrap}>
          {showStrikePrice ? (
            <View style={styles.totalsPriceRow}>
              <Text style={[styles.totalsStrike, { color: theme.textDim }]}>
                {formatEgp(displayOriginalTotal, locale)}
              </Text>
              <Text style={[styles.totalsValue, { color: theme.danger }]}>
                {formatEgp(displayFinalTotal, locale)}
              </Text>
            </View>
          ) : (
            <Text style={[styles.totalsValue, { color: theme.text }]}>{formatEgp(displayFinalTotal, locale)}</Text>
          )}
          <Text style={[styles.totalsMinutes, { color: theme.textMuted }]}>
            · {totalMinutes} {locale === 'ar' ? 'دقيقة' : 'min'}
          </Text>
        </View>
      </View>

      {bogoPricing?.nudgeNeeded ? (
        <View style={[styles.bogoNudge, { borderColor: theme.warm, backgroundColor: theme.warmSoft }]}>
          <Text style={[styles.bogoNudgeText, { color: theme.warm }]}>{t('book_bogo_nudge')}</Text>
        </View>
      ) : null}

      {showCampaignBreakdown ? (
        <View style={[styles.offerBreakdown, { borderColor: theme.warm, backgroundColor: theme.warmSoft }]}>
          <Text style={[styles.offerBreakdownLabel, { color: theme.warm }]}>{t('book_offer_promotion_applied')}</Text>
          <Text style={[styles.offerBreakdownOffer, { color: theme.text }]} numberOfLines={2}>
            {campaignPricing!.offerLabel}
          </Text>
          <Text style={[styles.offerBreakdownSaving, { color: theme.danger }]}>
            {t('book_offer_savings').replace('{amount}', formatEgp(campaignPricing!.savingsEgp, locale))}
          </Text>
        </View>
      ) : null}

      <Modal visible={openPickerIndex != null} transparent animationType="fade" onRequestClose={() => setOpenPickerIndex(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpenPickerIndex(null)}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_service_pick_title')}</Text>
            <ScrollView style={styles.modalList}>
              {activeServices.map((service) => {
                const selected = openPickerIndex != null && rows[openPickerIndex] === service.id;
                const takenElsewhere =
                  !allowDuplicateServices &&
                  openPickerIndex != null &&
                  rows.includes(service.id) &&
                  rows[openPickerIndex] !== service.id;
                return (
                  <Pressable
                    key={service.id}
                    onPress={() => {
                      if (openPickerIndex != null && !takenElsewhere) {
                        setRowService(openPickerIndex, service.id);
                      }
                    }}
                    disabled={takenElsewhere}
                    style={[
                      styles.modalOption,
                      {
                        borderColor: selected ? theme.accent : theme.border,
                        backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                        opacity: takenElsewhere ? 0.45 : 1,
                      },
                    ]}>
                    <Text style={[styles.modalOptionTitle, { color: theme.text }]}>{serviceLabel(service)}</Text>
                    <Text style={[styles.modalOptionMeta, { color: theme.textMuted }]}>
                      {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                      {locale === 'ar' ? 'د' : 'min'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>

      <Modal visible={addDropdownOpen} transparent animationType="fade" onRequestClose={() => setAddDropdownOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddDropdownOpen(false)}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('book_add_service')}</Text>
            <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>{t('book_add_service_dropdown_hint')}</Text>
            <ScrollView style={styles.modalList}>
              {availableToAdd.map((service) => (
                <Pressable
                  key={service.id}
                  onPress={() => addServiceFromDropdown(service.id)}
                  style={[styles.modalOption, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.modalOptionTitle, { color: theme.text }]}>{serviceLabel(service)}</Text>
                  <Text style={[styles.modalOptionMeta, { color: theme.textMuted }]}>
                    {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                    {locale === 'ar' ? 'د' : 'min'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginBottom: 12 },
  heading: { fontSize: 15, fontWeight: '800', marginBottom: 2 },
  empty: { fontSize: 13, marginBottom: 12 },
  row: {
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
  },
  selector: { flex: 1, padding: 12 },
  selectorLabel: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  selectorValue: { fontSize: 15, fontWeight: '800' },
  selectorMeta: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  promoBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  promoBadgeText: { fontSize: 11, fontWeight: '800' },
  duplicateBtn: { width: 40, alignItems: 'center', justifyContent: 'center' },
  duplicateText: { fontSize: 22, fontWeight: '800' },
  bogoNudge: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  bogoNudgeText: { fontSize: 13, fontWeight: '700', lineHeight: 18 },
  removeBtn: { width: 44, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontSize: 24, fontWeight: '700' },
  addBlock: { gap: 6 },
  addLabel: { fontSize: 12, fontWeight: '700' },
  dropdown: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownPlaceholder: { fontSize: 14, fontWeight: '600', flex: 1 },
  totals: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalsLabel: { fontSize: 13, fontWeight: '600' },
  totalsValueWrap: { alignItems: 'flex-end', gap: 2 },
  totalsPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalsStrike: { fontSize: 13, fontWeight: '700', textDecorationLine: 'line-through' },
  totalsValue: { fontSize: 15, fontWeight: '900' },
  totalsMinutes: { fontSize: 12, fontWeight: '700' },
  offerBreakdown: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    gap: 4,
  },
  offerBreakdownLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  offerBreakdownOffer: { fontSize: 14, fontWeight: '800', lineHeight: 20 },
  offerBreakdownSaving: { fontSize: 13, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderWidth: 1,
    borderRadius: 16,
    maxHeight: '70%',
    padding: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  modalSubtitle: { fontSize: 13, marginBottom: 10, lineHeight: 18 },
  modalList: { maxHeight: 360 },
  modalOption: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  modalOptionTitle: { fontSize: 14, fontWeight: '800' },
  modalOptionMeta: { fontSize: 12, marginTop: 4 },
});
