import { router, useFocusEffect } from 'expo-router';
import * as Print from 'expo-print';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { OwnerMetricsGrid, type OwnerMetric } from '@/components/owner/OwnerMetricsGrid';
import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { isStoreShopType } from '@/lib/booking/storeCatalog';
import { getStoreSalesReport } from '@/lib/store/salesReportRepository';
import type { StoreSalesReport } from '@/lib/store/types';

type RangePreset = 'today' | '7d' | 'month' | 'custom';

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function toDateInput(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateInput(value: string, end = false): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const EMPTY_REPORT: StoreSalesReport = {
  grossRevenue: 0,
  completedOrdersCount: 0,
  cancelledOrdersCount: 0,
  averageOrderValue: 0,
  topSellingProducts: [],
};

export default function StoreReportsScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { ready, shop } = useShopAuth();
  const [preset, setPreset] = useState<RangePreset>('7d');
  const [customFrom, setCustomFrom] = useState(toDateInput(startOfDay(new Date())));
  const [customTo, setCustomTo] = useState(toDateInput(new Date()));
  const [report, setReport] = useState<StoreSalesReport>(EMPTY_REPORT);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => {
    const now = new Date();
    if (preset === 'today') return { start: startOfDay(now), end: now };
    if (preset === '7d') return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
    if (preset === 'month') return { start: startOfDay(new Date(now.getFullYear(), now.getMonth(), 1)), end: now };
    const start = parseDateInput(customFrom) ?? startOfDay(now);
    const end = parseDateInput(customTo, true) ?? now;
    return { start, end: end < start ? start : end };
  }, [customFrom, customTo, preset]);

  const loadReport = useCallback(async () => {
    if (!shop) return;
    setLoading(true);
    setReport(await getStoreSalesReport({ shopId: shop.id, startDate: range.start, endDate: range.end }));
    setLoading(false);
  }, [range.end, range.start, shop]);

  useFocusEffect(
    useCallback(() => {
      if (!ready) return;
      if (!shop || !isStoreShopType(shop.type)) {
        router.replace('/(tabs)/shop');
        return;
      }
      void loadReport();
    }, [loadReport, ready, shop]),
  );

  const metrics = useMemo<OwnerMetric[]>(
    () => [
      {
        id: 'revenue',
        label: t('store_reports_gross_revenue'),
        value: formatEgp(report.grossRevenue, locale),
        icon: 'money',
        tone: 'success',
      },
      {
        id: 'completed',
        label: t('store_reports_completed'),
        value: report.completedOrdersCount,
        icon: 'check-circle',
      },
      {
        id: 'cancelled',
        label: t('store_reports_cancelled'),
        value: report.cancelledOrdersCount,
        icon: 'times-circle',
        tone: 'danger',
      },
      {
        id: 'aov',
        label: t('store_reports_aov'),
        value: formatEgp(report.averageOrderValue, locale),
        icon: 'line-chart',
        tone: 'accent',
      },
    ],
    [locale, report, t],
  );

  const rangeLabel = `${range.start.toLocaleDateString()} – ${range.end.toLocaleDateString()}`;

  function buildCsv(): string {
    const lines = [
      'Metric,Value',
      `Gross revenue,${report.grossRevenue}`,
      `Completed orders,${report.completedOrdersCount}`,
      `Cancelled orders,${report.cancelledOrdersCount}`,
      `Average order value,${report.averageOrderValue}`,
      '',
      'Product,Units sold,Total sales',
      ...report.topSellingProducts.map((row) =>
        `"${row.productName.replaceAll('"', '""')}",${row.unitsSold},${row.totalSales}`,
      ),
    ];
    return lines.join('\n');
  }

  async function exportCsv() {
    const csv = buildCsv();
    const filename = `store-report-${shop?.id ?? 'shop'}.csv`;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      return;
    }
    Alert.alert(t('store_reports_export_csv'), csv.slice(0, 800));
  }

  async function printSummary() {
    const rows = report.topSellingProducts
      .map(
        (row) =>
          `<tr><td>${row.productName}</td><td>${row.unitsSold}</td><td>${formatEgp(row.totalSales, locale)}</td></tr>`,
      )
      .join('');
    const html = `
      <html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;">
        <h1>${t('store_reports_title')}</h1>
        <p>${shop ? (locale === 'ar' ? shop.nameAr || shop.name : shop.name) : ''} · ${rangeLabel}</p>
        <p><strong>${t('store_reports_gross_revenue')}:</strong> ${formatEgp(report.grossRevenue, locale)}</p>
        <p><strong>${t('store_reports_completed')}:</strong> ${report.completedOrdersCount}</p>
        <p><strong>${t('store_reports_cancelled')}:</strong> ${report.cancelledOrdersCount}</p>
        <p><strong>${t('store_reports_aov')}:</strong> ${formatEgp(report.averageOrderValue, locale)}</p>
        <h2>${t('store_reports_top_skus')}</h2>
        <table border="1" cellpadding="6" cellspacing="0" width="100%">
          <tr><th>${t('store_owner_product_name')}</th><th>${t('store_reports_units_sold')}</th><th>${t('store_owner_total')}</th></tr>
          ${rows || `<tr><td colspan="3">${t('store_reports_empty')}</td></tr>`}
        </table>
      </body></html>
    `;
    await Print.printAsync({ html });
  }

  const presets: Array<{ id: RangePreset; label: string }> = [
    { id: 'today', label: t('store_reports_today') },
    { id: '7d', label: t('store_reports_last_7_days') },
    { id: 'month', label: t('store_reports_this_month') },
    { id: 'custom', label: t('store_reports_custom') },
  ];

  if (!ready || !shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: theme.bg }} contentContainerStyle={styles.page}>
      <OwnerSectionCard title={t('store_reports_title')} subtitle={t('store_reports_lead')}>
        <View style={styles.presetRow}>
          {presets.map((item) => {
            const active = preset === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setPreset(item.id)}
                style={[
                  styles.preset,
                  {
                    backgroundColor: active ? theme.accent : theme.bgElevated,
                    borderColor: active ? theme.accent : theme.border,
                  },
                ]}>
                <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {preset === 'custom' ? (
          <View style={styles.customRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_reports_from')}</Text>
              <TextInput
                value={customFrom}
                onChangeText={setCustomFrom}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textDim}
                style={[styles.dateInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_reports_to')}</Text>
              <TextInput
                value={customTo}
                onChangeText={setCustomTo}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textDim}
                style={[styles.dateInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.card }]}
              />
            </View>
          </View>
        ) : null}
        <Text style={[styles.rangeLabel, { color: theme.textMuted }]}>{rangeLabel}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void loadReport()} style={[styles.actionBtn, { borderColor: theme.border }]}>
            <FontAwesome name="refresh" size={13} color={theme.accent} />
            <Text style={[styles.actionText, { color: theme.accent }]}>{t('store_reports_refresh')}</Text>
          </Pressable>
          <Pressable onPress={() => void exportCsv()} style={[styles.actionBtn, { borderColor: theme.border }]}>
            <FontAwesome name="download" size={13} color={theme.text} />
            <Text style={[styles.actionText, { color: theme.text }]}>{t('store_reports_export_csv')}</Text>
          </Pressable>
          <Pressable onPress={() => void printSummary()} style={[styles.actionBtn, { borderColor: theme.border }]}>
            <FontAwesome name="print" size={13} color={theme.text} />
            <Text style={[styles.actionText, { color: theme.text }]}>{t('store_reports_print')}</Text>
          </Pressable>
        </View>
      </OwnerSectionCard>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={theme.accent} size="large" /></View>
      ) : (
        <>
          <OwnerMetricsGrid metrics={metrics} />
          <OwnerSectionCard title={t('store_reports_top_skus')} subtitle={t('store_reports_top_skus_lead')}>
            {report.topSellingProducts.length === 0 ? (
              <Text style={{ color: theme.textMuted }}>{t('store_reports_empty')}</Text>
            ) : (
              report.topSellingProducts.map((row) => (
                <View key={`${row.productId ?? row.productName}`} style={[styles.skuRow, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.skuName, { color: theme.text }]}>{row.productName}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>
                      {row.unitsSold} {t('store_reports_units_sold')}
                    </Text>
                  </View>
                  <Text style={[styles.skuSales, { color: theme.accent }]}>{formatEgp(row.totalSales, locale)}</Text>
                </View>
              ))
            )}
          </OwnerSectionCard>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingBottom: 40, gap: 14 },
  center: { minHeight: 180, alignItems: 'center', justifyContent: 'center' },
  presetRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  preset: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  customRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '800', marginBottom: 6 },
  dateInput: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontWeight: '700' },
  rangeLabel: { fontSize: 12, fontWeight: '700', marginBottom: 10 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    minHeight: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionText: { fontSize: 12, fontWeight: '800' },
  skuRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  skuName: { fontSize: 14, fontWeight: '800' },
  skuSales: { fontSize: 14, fontWeight: '900' },
});
