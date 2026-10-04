import FontAwesome from '@expo/vector-icons/FontAwesome';
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

import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatBookingDateTime } from '@/lib/booking/format';
import { formatEgp, normalizeBookingMoney } from '@/lib/booking/reporting';
import { createWalkInBooking, resolveCustomerIdByPhoneRemote } from '@/lib/booking/storage';
import { createWalkInPosOrder, listShopCustomers } from '@/lib/posRepository';
import { POS_CAR_TYPES, type PosCarType, type ShopPosCustomer } from '@/lib/posTypes';
import { listStoreProductsByShop } from '@/lib/store/productRepository';
import type { StoreProduct } from '@/lib/store/types';
import type { DbBranchEmployee } from '@/lib/supabase/database.types';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { userAlert } from '@/lib/ui/userAlert';
import type { Booking, Shop, ShopService } from '@/lib/booking/types';
import type { TranslationKey } from '@/lib/i18n/strings';

type Props = {
  visible: boolean;
  onClose: () => void;
  shop: Shop;
  branchId: string;
  branchLabel: string;
  services: ShopService[];
  employees?: DbBranchEmployee[];
  onCreated: (booking: Booking) => void;
};

type Step = 'form' | 'invoice';

function buildWalkInMultiServicePayload(services: ShopService[], locale: 'en' | 'ar') {
  const names = services.map((service) => (locale === 'ar' ? service.nameAr || service.name : service.name));
  const namesAr = services.map((service) => service.nameAr || service.name);

  return {
    serviceId: services[0]?.id,
    serviceName: names.join(', '),
    serviceNameAr: namesAr.join(locale === 'ar' ? '، ' : ', '),
    servicePriceEgp: services.reduce((sum, service) => sum + service.priceEgp, 0),
    serviceDurationMinutes: services.reduce((sum, service) => sum + service.durationMinutes, 0),
  };
}

export function WalkInBookingModal({
  visible,
  onClose,
  shop,
  branchId,
  branchLabel,
  services,
  employees = [],
  onCreated,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [step, setStep] = useState<Step>('form');
  const [carType, setCarType] = useState<PosCarType>('sedan');
  const [fullName, setFullName] = useState('');
  const [plate, setPlate] = useState('');
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [accessoryQty, setAccessoryQty] = useState<Record<string, number>>({});
  const [retailProducts, setRetailProducts] = useState<StoreProduct[]>([]);
  const [customerSuggestions, setCustomerSuggestions] = useState<ShopPosCustomer[]>([]);
  const [appliedCustomerId, setAppliedCustomerId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resolvingCustomer, setResolvingCustomer] = useState(false);
  const [resolvedCustomerId, setResolvedCustomerId] = useState<string | undefined>();
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  const activeServices = useMemo(
    () => services.filter((service) => service.active && service.visible !== false).sort((a, b) => a.sortOrder - b.sortOrder),
    [services],
  );

  const selectedServices = useMemo(
    () => activeServices.filter((service) => selectedServiceIds.includes(service.id)),
    [activeServices, selectedServiceIds],
  );

  const serviceTotals = useMemo(
    () => ({
      totalPriceEgp: selectedServices.reduce((sum, service) => sum + service.priceEgp, 0),
      totalDurationMinutes: selectedServices.reduce((sum, service) => sum + service.durationMinutes, 0),
    }),
    [selectedServices],
  );

  function isUuid(value: string | undefined): boolean {
    return Boolean(
      value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    );
  }

  const accessoryItems = useMemo(
    () =>
      retailProducts.flatMap((product) => {
        const quantity = accessoryQty[product.id] ?? 0;
        if (quantity <= 0) return [];
        return [
          {
            productId: product.id,
            quantity,
            unitPrice: product.salePrice ?? product.price,
          },
        ];
      }),
    [accessoryQty, retailProducts],
  );

  const accessoryTotal = useMemo(
    () => accessoryItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    [accessoryItems],
  );

  useEffect(() => {
    if (!visible) return;
    setStep('form');
    setCarType('sedan');
    setFullName('');
    setPlate('');
    setPhone('');
    setNotes('');
    setSelectedServiceIds([]);
    setSelectedEmployeeId(null);
    setAccessoryQty({});
    setCustomerSuggestions([]);
    setAppliedCustomerId(null);
    setCreatedBooking(null);
    setBusy(false);
    setResolvingCustomer(false);
    setResolvedCustomerId(undefined);
    void listStoreProductsByShop(shop.id).then((rows) => {
      setRetailProducts(rows.filter((product) => product.isActive && product.inventoryKind !== 'supply'));
    });
  }, [visible, shop.id]);

  useEffect(() => {
    if (!visible) return;
    const phoneQuery = phone.trim();
    const plateQuery = plate.trim();
    const nameQuery = fullName.trim();
    const searchQuery = phoneQuery.length >= 3 ? phoneQuery : plateQuery.length >= 3 ? plateQuery : nameQuery.length >= 3 ? nameQuery : '';

    if (!searchQuery) {
      setResolvingCustomer(false);
      setResolvedCustomerId(undefined);
      setCustomerSuggestions([]);
      return;
    }

    let cancelled = false;
    setResolvingCustomer(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const [customerId, matches] = await Promise.all([
            phoneQuery ? resolveCustomerIdByPhoneRemote(phoneQuery) : Promise.resolve(undefined),
            listShopCustomers(shop.id, searchQuery),
          ]);
          if (cancelled) return;
          setResolvedCustomerId(customerId);
          setCustomerSuggestions(matches.slice(0, 4));
        } catch {
          if (cancelled) return;
          setResolvedCustomerId(undefined);
          setCustomerSuggestions([]);
        } finally {
          if (!cancelled) setResolvingCustomer(false);
        }
      })();
    }, 260);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [phone, plate, fullName, visible, shop.id]);

  function applySavedCustomer(customer: ShopPosCustomer) {
    setPhone(customer.phone);
    setFullName(customer.fullName);
    setPlate(customer.licensePlate || '');
    setCarType(customer.carType);
    setAppliedCustomerId(customer.id);
  }

  function onPhoneChange(value: string) {
    setPhone(value);
    if (appliedCustomerId) setAppliedCustomerId(null);
  }

  function toggleServiceSelection(serviceId: string) {
    setSelectedServiceIds((current) =>
      current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId],
    );
  }

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
    if (selectedServices.length === 0) {
      Alert.alert(t('walk_in_missing_title'), t('walk_in_missing_service'));
      return;
    }

    const aggregated = buildWalkInMultiServicePayload(selectedServices, locale);

    setBusy(true);
    try {
      const booking = await createWalkInBooking({
        shopId: shop.id,
        branchId,
        carType,
        customerPhone: phone.trim() || undefined,
        customerId: resolvedCustomerId,
        skipPhoneLookup: true,
        serviceId: aggregated.serviceId,
        serviceName: aggregated.serviceName,
        serviceNameAr: aggregated.serviceNameAr,
        servicePriceEgp: aggregated.servicePriceEgp,
        serviceDurationMinutes: aggregated.serviceDurationMinutes,
        customerNotes: notes.trim() || undefined,
        initialStatus: 'done',
      });

      let posSaved = false;
      if (aggregated.serviceId && isUuid(aggregated.serviceId)) {
        try {
          await createWalkInPosOrder({
            shopId: shop.id,
            serviceId: aggregated.serviceId,
            price: serviceTotals.totalPriceEgp,
            carType,
            phone: phone.trim() || undefined,
            fullName: fullName.trim() || undefined,
            licensePlate: plate.trim() || undefined,
            employeeId: selectedEmployeeId && isUuid(selectedEmployeeId) ? selectedEmployeeId : undefined,
            notes: notes.trim() || undefined,
            items: accessoryItems,
            bookingId: isUuid(booking.id) ? booking.id : undefined,
          });
          posSaved = true;
        } catch (posError) {
          console.warn('createWalkInPosOrder', posError);
        }
      }

      onClose();
      onCreated(booking);
      userAlert(
        t('walk_in_submit_success_title'),
        posSaved ? t('walk_in_submit_success_body') : t('walk_in_pos_partial_fail'),
      );
    } catch (error) {
      Alert.alert(
        t('walk_in_submit_fail_title'),
        logAndGetSafeErrorMessage(error, t, 'walkin.createBooking'),
      );
    } finally {
      setBusy(false);
    }
  }

  function onCloseModal() {
    onClose();
  }

  const invoiceMoney = createdBooking ? normalizeBookingMoney(createdBooking) : null;
  const serviceLabel =
    createdBooking != null
      ? locale === 'ar'
        ? createdBooking.serviceNameAr || createdBooking.serviceName || '—'
        : createdBooking.serviceName || '—'
      : '—';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCloseModal}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text }, isRTL && styles.textRtl]}>{t('walk_in_modal_title')}</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }, isRTL && styles.textRtl]}>
            {branchLabel} · {shop.name}
          </Text>

          {step === 'form' ? (
            <ScrollView contentContainerStyle={styles.formScroll} keyboardShouldPersistTaps="handled">
              <TextInput
                value={phone}
                onChangeText={onPhoneChange}
                placeholder={t('walk_in_phone_placeholder')}
                placeholderTextColor={theme.textDim}
                keyboardType="phone-pad"
                style={fieldStyle}
              />
              <TextInput
                value={fullName}
                onChangeText={setFullName}
                placeholder={t('walk_in_name_placeholder')}
                placeholderTextColor={theme.textDim}
                style={fieldStyle}
              />
              <TextInput
                value={plate}
                onChangeText={setPlate}
                placeholder={t('walk_in_plate_placeholder')}
                placeholderTextColor={theme.textDim}
                autoCapitalize="characters"
                style={fieldStyle}
              />
              <Text style={[styles.sectionLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {t('walk_in_car_type_label')}
              </Text>
              <View style={styles.chipWrap}>
                {POS_CAR_TYPES.map((type) => {
                  const selected = carType === type;
                  return (
                    <Pressable
                      key={type}
                      onPress={() => setCarType(type)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.accent : theme.border,
                          backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                        },
                      ]}>
                      <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>
                        {t(`pos_car_${type}` as TranslationKey)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={[styles.fieldHint, { color: theme.textDim }, isRTL && styles.textRtl]}>
                {t('walk_in_phone_hint')}
              </Text>
              {resolvingCustomer ? (
                <View style={styles.lookupRow}>
                  <ActivityIndicator size="small" color={theme.textDim} />
                  <Text style={[styles.lookupText, { color: theme.textDim }, isRTL && styles.textRtl]}>
                    {t('walk_in_phone_lookup_pending')}
                  </Text>
                </View>
              ) : null}
              {appliedCustomerId ? (
                <Text style={[styles.lookupText, { color: theme.accent }, isRTL && styles.textRtl]}>
                  {t('walk_in_suggest_applied')}
                </Text>
              ) : null}
              {customerSuggestions.length > 0 ? (
                <View style={styles.suggestList}>
                  {customerSuggestions.map((customer) => {
                    const applied = appliedCustomerId === customer.id;
                    return (
                      <Pressable
                        key={customer.id}
                        onPress={() => applySavedCustomer(customer)}
                        style={[
                          styles.suggestCard,
                          {
                            borderColor: applied ? theme.accent : theme.border,
                            backgroundColor: applied ? theme.accentSoft : theme.bgElevated,
                          },
                        ]}>
                        <View style={styles.suggestBody}>
                          <Text style={[styles.suggestName, { color: theme.text }, isRTL && styles.textRtl]}>
                            {customer.fullName || customer.phone}
                          </Text>
                          <Text style={[styles.suggestMeta, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                            {t('walk_in_found_customer').replace('{visits}', String(customer.totalVisits))}
                            {customer.phone ? ` · ${customer.phone}` : ''}
                            {customer.licensePlate
                              ? ` · ${t('walk_in_suggest_plate').replace('{plate}', customer.licensePlate)}`
                              : ''}
                          </Text>
                        </View>
                        <Text style={[styles.suggestAction, { color: theme.accent }]}>
                          {applied ? t('walk_in_suggest_used') : t('walk_in_suggest_use')}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.serviceHeaderRow}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                  {t('walk_in_service_label')}
                </Text>
                {selectedServices.length > 0 ? (
                  <Text style={[styles.selectionCount, { color: theme.textDim }, isRTL && styles.textRtl]}>
                    {t('walk_in_services_selected').replace('{count}', String(selectedServices.length))}
                  </Text>
                ) : null}
              </View>
              {activeServices.length === 0 ? (
                <Text style={[styles.emptyHint, { color: theme.textDim }]}>{t('walk_in_no_services')}</Text>
              ) : (
                <View style={styles.serviceList}>
                  {activeServices.map((service) => {
                    const label = locale === 'ar' ? service.nameAr || service.name : service.name;
                    const selected = selectedServiceIds.includes(service.id);
                    return (
                      <Pressable
                        key={service.id}
                        onPress={() => toggleServiceSelection(service.id)}
                        style={[
                          styles.serviceOption,
                          {
                            borderColor: selected ? theme.accent : theme.border,
                            backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                          },
                        ]}>
                        <FontAwesome
                          name={selected ? 'check-square' : 'square-o'}
                          size={18}
                          color={selected ? theme.accent : theme.textDim}
                        />
                        <View style={styles.serviceOptionBody}>
                          <Text style={[styles.serviceChipTitle, { color: theme.text }]}>{label}</Text>
                          <Text style={[styles.serviceChipMeta, { color: theme.textMuted }]}>
                            {formatEgp(service.priceEgp, locale)} · {service.durationMinutes}{' '}
                            {locale === 'ar' ? 'د' : 'min'}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {employees.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                    {t('walk_in_employee_label')}
                  </Text>
                  <View style={styles.chipWrap}>
                    <Pressable
                      onPress={() => setSelectedEmployeeId(null)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selectedEmployeeId == null ? theme.accent : theme.border,
                          backgroundColor: selectedEmployeeId == null ? theme.accentSoft : theme.bgElevated,
                        },
                      ]}>
                      <Text style={{ color: selectedEmployeeId == null ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>
                        {t('walk_in_employee_none')}
                      </Text>
                    </Pressable>
                    {employees.map((employee) => {
                      const selected = selectedEmployeeId === employee.id;
                      return (
                        <Pressable
                          key={employee.id}
                          onPress={() => setSelectedEmployeeId(employee.id)}
                          style={[
                            styles.chip,
                            {
                              borderColor: selected ? theme.accent : theme.border,
                              backgroundColor: selected ? theme.accentSoft : theme.bgElevated,
                            },
                          ]}>
                          <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>
                            {employee.full_name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {retailProducts.length > 0 ? (
                <>
                  <Text style={[styles.sectionLabel, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                    {t('walk_in_accessories_label')}
                  </Text>
                  <View style={styles.serviceList}>
                    {retailProducts.map((product) => {
                      const qty = accessoryQty[product.id] ?? 0;
                      return (
                        <View
                          key={product.id}
                          style={[styles.accessoryRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.serviceChipTitle, { color: theme.text }]}>{product.name}</Text>
                            <Text style={[styles.serviceChipMeta, { color: theme.textMuted }]}>
                              {formatEgp(product.salePrice ?? product.price, locale)} · {product.stockQuantity}{' '}
                              {t('store_owner_stock')}
                            </Text>
                          </View>
                          <View style={styles.qtyWrap}>
                            <Pressable
                              onPress={() =>
                                setAccessoryQty((current) => ({
                                  ...current,
                                  [product.id]: Math.max(0, (current[product.id] ?? 0) - 1),
                                }))
                              }
                              style={[styles.qtyBtn, { borderColor: theme.border }]}>
                              <Text style={{ color: theme.text, fontWeight: '800' }}>-</Text>
                            </Pressable>
                            <Text style={[styles.qtyValue, { color: theme.text }]}>{qty}</Text>
                            <Pressable
                              onPress={() =>
                                setAccessoryQty((current) => ({
                                  ...current,
                                  [product.id]: Math.min(product.stockQuantity, (current[product.id] ?? 0) + 1),
                                }))
                              }
                              style={[styles.qtyBtn, { borderColor: theme.border }]}>
                              <Text style={{ color: theme.text, fontWeight: '800' }}>+</Text>
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : null}

              <TextInput
                value={notes}
                onChangeText={setNotes}
                placeholder={t('walk_in_notes_placeholder')}
                placeholderTextColor={theme.textDim}
                multiline
                style={[...fieldStyle, styles.noteInput]}
              />

              {selectedServices.length > 0 ? (
                <View style={[styles.previewBox, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: theme.textMuted }]}>{t('walk_in_price_preview')}</Text>
                    <Text style={[styles.previewValue, { color: theme.accent }]}>
                      {formatEgp(serviceTotals.totalPriceEgp + accessoryTotal, locale)}
                    </Text>
                  </View>
                  <View style={[styles.previewDivider, { backgroundColor: theme.border }]} />
                  <View style={styles.previewRow}>
                    <Text style={[styles.previewLabel, { color: theme.textMuted }]}>{t('walk_in_duration_preview')}</Text>
                    <Text style={[styles.previewDuration, { color: theme.text }]}>
                      {serviceTotals.totalDurationMinutes} {locale === 'ar' ? 'دقيقة' : 'min'}
                    </Text>
                  </View>
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
  backdrop: BOXED_OVERLAY.backdrop,
  card: {
    ...BOXED_OVERLAY.card,
    maxWidth: 480,
    maxHeight: '88%',
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
  lookupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -2,
  },
  lookupText: {
    fontSize: 12,
    lineHeight: 16,
  },
  suggestList: {
    gap: 8,
  },
  suggestCard: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  suggestBody: {
    gap: 2,
  },
  suggestName: {
    fontSize: 14,
    fontWeight: '800',
  },
  suggestMeta: {
    fontSize: 12,
    lineHeight: 16,
  },
  suggestAction: {
    fontSize: 12,
    fontWeight: '800',
  },
  textRtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
  noteInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  serviceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  selectionCount: {
    fontSize: 11,
    fontWeight: '600',
  },
  serviceList: {
    gap: 8,
  },
  serviceOption: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  serviceOptionBody: {
    flex: 1,
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
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
  },
  previewLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  previewDuration: {
    fontSize: 15,
    fontWeight: '800',
  },
  emptyHint: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  accessoryRow: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderWidth: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    minWidth: 18,
    textAlign: 'center',
    fontWeight: '800',
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
