import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp, normalizeBookingMoney } from '@/lib/booking/reporting';
import { createWalkInBooking } from '@/lib/booking/storage';
import type { Booking, Shop, ShopService } from '@/lib/booking/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  shop: Shop;
  branchId: string;
  branchLabel: string;
  services: ShopService[];
  onCreated: (booking: Booking) => void;
};

type Step = 'form' | 'invoice';

export function WalkInBookingModal({
  visible,
  onClose,
  shop,
  branchId,
  branchLabel,
  services,
  onCreated,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [step, setStep] = useState<Step>('form');
  const [carType, setCarType] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedServiceId, setSelectedServiceId] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  const activeServices = useMemo(
    () => services.filter((s) => s.active && s.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [services],
  );

  const selectedService = useMemo(
    () => activeServices.find((s) => s.id === selectedServiceId) ?? activeServices[0],
    [activeServices, selectedServiceId],
  );

  useEffect(() => {
    if (!visible) return;
    setStep('form');
    setCarType('');
    setPhone('');
    setNotes('');
    setSelectedServiceId(activeServices[0]?.id);
    setCreatedBooking(null);
    setBusy(false);
  }, [visible, activeServices]);

  const fieldStyle = [
    styles.input,
    {
      color: theme.text,
      borderColor: theme.border,
      backgroundColor: theme.bgElevated,
      textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left',
      writingDirection: (isRTL ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    },
  ];

  async function onSubmitForm() {
    if (!carType.trim()) {
      Alert.alert(t('walk_in_missing_title'), t('walk_in_missing_vehicle'));
      return;
    }
    if (!selectedService) {
      Alert.alert(t('walk_in_missing_title'), t('walk_in_missing_service'));
      return;
    }
    setBusy(true);
    try {
      const booking = await createWalkInBooking({
        shopId: shop.id,
        branchId,
        carType: carType.trim(),
        customerPhone: phone.trim() || undefined,
        serviceId: selectedService.id,
        serviceName: selectedService.name,
        serviceNameAr: selectedService.nameAr,
        servicePriceEgp: selectedService.priceEgp,
        serviceDurationMinutes: selectedService.durationMinutes,
        customerNotes: notes.trim() || undefined,
      });
      setCreatedBooking(booking);
      setStep('invoice');
      onCreated(booking);
    } catch (error) {
      const message = error instanceof Error ? error.message : t('walk_in_submit_fail_body');
      Alert.alert(t('walk_in_submit_fail_title'), message);
    } finally {
      setBusy(false);
    }
  }

  function onCloseModal() {
    onClose();
  }

  const invoiceMoney = createdBooking ? normalizeBookingMoney(createdBooking) : null;
  const serviceLabel = selectedService
    ? locale === 'ar'
      ? selectedService.nameAr || selectedService.name
      : selectedService.name
    : '—';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCloseModal}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }, isRTL && styles.textRtl]}>{t('walk_in_modal_title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }, isRTL && styles.textRtl]}>
            {branchLabel} · {shop.name}
          </Text>

          {step === 'form' ? (
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              <TextInput
                value={carType}
                onChangeText={setCarType}
                placeholder={t('walk_in_car_type_placeholder')}
                placeholderTextColor={theme.textDim}
                style={fieldStyle}
              />
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder={t('walk_in_phone_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="phone-pad"
                style={fieldStyle}
              />
              <Text style={[styles.fieldHint, { color: theme.textDim }, isRTL && styles.textRtl]}>
                {t('walk_in_phone_hint')}
              </Text>

              <Text style={[styles.sectionLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('walk_in_service_label')}
              </Text>
              {activeServices.length === 0 ? (
                <Text style={[styles.emptyHint, { color: theme.textDim }]}>{t('walk_in_no_services')}</Text>
              ) : (
                <View style={styles.serviceList}>
                  {activeServices.map((service) => {
                    const label = locale === 'ar' ? service.nameAr || service.name : service.name;
                    const selected = service.id === (selectedServiceId ?? activeServices[0]?.id);
                    return (
                      <Pressable
                        key={service.id}
                        onPress={() => setSelectedServiceId(service.id)}
                        style={[
                          styles.serviceChip,
                          {
                            borderColor: selected ? theme.accent : theme.border,
                            backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                          },
                        ]}>
                        <Text style={[styles.serviceChipTitle, { color: theme.text }]}>{label}</Text>
                        <Text style={[styles.serviceChipMeta, { color: theme.textMuted }]}>
                          {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                          {locale === 'ar' ? 'د' : 'min'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t('walk_in_notes_placeholder')}
                placeholderTextColor={theme.textDim}
                multiline
                style={[...fieldStyle, styles.noteInput]}
              />

              {selectedService ? (
                <View style={[styles.previewBox, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.previewLabel, { color: theme.textMuted }]}>{t('walk_in_price_preview')}</Text>
                  <Text style={[styles.previewValue, { color: theme.accent }]}>
                    {formatEgp(selectedService.priceEgp, locale)}
                  </Text>
                </View>
              ) : null}

              <Pressable
                onPress={onSubmitForm}
                disabled={busy || activeServices.length === 0}
                style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}>
                {busy ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('walk_in_submit')}</Text>
                )}
              </Pressable>
              <Pressable onPress={onCloseModal} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('add_cancel')}</Text>
              </Pressable>
            </ScrollView>
          ) : createdBooking && invoiceMoney ? (
            <View style={styles.invoiceWrap}>
              <View style={[styles.invoiceCard, { borderColor: theme.accent, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.invoiceHeading, { color: theme.text }]}>{t('walk_in_invoice_title')}</Text>
                <Text style={[styles.invoiceMeta, { color: theme.textMuted }]}>
                  {formatBookingDateTime(createdBooking.scheduledAt, locale)}
                </Text>
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>{t('walk_in_invoice_service')}</Text>
                  <Text style={[styles.invoiceValue, { color: theme.text, textAlign: isRTL ? 'left' : 'right' }]}>
                    {serviceLabel}
                  </Text>
                </View>
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>{t('wash_booking_vehicle')}</Text>
                  <Text style={[styles.invoiceValue, { color: theme.text, textAlign: isRTL ? 'left' : 'right' }]}>
                    {createdBooking.carType}
                  </Text>
                </View>
                {createdBooking.customerPhone ? (
                  <View style={styles.invoiceRow}>
                    <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>{t('book_phone_label')}</Text>
                    <Text style={[styles.invoiceValue, { color: theme.text, textAlign: isRTL ? 'left' : 'right' }]}>
                      {createdBooking.customerPhone}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.divider, { backgroundColor: theme.border }]} />
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>{t('walk_in_invoice_gross')}</Text>
                  <Text style={[styles.invoiceValue, { color: theme.text, textAlign: isRTL ? 'left' : 'right' }]}>
                    {formatEgp(invoiceMoney.servicePriceEgp, locale)}
                  </Text>
                </View>
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceLabel, { color: theme.textMuted }]}>{t('walk_in_invoice_fee')}</Text>
                  <Text style={[styles.invoiceValue, { color: theme.textMuted, textAlign: isRTL ? 'left' : 'right' }]}>
                    {formatEgp(invoiceMoney.platformFeeEgp, locale)}
                  </Text>
                </View>
                <View style={styles.invoiceRow}>
                  <Text style={[styles.invoiceTotalLabel, { color: theme.text }]}>{t('walk_in_invoice_net')}</Text>
                  <Text style={[styles.invoiceTotalValue, { color: theme.accent, textAlign: isRTL ? 'left' : 'right' }]}>
                    {formatEgp(invoiceMoney.ownerNetEgp, locale)}
                  </Text>
                </View>
                <Text style={[styles.invoiceStatus, { color: theme.accent }]}>{t('walk_in_invoice_status')}</Text>
              </View>
              <Pressable onPress={onCloseModal} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
                <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('walk_in_invoice_done')}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '92%',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 4,
    marginBottom: 12,
  },
  formScroll: {
    gap: 10,
    paddingBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
  },
  fieldHint: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: -4,
  },
  textRtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  serviceList: {
    gap: 8,
  },
  serviceChip: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
  },
  serviceChipTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  serviceChipMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  previewBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  invoiceWrap: {
    gap: 12,
  },
  invoiceCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  invoiceHeading: {
    fontSize: 17,
    fontWeight: '900',
  },
  invoiceMeta: {
    fontSize: 12,
    marginBottom: 4,
  },
  invoiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  invoiceLabel: {
    fontSize: 13,
    flex: 1,
  },
  invoiceValue: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  invoiceTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    flex: 1,
  },
  invoiceTotalValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  invoiceStatus: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
});
