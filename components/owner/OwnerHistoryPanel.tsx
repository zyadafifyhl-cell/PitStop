import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { BookingDatePicker } from '@/components/ui/BookingDatePicker';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listArchivedBookingsForStaff } from '@/lib/booking/bookingHistoryRepository';
import { promptMerchantNoShowOverride } from '@/lib/booking/merchantBookingOverride';
import { isAutoCompletedBooking, updateBookingStatus } from '@/lib/booking/storage';
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import {
  buildOwnerReportHtmlDeferred,
  filterBookingsByRange,
  filterRevenueBookings,
  formatEgp,
  formatRangeLabel,
  normalizeBookingMoney,
  resolveCustomRange,
  resolveLastNDaysRange,
  toYmdLocal,
} from '@/lib/booking/reporting';
import type { Booking, Shop } from '@/lib/booking/types';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import { openReportPrintFrameWeb } from '@/lib/pdf/reportPrintWeb';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';

type HistoryFilter = 'all' | 'done' | 'cancelled';

type Props = {
  shop: Shop;
  staff: ShopStaffUser | null;
  variant?: 'wash' | 'shop';
  pushReportNotification?: boolean;
  mode?: 'all' | 'reports' | 'history';
  branchOptions?: Array<{ id: string; label: string }>;
  selectedBranchId?: string;
  onSelectBranchId?: (branchId: string) => void;
};

export function OwnerHistoryPanel({
  shop,
  staff,
  variant = 'wash',
  pushReportNotification = false,
  mode = 'all',
  branchOptions,
  selectedBranchId = 'all',
  onSelectBranchId,
}: Props) {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const prefix = variant === 'shop' ? 'shop_report' : 'wash_report';
  const [rows, setRows] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportStartYmd, setReportStartYmd] = useState(() => {
    const start = new Date();
    start.setDate(start.getDate() - 29);
    return toYmdLocal(start);
  });
  const [reportEndYmd, setReportEndYmd] = useState(() => toYmdLocal(new Date()));
  const [lastDaysInput, setLastDaysInput] = useState('30');
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const deferredRows = useDeferredValue(rows);

  const branchId =
    staff?.role === 'branch_manager'
      ? staff.branchId
      : selectedBranchId && selectedBranchId !== 'all'
        ? selectedBranchId
        : undefined;
  const canGenerateAllBranches =
    staff?.role !== 'branch_manager' &&
    (branchOptions?.some((option) => option.id !== 'all') ?? false);
  const canGenerateSelectedBranch =
    staff?.role === 'branch_manager' || (selectedBranchId && selectedBranchId !== 'all');

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      // Finalized archive only — pending/confirmed stay on the operational dashboard.
      const archived = await listArchivedBookingsForStaff(shop.id, branchId);
      setRows(archived);
    } finally {
      setLoading(false);
    }
  }, [shop.id, branchId]);

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [loadHistory]),
  );
  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);
  useEffect(() => {
    setBranchMenuOpen(false);
  }, [selectedBranchId]);

  const reportRange = useMemo(
    () => resolveCustomRange(reportStartYmd, reportEndYmd),
    [reportStartYmd, reportEndYmd],
  );

  const reportBookings = useMemo(() => {
    const normalized = deferredRows.map((row) => ({ ...row, ...normalizeBookingMoney(row) }));
    const inRange = reportRange ? filterBookingsByRange(normalized, reportRange) : [];
    return filterRevenueBookings(inRange);
  }, [deferredRows, reportRange]);

  const financialTotals = useMemo(() => {
    return reportBookings.reduce(
      (acc, row) => {
        acc.gross += row.servicePriceEgp ?? 0;
        acc.fee += row.platformFeeEgp ?? 0;
        acc.net += (row.servicePriceEgp ?? 0) - (row.platformFeeEgp ?? 0);
        return acc;
      },
      { gross: 0, fee: 0, net: 0 },
    );
  }, [reportBookings]);

  const historyRows = useMemo(() => {
    if (mode !== 'history') return deferredRows;
    if (historyFilter === 'done') {
      return deferredRows.filter((row) => row.status === 'done' && !isAutoCompletedBooking(row));
    }
    if (historyFilter === 'cancelled') {
      return deferredRows.filter((row) => row.status === 'cancelled' || row.status === 'no_show');
    }
    return deferredRows;
  }, [deferredRows, mode, historyFilter]);

  const historyFilterOptions = useMemo(
    () =>
      [
        { id: 'all' as const, label: t('owner_history_filter_all') },
        { id: 'done' as const, label: t('owner_history_filter_completed') },
        { id: 'cancelled' as const, label: t('owner_history_filter_cancelled') },
      ] as const,
    [t],
  );

  function applyLastDaysRange() {
    const days = Number(lastDaysInput);
    const range = resolveLastNDaysRange(days);
    if (!range) {
      Alert.alert(t(`${prefix}_invalid_range_title`), t(`${prefix}_days_invalid_body`));
      return;
    }
    setReportStartYmd(toYmdLocal(range.start));
    setReportEndYmd(toYmdLocal(range.end));
  }

  function onMerchantNoShowOverride(booking: Booking) {
    promptMerchantNoShowOverride({
      title: t('merchant_noshow_override_title'),
      message: t('merchant_noshow_override_body'),
      confirmLabel: t('merchant_noshow_override_btn'),
      cancelLabel: t('alert_cancel'),
      onConfirm: async () => {
        await updateBookingStatus(booking.id, 'no_show', booking);
        setRows((prev) =>
          prev.map((row) =>
            row.id === booking.id
              ? { ...row, status: 'no_show', lifecycleAutoCompleted: undefined }
              : row,
          ),
        );
      },
    });
  }

  async function onGeneratePdf(scope: 'selected' | 'all' = 'selected') {
    if (!reportRange) {
      Alert.alert(t(`${prefix}_invalid_range_title`), t(`${prefix}_invalid_range_body`));
      return;
    }
    const scopedBranchId =
      staff?.role === 'branch_manager'
        ? staff.branchId
        : scope === 'all'
          ? undefined
          : selectedBranchId && selectedBranchId !== 'all'
            ? selectedBranchId
            : undefined;
    if (scope === 'selected' && !scopedBranchId) {
      Alert.alert(t('wash_branch_select_title'), t('wash_report_generate_branch'));
      return;
    }
    const sourceRows =
      scopedBranchId === branchId
        ? rows
        : await listArchivedBookingsForStaff(shop.id, scopedBranchId);
    const scopedReportBookings = filterRevenueBookings(
      filterBookingsByRange(
        sourceRows.map((row) => ({ ...row, ...normalizeBookingMoney(row) })),
        reportRange,
      ),
    );
    const scopedFinancialTotals = scopedReportBookings.reduce(
      (acc, row) => {
        acc.gross += row.servicePriceEgp ?? 0;
        acc.fee += row.platformFeeEgp ?? 0;
        acc.net += (row.servicePriceEgp ?? 0) - (row.platformFeeEgp ?? 0);
        return acc;
      },
      { gross: 0, fee: 0, net: 0 },
    );
    const rangeLabel = formatRangeLabel(reportRange, locale);
    const html = await buildOwnerReportHtmlDeferred({
      shop,
      bookings: scopedReportBookings,
      range: reportRange,
      rangeLabel,
      generatedAt: new Date(),
      locale,
    });
    setGeneratingPdf(true);
    try {
      if (pushReportNotification) {
        await pushWashCenterNotification({
          shopId: shop.id,
          branchId: scopedBranchId ?? undefined,
          kind: 'weekly_revenue',
          title: t('wash_report_title'),
          body: t(`${prefix}_count`)
            .replace('{count}', String(scopedReportBookings.length))
            .replace('{range}', rangeLabel),
          reportHtml: html,
        });
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        openReportPrintFrameWeb({
          shopName: locale === 'ar' ? shop.nameAr : shop.name,
          reportTitle: t(`${prefix}_title`),
          rangeLabel,
          generatedAtText: new Date().toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
          grossRevenue: scopedFinancialTotals.gross,
          platformFee: scopedFinancialTotals.fee,
          netEarnings: scopedFinancialTotals.net,
          rows: scopedReportBookings.map((booking, index) => {
            const sourceLabel = booking.bookingType === 'walk_in' ? 'Walk-In' : 'App';
            const money = normalizeBookingMoney(booking);
            return {
              bookingId: booking.id || `#${index + 1}`,
              dateText: formatBookingDateTime(booking.scheduledAt, locale),
              typeText: sourceLabel,
              revenueEgp: money.servicePriceEgp,
            };
          }),
        });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/pdf',
          dialogTitle: t(`${prefix}_share_pdf`),
        });
      } else {
        Alert.alert(t(`${prefix}_pdf_ready_title`), file.uri);
      }
    } catch {
      Alert.alert(t(`${prefix}_pdf_fail_title`), t(`${prefix}_pdf_fail_body`));
    } finally {
      setGeneratingPdf(false);
    }
  }

  const fieldStyle = [
    styles.field,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];
  const selectedBranchLabel =
    branchOptions?.find((option) => option.id === selectedBranchId)?.label ??
    branchOptions?.find((option) => option.id === 'all')?.label ??
    t('wash_report_all_branches_option');

  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: theme.textMuted }]}>
        {mode === 'history' ? t('owner_history_scope_note') : t('owner_history_lead')}
      </Text>

      {mode === 'history' ? (
        <View style={styles.historyFilterRow}>
          {historyFilterOptions.map((option) => {
            const active = historyFilter === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => setHistoryFilter(option.id)}
                style={[
                  styles.historyFilterChip,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={[styles.historyFilterText, { color: active ? theme.onAccent : theme.text }]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {mode !== 'history' ? (
        <View style={[styles.reportCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(`${prefix}_title`)}</Text>
          {branchOptions?.length ? (
            <View>
              <Text style={[styles.inlineTitle, { color: theme.text }]}>{t('wash_branch_select_title')}</Text>
              <Pressable
                onPress={() => setBranchMenuOpen((open) => !open)}
                style={[styles.branchSelectBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <Text style={[styles.branchSelectValue, { color: theme.text }]}>{selectedBranchLabel}</Text>
                <Text style={{ color: theme.textMuted }}>{branchMenuOpen ? '▲' : '▼'}</Text>
              </Pressable>
              {branchMenuOpen ? (
                <View style={[styles.branchMenuCard, { borderColor: theme.border, backgroundColor: theme.bg }]}>
                  {branchOptions.map((option) => {
                    const selected = option.id === selectedBranchId;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          onSelectBranchId?.(option.id);
                          setBranchMenuOpen(false);
                        }}
                        style={[
                          styles.branchMenuItem,
                          selected ? { backgroundColor: theme.accentSoft, borderColor: theme.accent } : { borderColor: 'transparent' },
                        ]}>
                        <Text style={[styles.branchMenuText, { color: selected ? theme.accent : theme.text }]}>{option.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={styles.dateRow}>
            <BookingDatePicker
              valueYmd={reportStartYmd}
              onChangeYmd={setReportStartYmd}
              locale={locale}
              label={t(`${prefix}_start_date`)}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
            <BookingDatePicker
              valueYmd={reportEndYmd}
              onChangeYmd={setReportEndYmd}
              locale={locale}
              label={t(`${prefix}_end_date`)}
              pickHint={t('book_date_pick_hint')}
              minimumDate={new Date('2020-01-01T00:00:00')}
              borderColor={theme.border}
              backgroundColor={theme.bgElevated}
              textColor={theme.text}
            />
          </View>
          <Text style={[styles.inlineTitle, { color: theme.text }]}>{t(`${prefix}_last_n_days`)}</Text>
          <View style={styles.lastDaysRow}>
            <TextInput
              value={lastDaysInput}
              onChangeText={setLastDaysInput}
              keyboardType="number-pad"
              placeholder={t(`${prefix}_days_placeholder`)}
              placeholderTextColor={theme.textDim}
              style={[fieldStyle, styles.lastDaysInput]}
            />
            <Pressable onPress={applyLastDaysRange} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
              <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t(`${prefix}_apply_days`)}</Text>
            </Pressable>
          </View>
          <Text style={[styles.summary, { color: theme.textMuted }]}>
            {reportRange
              ? t(`${prefix}_count`)
                  .replace('{count}', String(reportBookings.length))
                  .replace('{range}', formatRangeLabel(reportRange, locale))
              : t(`${prefix}_invalid_range_body`)}
          </Text>
          {reportRange ? (
            <Text style={[styles.moneyLine, { color: theme.text }]}>
              {t(`${prefix}_money_line`)
                .replace('{gross}', formatEgp(financialTotals.gross, locale))
                .replace('{fee}', formatEgp(financialTotals.fee, locale))
                .replace('{net}', formatEgp(financialTotals.net, locale))}
            </Text>
          ) : null}
          {canGenerateAllBranches ? (
            <View style={styles.generateRow}>
              <Pressable
                onPress={() => {
                  void onGeneratePdf('selected');
                }}
                disabled={generatingPdf || !reportRange || !canGenerateSelectedBranch}
                style={[
                  styles.secondaryBtn,
                  styles.generateBtnHalf,
                  {
                    borderColor: theme.border,
                    backgroundColor: theme.bgElevated,
                    opacity: generatingPdf || !reportRange || !canGenerateSelectedBranch ? 0.65 : 1,
                  },
                ]}>
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('wash_report_generate_branch')}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void onGeneratePdf('all');
                }}
                disabled={generatingPdf || !reportRange}
                style={[
                  styles.primaryBtn,
                  styles.generateBtnHalf,
                  {
                    backgroundColor: theme.accent,
                    opacity: generatingPdf || !reportRange ? 0.65 : 1,
                  },
                ]}>
                <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
                  {generatingPdf
                    ? t(`${prefix}_generating`)
                    : t('wash_report_generate_all_branches')}
                </Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              onPress={() => {
                void onGeneratePdf('selected');
              }}
              disabled={generatingPdf || !reportRange}
              style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: generatingPdf || !reportRange ? 0.65 : 1 }]}>
              <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
                {generatingPdf
                  ? t(`${prefix}_generating`)
                  : Platform.OS === 'web'
                    ? t(`${prefix}_download_pdf`)
                    : t(`${prefix}_generate_pdf`)}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {mode === 'reports' ? null : loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : historyRows.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>
          {rows.length === 0
            ? variant === 'shop'
              ? t('shop_booking_history_empty')
              : t('wash_booking_history_empty')
            : t('owner_history_filter_empty')}
        </Text>
      ) : (
        historyRows.map((booking) => (
          <View
            key={booking.id}
            style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.when, { color: theme.text }]}>
              {formatBookingDateTime(booking.scheduledAt, locale)}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {booking.customerName || booking.customerPhone} · {booking.carType}
            </Text>
            <Text
              style={[
                styles.status,
                {
                  color:
                    booking.status === 'done'
                      ? theme.green
                      : booking.status === 'cancelled' || booking.status === 'no_show'
                        ? theme.danger
                        : theme.accent,
                },
              ]}>
              {bookingStatusLabel(booking.status, locale)}
            </Text>
            {isAutoCompletedBooking(booking) ? (
              <>
                <Text style={[styles.autoHint, { color: theme.textMuted }]}>
                  {t('merchant_noshow_override_auto_hint')}
                </Text>
                <Pressable
                  onPress={() => onMerchantNoShowOverride(booking)}
                  style={[styles.overrideBtn, { borderColor: theme.danger, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.overrideBtnText, { color: theme.danger }]}>
                    {t('merchant_noshow_override_btn')}
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ))
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  historyFilterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  historyFilterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  historyFilterText: { fontSize: 13, fontWeight: '800' },
  reportCard: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  dateRow: { gap: 8 },
  inlineTitle: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  lastDaysRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  lastDaysInput: { flex: 1 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  summary: { fontSize: 13, lineHeight: 19 },
  moneyLine: { fontSize: 14, fontWeight: '700' },
  primaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { fontSize: 15, fontWeight: '800' },
  generateRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  generateBtnHalf: { flex: 1, marginTop: 0 },
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
  branchSelectBtn: {
    marginTop: 4,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  branchSelectValue: { fontSize: 14, fontWeight: '700', flex: 1 },
  branchMenuCard: { marginTop: 8, borderWidth: 1, borderRadius: 12, padding: 6, gap: 4 },
  branchMenuItem: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9 },
  branchMenuText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  when: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  meta: { fontSize: 14, lineHeight: 20 },
  status: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  autoHint: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  overrideBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  overrideBtnText: { fontSize: 13, fontWeight: '800' },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24 },
});
