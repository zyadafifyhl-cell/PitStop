import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import type { ShopAnalytics, ShopAnalyticsTimeframe } from '@/lib/posTypes';

type Props = {
  analytics: ShopAnalytics;
  loading?: boolean;
  timeframe: ShopAnalyticsTimeframe;
  onTimeframeChange: (timeframe: ShopAnalyticsTimeframe) => void;
  onRecordSale?: () => void;
  onLogExpense?: () => void;
  onLogPayroll?: () => void;
};

export function ShopFinanceOverview({
  analytics,
  loading,
  timeframe,
  onTimeframeChange,
  onRecordSale,
  onLogExpense,
  onLogPayroll,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const profitPositive = analytics.netProfit >= 0;

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
      </View>
      <View style={styles.timeRow}>
        {(['today', 'month'] as const).map((item) => {
          const active = timeframe === item;
          return (
            <Pressable
              key={item}
              onPress={() => onTimeframeChange(item)}
              style={[
                styles.timePill,
                {
                  backgroundColor: active ? theme.accent : theme.bgElevated,
                  borderColor: active ? theme.accent : theme.border,
                },
              ]}>
              <Text style={[styles.timePillText, { color: active ? theme.onAccent : theme.text }]}>
                {item === 'today' ? t('pos_finance_today') : t('pos_finance_month')}
              </Text>
            </Pressable>
          );
        })}
        {loading ? <ActivityIndicator size="small" color={theme.accent} /> : null}
      </View>

      <View style={styles.grid}>
        <FinanceCard
          icon="shopping-cart"
          tone="success"
          label={t('pos_card_sales')}
          value={formatEgp(analytics.totalSales, locale)}
          hint={t('pos_card_sales_hint')
            .replace('{walkIn}', formatEgp(analytics.walkInSales, locale))
            .replace('{app}', formatEgp(analytics.appBookingSales, locale))}
        />
        <FinanceCard
          icon="tint"
          tone="warning"
          label={t('pos_card_expenses')}
          value={formatEgp(analytics.operatingExpenses, locale)}
          hint={t('pos_card_expenses_hint')
            .replace('{materials}', formatEgp(analytics.rawMaterials, locale))
            .replace('{ops}', formatEgp(analytics.operations, locale))}
        />
        <FinanceCard
          icon="users"
          tone="accent"
          label={t('pos_card_payroll')}
          value={formatEgp(analytics.payroll, locale)}
          hint={t('pos_card_payroll_hint').replace('{commission}', formatEgp(analytics.employeeCommissions, locale))}
        />
        <FinanceCard
          icon="line-chart"
          tone={profitPositive ? 'success' : 'danger'}
          label={t('pos_card_profit')}
          value={formatEgp(analytics.netProfit, locale)}
          hint={t('pos_card_profit_hint').replace('{fees}', formatEgp(analytics.pitstopFees, locale))}
          badge={profitPositive ? t('pos_profit_positive') : t('pos_profit_negative')}
        />
        <FinanceCard
          icon="briefcase"
          tone="warning"
          label={t('pos_card_uncollected')}
          value={formatEgp(analytics.uncollected, locale)}
          hint={t('pos_card_uncollected_hint')
            .replace('{orders}', formatEgp(analytics.unpaidOrders, locale))
            .replace('{credits}', formatEgp(analytics.pendingCredits, locale))}
        />
      </View>

      <Text style={[styles.sectionTitle, { color: theme.text }, isRTL && styles.rtl]}>{t('pos_pnl_title')}</Text>
      <Text style={[styles.sectionLead, { color: theme.textMuted }, isRTL && styles.rtl]}>{t('pos_pnl_lead')}</Text>

      <PnlGroup title={t('pos_pnl_revenue')}>
        <PnlRow label={t('pos_pnl_wash')} value={formatEgp(analytics.washRevenue, locale)} theme={theme} />
        <PnlRow label={t('pos_pnl_accessories')} value={formatEgp(analytics.accessorySales, locale)} theme={theme} />
      </PnlGroup>
      <PnlGroup title={t('pos_pnl_costs')}>
        <PnlRow label={t('pos_pnl_materials')} value={formatEgp(analytics.rawMaterials, locale)} theme={theme} />
        <PnlRow label={t('pos_pnl_wages')} value={formatEgp(analytics.payroll, locale)} theme={theme} />
        <PnlRow label={t('pos_pnl_operations')} value={formatEgp(analytics.operations, locale)} theme={theme} />
        <PnlRow label={t('pos_pnl_fees')} value={formatEgp(analytics.pitstopFees, locale)} theme={theme} />
      </PnlGroup>
      <PnlGroup title={t('pos_pnl_ledger')}>
        <PnlRow label={t('pos_pnl_receivables')} value={formatEgp(analytics.uncollected, locale)} theme={theme} />
        <PnlRow label={t('pos_pnl_fees_due')} value={formatEgp(analytics.pitstopFeesDue, locale)} theme={theme} />
      </PnlGroup>
    </OwnerSectionCard>
  );
}

function FinanceCard({
  icon,
  tone,
  label,
  value,
  hint,
  badge,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  tone: 'accent' | 'success' | 'warning' | 'danger';
  label: string;
  value: string;
  hint: string;
  badge?: string;
}) {
  const theme = useAppTheme();
  const colors = {
    accent: theme.brand,
    success: theme.success,
    warning: theme.warning,
    danger: theme.danger,
  };
  const backgrounds = {
    accent: theme.brandSoft,
    success: theme.successSoft,
    warning: theme.warningSoft,
    danger: theme.dangerSoft,
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardTop}>
        <View style={[styles.icon, { backgroundColor: backgrounds[tone] }]}>
          <FontAwesome name={icon} size={16} color={colors[tone]} />
        </View>
        {badge ? (
          <View style={[styles.badge, { backgroundColor: backgrounds[tone] }]}>
            <Text style={[styles.badgeText, { color: colors[tone] }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.value, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text>
    </View>
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
  theme: { text: string; textMuted: string };
}) {
  return (
    <View style={styles.pnlRow}>
      <Text style={[styles.pnlLabel, { color: theme.textMuted }]}>{label}</Text>
      <Text style={[styles.pnlValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  actionBtn: {
    flexGrow: 1,
    minWidth: 150,
    minHeight: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { fontSize: 13, fontWeight: '800' },
  timeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12 },
  timePill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  timePillText: { fontSize: 12, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: { flexGrow: 1, flexBasis: '47%', minWidth: 150, borderWidth: 1, borderRadius: 16, padding: 14 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  icon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 10, fontWeight: '800' },
  value: { fontSize: 22, fontWeight: '900' },
  label: { marginTop: 4, fontSize: 13, fontWeight: '800' },
  hint: { marginTop: 6, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  sectionTitle: { marginTop: 18, fontSize: 15, fontWeight: '800' },
  sectionLead: { marginTop: 4, marginBottom: 10, fontSize: 12, lineHeight: 17 },
  rtl: { textAlign: 'right' },
  pnlGroup: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 8, gap: 8 },
  pnlGroupTitle: { fontSize: 12, fontWeight: '800' },
  pnlRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  pnlLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
  pnlValue: { fontSize: 13, fontWeight: '800' },
});
