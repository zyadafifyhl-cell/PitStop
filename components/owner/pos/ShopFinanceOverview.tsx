import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { BOXED_OVERLAY, type AppThemeTokens } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { useDataChanges } from '@/lib/data/dataChanges';
import type { TranslationKey } from '@/lib/i18n/strings';
import {
  deleteShopExpense,
  fetchFinanceCardDetails,
  monthTimeframeDate,
  rangeForAnalyticsTimeframe,
  recentMonthTimeframes,
} from '@/lib/posRepository';
import type { FinanceCardId, FinanceDetailLine, ShopAnalytics, ShopAnalyticsTimeframe } from '@/lib/posTypes';
import { showCustomConfirm } from '@/lib/ui/CustomConfirmProvider';
import { OverlayPortal } from '@/lib/ui/overlayPortal';
import { userAlert } from '@/lib/ui/userAlert';

function financePeriodLabel(
  timeframe: ShopAnalyticsTimeframe,
  locale: 'en' | 'ar',
  todayLabel: string,
  thisMonthLabel: string,
) {
  if (timeframe === 'today') return todayLabel;
  const date = monthTimeframeDate(timeframe);
  if (!date) return thisMonthLabel;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

type Props = {
  shopId?: string;
  analytics: ShopAnalytics;
  loading?: boolean;
  timeframe: ShopAnalyticsTimeframe;
  onTimeframeChange: (timeframe: ShopAnalyticsTimeframe) => void;
  onRecordSale?: () => void;
  onLogExpense?: () => void;
  onLogPayroll?: () => void;
  onEndShift?: () => void;
  onChanged?: () => void;
};

export function ShopFinanceOverview({
  shopId,
  analytics,
  loading,
  timeframe,
  onTimeframeChange,
  onRecordSale,
  onLogExpense,
  onLogPayroll,
  onEndShift,
  onChanged,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const profitPositive = analytics.netProfit >= 0;
  const [openCard, setOpenCard] = useState<FinanceCardId | null>(null);
  const monthChoices = useMemo(() => recentMonthTimeframes(12), []);

  return (
    <OwnerSectionCard
      theme={theme}
      title={t('pos_finance_title')}
      subtitle={
        analytics.isDemo
          ? t('pos_finance_demo_hint')
          : analytics.usedFallbackRange
            ? t('pos_finance_fallback_hint')
            : t('pos_finance_lead')
      }
      icon="calculator">
      <View style={[styles.timeRow, isRTL && styles.rowRtl]}>
        <Pressable
          onPress={() => onTimeframeChange('today')}
          style={[
            styles.timePill,
            {
              backgroundColor: timeframe === 'today' ? theme.accent : theme.bgElevated,
              borderColor: timeframe === 'today' ? theme.accent : theme.border,
            },
          ]}>
          <Text style={[styles.timePillText, { color: timeframe === 'today' ? theme.onAccent : theme.text }]}>
            {t('pos_finance_today')}
          </Text>
        </Pressable>
        {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.monthRow, isRTL && styles.rowRtl]}>
        {monthChoices.map((month) => {
          const active = timeframe === month;
          return (
            <Pressable
              key={month}
              onPress={() => onTimeframeChange(month)}
              style={[
                styles.timePill,
                {
                  backgroundColor: active ? theme.accent : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Text style={[styles.timePillText, { color: active ? theme.onAccent : theme.text }]}>
                {financePeriodLabel(month, locale, t('pos_finance_today'), t('pos_finance_month'))}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => setOpenCard('profit')}
        style={[
          styles.result,
          {
            backgroundColor: profitPositive ? theme.successSoft : theme.dangerSoft,
            borderColor: profitPositive ? theme.success : theme.danger,
          },
        ]}>
        <Text style={[styles.resultLabel, { color: profitPositive ? theme.success : theme.danger }, isRTL && styles.rtl]}>
          {profitPositive ? t('pos_profit_positive') : t('pos_profit_negative')}
        </Text>
        <Text style={[styles.resultValue, { color: theme.text }, isRTL && styles.rtl]}>
          {formatEgp(analytics.netProfit, locale)}
        </Text>
        <Text style={[styles.resultHint, { color: theme.textMuted }, isRTL && styles.rtl]}>
          {t('pos_card_profit_hint').replace('{fees}', formatEgp(analytics.pitstopFees, locale))}
        </Text>
      </Pressable>

      <View style={styles.books}>
        <PnlGroup title={t('pos_pnl_revenue')}>
          <BookLine label={t('pos_card_sales')} value={formatEgp(analytics.totalSales, locale)} onPress={() => setOpenCard('sales')} strong />
          <PnlRow label={t('pos_finance_source_walk_in')} value={formatEgp(analytics.walkInSales, locale)} theme={theme} />
          <PnlRow label={t('pos_finance_source_app')} value={formatEgp(analytics.appBookingSales, locale)} theme={theme} />
        </PnlGroup>
        <PnlGroup title={t('pos_pnl_costs')}>
          <BookLine label={t('pos_card_expenses')} value={formatEgp(analytics.operatingExpenses, locale)} onPress={() => setOpenCard('expenses')} />
          <PnlRow label={t('pos_pnl_materials')} value={formatEgp(analytics.rawMaterials, locale)} theme={theme} />
          <PnlRow label={t('pos_pnl_operations')} value={formatEgp(analytics.operations, locale)} theme={theme} />
          <BookLine label={t('pos_card_payroll')} value={formatEgp(analytics.payroll, locale)} onPress={() => setOpenCard('payroll')} />
          <PnlRow label={t('pos_pnl_fees')} value={formatEgp(analytics.pitstopFees, locale)} theme={theme} />
        </PnlGroup>
        <PnlGroup title={t('pos_pnl_ledger')}>
          <BookLine label={t('pos_card_uncollected')} value={formatEgp(analytics.uncollected, locale)} onPress={() => setOpenCard('uncollected')} />
          <PnlRow label={t('pos_finance_unpaid_order')} value={formatEgp(analytics.unpaidOrders, locale)} theme={theme} />
          <PnlRow label={t('pos_finance_credit')} value={formatEgp(analytics.pendingCredits, locale)} theme={theme} />
        </PnlGroup>
      </View>

      <View style={styles.actionRow}>
        {onRecordSale ? (
          <Pressable onPress={onRecordSale} style={[styles.actionBtn, { backgroundColor: theme.accent }]}>
            <FontAwesome name="plus" size={13} color={theme.onAccent} />
            <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('pos_finance_record_sale')}</Text>
          </Pressable>
        ) : null}
        {onLogExpense ? (
          <Pressable
            onPress={onLogExpense}
            style={[styles.actionBtn, { backgroundColor: theme.bgElevated, borderColor: theme.accent, borderWidth: 1 }]}>
            <FontAwesome name="minus" size={13} color={theme.accent} />
            <Text style={[styles.actionText, { color: theme.accent }]}>{t('pos_finance_record_expense')}</Text>
          </Pressable>
        ) : null}
        {onLogPayroll ? (
          <Pressable
            onPress={onLogPayroll}
            style={[styles.actionBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border, borderWidth: 1 }]}>
            <FontAwesome name="users" size={13} color={theme.text} />
            <Text style={[styles.actionText, { color: theme.text }]}>{t('pos_finance_record_payroll')}</Text>
          </Pressable>
        ) : null}
        {onEndShift ? (
          <Pressable
            onPress={onEndShift}
            style={[styles.actionBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border, borderWidth: 1 }]}>
            <FontAwesome name="flag-checkered" size={13} color={theme.text} />
            <Text style={[styles.actionText, { color: theme.text }]}>{t('pos_shift_end_button')}</Text>
          </Pressable>
        ) : null}
      </View>

      <FinanceCardDetailModal
        visible={openCard != null}
        card={openCard}
        shopId={shopId}
        analytics={analytics}
        timeframe={timeframe}
        onClose={() => setOpenCard(null)}
        onChanged={onChanged}
      />
    </OwnerSectionCard>
  );
}

function FinanceCardDetailModal({
  visible,
  card,
  shopId,
  analytics,
  timeframe,
  onClose,
  onChanged,
}: {
  visible: boolean;
  card: FinanceCardId | null;
  shopId?: string;
  analytics: ShopAnalytics;
  timeframe: ShopAnalyticsTimeframe;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [lines, setLines] = useState<FinanceDetailLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const range = useMemo(() => rangeForAnalyticsTimeframe(timeframe), [timeframe]);
  const canDeleteLines = card === 'expenses';

  async function reloadLines() {
    if (!card || !shopId || analytics.isDemo) {
      setLines([]);
      return;
    }
    setLoading(true);
    try {
      setLines(await fetchFinanceCardDetails(shopId, card, range.from.toISOString(), range.to.toISOString()));
    } finally {
      setLoading(false);
    }
  }

  useDataChanges(['finance'], () => {
    if (visible) void reloadLines();
  });

  function onDeleteExpense(line: FinanceDetailLine) {
    const expenseId = line.id.startsWith('exp:') ? line.id.slice(4) : line.id;
    showCustomConfirm({
      title: t('pos_finance_delete_title'),
      message: t('pos_finance_delete_body')
        .replace('{name}', lineTitle(line, t))
        .replace('{amount}', formatEgp(line.amount, locale)),
      confirmLabel: t('pos_finance_delete'),
      cancelLabel: t('alert_cancel'),
      destructive: true,
      onConfirm: async () => {
        setDeletingId(line.id);
        try {
          await deleteShopExpense(expenseId);
          setLines((current) => current.filter((row) => row.id !== line.id));
          onChanged?.();
        } catch {
          userAlert(t('pos_finance_delete_title'), t('pos_finance_delete_fail'));
        } finally {
          setDeletingId(null);
        }
      },
    });
  }

  useEffect(() => {
    if (!visible || !card) {
      setLines([]);
      setLoading(false);
      return;
    }
    void reloadLines();
  }, [visible, card, shopId, analytics.isDemo, range.from, range.to]);

  if (!card) return null;

  const title = t(cardTitleKey(card));
  const summary = cardSummaryRows(card, analytics, t, locale);

  return (
    <OverlayPortal visible={visible} onRequestClose={onClose}>
      <Pressable style={[BOXED_OVERLAY.backdrop, { backgroundColor: theme.overlay }]} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={[
            BOXED_OVERLAY.card,
            styles.detailCard,
            { backgroundColor: theme.card, borderColor: theme.border, maxWidth: 520 },
          ]}>
          <View style={[styles.detailHeader, isRTL && styles.detailHeaderRtl]}>
            <Text style={[styles.detailTitle, { color: theme.text }, isRTL && styles.rtl]}>{title}</Text>
            <Text style={[styles.detailPeriod, { color: theme.textMuted }]}>
              {financePeriodLabel(timeframe, locale, t('pos_finance_today'), t('pos_finance_month'))}
            </Text>
          </View>

          <ScrollView contentContainerStyle={styles.detailScroll} keyboardShouldPersistTaps="handled">
            <Text style={[styles.detailSection, { color: theme.textMuted }, isRTL && styles.rtl]}>
              {t('pos_finance_detail_summary')}
            </Text>
            {summary.map((row) => (
              <View key={row.label} style={styles.detailRow}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }, isRTL && styles.rtl]}>{row.label}</Text>
                <Text style={[styles.detailValue, { color: theme.text }]}>{row.value}</Text>
              </View>
            ))}

            {card !== 'profit' ? (
              <>
                <Text style={[styles.detailSection, { color: theme.textMuted, marginTop: 16 }, isRTL && styles.rtl]}>
                  {t('pos_finance_detail_lines')}
                </Text>
                {loading ? <ActivityIndicator color={theme.accent} style={{ marginVertical: 16 }} /> : null}
                {!loading && lines.length === 0 ? (
                  <Text style={[styles.detailEmpty, { color: theme.textDim }, isRTL && styles.rtl]}>
                    {t('pos_finance_detail_empty')}
                  </Text>
                ) : null}
                {lines.map((line) => (
                  <View key={line.id} style={[styles.lineCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <View style={styles.lineBody}>
                      <Text style={[styles.lineTitle, { color: theme.text }, isRTL && styles.rtl]}>
                        {lineTitle(line, t)}
                      </Text>
                      {line.subtitle ? (
                        <Text style={[styles.lineSub, { color: theme.textMuted }, isRTL && styles.rtl]}>{line.subtitle}</Text>
                      ) : null}
                      {line.at ? (
                        <Text style={[styles.lineSub, { color: theme.textDim }]}>
                          {new Date(line.at).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-GB')}
                        </Text>
                      ) : null}
                    </View>
                    <View style={styles.lineSide}>
                      <Text style={[styles.lineAmount, { color: theme.text }]}>{formatEgp(line.amount, locale)}</Text>
                      {canDeleteLines ? (
                        <Pressable
                          onPress={() => onDeleteExpense(line)}
                          disabled={deletingId === line.id}
                          style={[
                            styles.deleteBtn,
                            { borderColor: theme.danger, opacity: deletingId === line.id ? 0.6 : 1 },
                          ]}>
                          {deletingId === line.id ? (
                            <ActivityIndicator size="small" color={theme.danger} />
                          ) : (
                            <Text style={[styles.deleteBtnText, { color: theme.danger }]}>{t('pos_finance_delete')}</Text>
                          )}
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </ScrollView>

          <Pressable onPress={onClose} style={[styles.detailClose, { backgroundColor: theme.accent }]}>
            <Text style={[styles.detailCloseText, { color: theme.onAccent }]}>{t('pos_finance_detail_close')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </OverlayPortal>
  );
}

function cardTitleKey(card: FinanceCardId): TranslationKey {
  if (card === 'sales') return 'pos_card_sales';
  if (card === 'expenses') return 'pos_card_expenses';
  if (card === 'payroll') return 'pos_card_payroll';
  if (card === 'profit') return 'pos_card_profit';
  return 'pos_card_uncollected';
}

function cardSummaryRows(
  card: FinanceCardId,
  analytics: ShopAnalytics,
  t: (key: TranslationKey) => string,
  locale: 'en' | 'ar',
): { label: string; value: string }[] {
  if (card === 'sales') {
    return [
      { label: t('pos_finance_source_walk_in'), value: formatEgp(analytics.walkInSales, locale) },
      { label: t('pos_finance_source_app'), value: formatEgp(analytics.appBookingSales, locale) },
      { label: t('pos_pnl_wash'), value: formatEgp(analytics.washRevenue, locale) },
      { label: t('pos_pnl_accessories'), value: formatEgp(analytics.accessorySales, locale) },
    ];
  }
  if (card === 'expenses') {
    return [
      { label: t('pos_pnl_materials'), value: formatEgp(analytics.rawMaterials, locale) },
      { label: t('pos_pnl_operations'), value: formatEgp(analytics.operations, locale) },
    ];
  }
  if (card === 'payroll') {
    return [
      { label: t('pos_pnl_wages'), value: formatEgp(analytics.payroll, locale) },
      { label: t('pos_payroll_type_commission'), value: formatEgp(analytics.employeeCommissions, locale) },
    ];
  }
  if (card === 'profit') {
    return [
      { label: t('pos_card_sales'), value: formatEgp(analytics.totalSales, locale) },
      { label: t('pos_card_expenses'), value: formatEgp(analytics.operatingExpenses, locale) },
      { label: t('pos_card_payroll'), value: formatEgp(analytics.payroll, locale) },
      { label: t('pos_pnl_fees'), value: formatEgp(analytics.pitstopFees, locale) },
      { label: t('pos_card_profit'), value: formatEgp(analytics.netProfit, locale) },
    ];
  }
  return [
    { label: t('pos_finance_unpaid_order'), value: formatEgp(analytics.unpaidOrders, locale) },
    { label: t('pos_finance_credit'), value: formatEgp(analytics.pendingCredits, locale) },
  ];
}

function lineTitle(line: FinanceDetailLine, t: (key: TranslationKey) => string): string {
  if (line.title === 'walk_in') return t('pos_finance_source_walk_in');
  if (line.title === 'app') return t('pos_finance_source_app');
  if (line.title === 'booking') return t('pos_finance_source_booking');
  if (line.title === 'unpaid') return t('pos_finance_unpaid_order');
  if (line.title === 'credit') return t('pos_finance_credit');
  if (line.title === 'daily_wage') return t('pos_payroll_type_daily_wage');
  if (line.title === 'commission') return t('pos_payroll_type_commission');
  if (line.title === 'advance_deduction' || line.title === 'labor_advance' || line.title === 'staff_advance') {
    return t('pos_payroll_type_advance_deduction');
  }
  if (line.title === 'monthly_salary' || line.title === 'staff_wage') return t('pos_payroll_type_monthly_salary');
  if (line.title === 'raw_materials') return t('pos_expense_cat_raw_materials');
  if (line.title === 'utilities') return t('pos_expense_cat_utilities');
  if (line.title === 'tea_food') return t('pos_expense_cat_tea_food');
  if (line.title === 'maintenance') return t('pos_expense_cat_maintenance');
  if (line.title === 'other') return t('pos_expense_cat_other');
  return line.title;
}

function BookLine({
  label,
  value,
  onPress,
  strong,
}: {
  label: string;
  value: string;
  onPress: () => void;
  strong?: boolean;
}) {
  const theme = useAppTheme();
  const { isRTL } = useI18n();
  return (
    <Pressable onPress={onPress} style={[styles.bookLine, isRTL && styles.rowRtl]}>
      <Text style={[styles.bookLabel, { color: theme.text }, strong && styles.bookLabelStrong]}>{label}</Text>
      <Text style={[styles.bookValue, { color: theme.text }]}>{value}</Text>
      <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={11} color={theme.textMuted} />
    </Pressable>
  );
}

function PnlGroup({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useAppTheme();
  return (
    <View style={[styles.pnlGroup, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.pnlGroupTitle, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

function PnlRow({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: AppThemeTokens;
}) {
  return (
    <View style={styles.pnlRow}>
      <Text style={[styles.pnlLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.pnlValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  resultLabel: { fontSize: 13, fontWeight: '800' },
  resultValue: { marginTop: 4, fontSize: 32, fontWeight: '900', letterSpacing: -0.6 },
  resultHint: { marginTop: 6, fontSize: 13, lineHeight: 18, fontWeight: '600' },
  books: { gap: 10 },
  bookLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  bookLabel: { flex: 1, fontSize: 14, fontWeight: '700' },
  bookLabelStrong: { fontWeight: '800' },
  bookValue: { fontSize: 15, fontWeight: '800' },
  rowRtl: { flexDirection: 'row-reverse' },
  actionRow: { gap: 8, marginTop: 14 },
  actionBtn: {
    width: '100%',
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { flexShrink: 1, fontSize: 13, fontWeight: '800' },
  timePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  timePillText: { fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: '47%', minWidth: 150, borderWidth: 1, borderRadius: 16, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  value: { fontSize: 22, fontWeight: '900' },
  label: { marginTop: 4, fontSize: 13, fontWeight: '800' },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 },
  monthRow: { gap: 8, paddingBottom: 12 },
  openHint: { marginTop: 8, fontSize: 11, fontWeight: '800' },
  sectionTitle: { marginTop: 18, fontSize: 15, fontWeight: '800' },
  sectionLead: { marginTop: 4, marginBottom: 10, fontSize: 12, lineHeight: 17 },
  rtl: { textAlign: 'right' },
  pnlGroup: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 8 },
  pnlGroupTitle: { fontSize: 12, fontWeight: '800' },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  pnlLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  pnlValue: { fontSize: 13, fontWeight: '800' },
  detailCard: { maxHeight: '86%', paddingBottom: 16 },
  detailHeader: { marginBottom: 12 },
  detailHeaderRtl: { alignItems: 'flex-end' },
  detailTitle: { fontSize: 18, fontWeight: '800' },
  detailPeriod: { marginTop: 4, fontSize: 12, fontWeight: '700' },
  detailScroll: { paddingBottom: 8 },
  detailSection: { fontSize: 12, fontWeight: '800', marginBottom: 8 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  detailLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  detailValue: { fontSize: 13, fontWeight: '800' },
  detailEmpty: { fontSize: 13, fontWeight: '600', marginVertical: 8 },
  lineCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  lineBody: { flex: 1 },
  lineTitle: { fontSize: 14, fontWeight: '800' },
  lineSub: { marginTop: 3, fontSize: 12, fontWeight: '600' },
  lineSide: { alignItems: 'flex-end', gap: 8, minWidth: 88 },
  lineAmount: { fontSize: 14, fontWeight: '800' },
  deleteBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minWidth: 64,
    alignItems: 'center',
  },
  deleteBtnText: { fontSize: 12, fontWeight: '800' },
  detailClose: { marginTop: 12, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  detailCloseText: { fontSize: 15, fontWeight: '800' },
});
