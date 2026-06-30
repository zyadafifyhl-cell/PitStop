import { useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
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
import { bookingStatusLabel, formatBookingDateTime } from '@/lib/booking/format';
import {
  buildOwnerReportHtml,
  filterBookingsByRange,
  formatEgp,
  formatRangeLabel,
  normalizeBookingMoney,
  resolveCustomRange,
  resolveLastNDaysRange,
  toYmdLocal,
} from '@/lib/booking/reporting';
import type { Booking, Shop } from '@/lib/booking/types';
import { pushWashCenterNotification } from '@/lib/booking/wash/washNotificationCenter';
import type { ShopStaffUser } from '@/lib/shop/shopStaffUser';

type Props = {
  shop: Shop;
  staff: ShopStaffUser | null;
  variant?: 'wash' | 'shop';
  pushReportNotification?: boolean;
};

export function OwnerHistoryPanel({ shop, staff, variant = 'wash', pushReportNotification = false }: Props) {
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
  const [reportPreviewHtml, setReportPreviewHtml] = useState<string | null>(null);

  const branchId = staff?.role === 'branch_manager' ? staff.branchId : undefined;

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
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

  const reportRange = useMemo(
    () => resolveCustomRange(reportStartYmd, reportEndYmd),
    [reportStartYmd, reportEndYmd],
  );

  const reportBookings = useMemo(() => {
    const normalized = rows.map((row) => ({ ...row, ...normalizeBookingMoney(row) }));
    return reportRange ? filterBookingsByRange(normalized, reportRange) : [];
  }, [rows, reportRange]);

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

  function printReportPreview() {
    if (Platform.OS !== 'web') return;
    const iframe = document.getElementById('owner-history-report-iframe') as HTMLIFrameElement | null;
    iframe?.contentWindow?.print();
  }

  async function onGeneratePdf() {
    if (!reportRange) {
      Alert.alert(t(`${prefix}_invalid_range_title`), t(`${prefix}_invalid_range_body`));
      return;
    }
    const rangeLabel = formatRangeLabel(reportRange, locale);
    const html = buildOwnerReportHtml({
      shop,
      bookings: reportBookings,
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
          branchId: branchId ?? undefined,
          kind: 'weekly_revenue',
          title: t('wash_report_title'),
          body: t(`${prefix}_count`)
            .replace('{count}', String(reportBookings.length))
            .replace('{range}', rangeLabel),
          reportHtml: html,
        });
      }
      if (Platform.OS === 'web') {
        setReportPreviewHtml(html);
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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('owner_history_lead')}</Text>

      <View style={[styles.reportCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(`${prefix}_title`)}</Text>
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
        <Pressable
          onPress={onGeneratePdf}
          disabled={generatingPdf || !reportRange}
          style={[styles.primaryBtn, { backgroundColor: theme.accent, opacity: generatingPdf || !reportRange ? 0.65 : 1 }]}>
          <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>
            {generatingPdf
              ? t(`${prefix}_generating`)
              : Platform.OS === 'web'
                ? t(`${prefix}_view_report`)
                : t(`${prefix}_generate_pdf`)}
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 24 }} />
      ) : rows.length === 0 ? (
        <Text style={[styles.empty, { color: theme.textMuted }]}>
          {variant === 'shop' ? t('shop_booking_history_empty') : t('wash_booking_history_empty')}
        </Text>
      ) : (
        rows.map((booking) => (
          <View
            key={booking.id}
            style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
            <Text style={[styles.when, { color: theme.text }]}>
              {formatBookingDateTime(booking.scheduledAt, locale)}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {booking.customerName || booking.customerPhone} · {booking.carType}
            </Text>
            <Text style={[styles.status, { color: theme.accent }]}>
              {bookingStatusLabel(booking.status, locale)}
            </Text>
          </View>
        ))
      )}

      <Modal visible={!!reportPreviewHtml} transparent animationType="fade" onRequestClose={() => setReportPreviewHtml(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>{t(`${prefix}_title`)}</Text>
            {Platform.OS === 'web' && reportPreviewHtml ? (
              <iframe
                id="owner-history-report-iframe"
                title="owner-history-report"
                srcDoc={reportPreviewHtml}
                style={{ width: '100%', height: 420, border: 'none', borderRadius: 8 }}
              />
            ) : null}
            <View style={styles.modalActions}>
              {Platform.OS === 'web' ? (
                <Pressable onPress={printReportPreview} style={[styles.primaryBtn, { backgroundColor: theme.accent, flex: 1 }]}>
                  <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t(`${prefix}_save_pdf`)}</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setReportPreviewHtml(null)} style={[styles.secondaryBtn, { borderColor: theme.border, flex: 1 }]}>
                <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t(`${prefix}_close`)}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
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
  secondaryBtn: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  secondaryBtnText: { fontSize: 13, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 8 },
  when: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  meta: { fontSize: 14, lineHeight: 20 },
  status: { fontSize: 13, fontWeight: '800', marginTop: 6 },
  empty: { textAlign: 'center', fontSize: 14, lineHeight: 20, marginTop: 24 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: { width: '100%', maxWidth: 720, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  modalActions: { flexDirection: 'row', gap: 8 },
});
