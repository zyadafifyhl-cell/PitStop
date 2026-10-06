import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatEgp } from '@/lib/booking/reporting';
import { listPosJobOrders, updatePosOrderWorkflow } from '@/lib/posRepository';
import { POS_WORKFLOW_STAGES, type PosJobOrder, type PosWorkflowStage } from '@/lib/posTypes';
import type { TranslationKey } from '@/lib/i18n/strings';
import { userAlert } from '@/lib/ui/userAlert';

type Props = {
  shopId: string;
  refreshKey?: number;
};

const STAGE_LABEL: Record<PosWorkflowStage, TranslationKey> = {
  in_progress: 'detailing_stage_in_progress',
  curing_inspection: 'detailing_stage_curing',
  ready_for_delivery: 'detailing_stage_ready',
};

function nextStage(stage: PosWorkflowStage): PosWorkflowStage | null {
  const index = POS_WORKFLOW_STAGES.indexOf(stage);
  if (index < 0 || index >= POS_WORKFLOW_STAGES.length - 1) return null;
  return POS_WORKFLOW_STAGES[index + 1] ?? null;
}

export function DetailingJobBoard({ shopId, refreshKey = 0 }: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const [orders, setOrders] = useState<PosJobOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setOrders(await listPosJobOrders(shopId));
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const grouped = useMemo(
    () =>
      POS_WORKFLOW_STAGES.map((stage) => ({
        stage,
        rows: orders.filter((order) => order.workflowStage === stage),
      })),
    [orders],
  );

  async function onAdvance(order: PosJobOrder) {
    const next = nextStage(order.workflowStage);
    if (!next) return;
    setBusyId(order.id);
    try {
      await updatePosOrderWorkflow(order.id, next);
      await load();
    } catch {
      userAlert(t('walk_in_submit_fail_title'), t('pos_finance_delete_fail'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <OwnerSectionCard theme={theme} title={t('detailing_jobs_title')} subtitle={t('detailing_jobs_empty')}>
      {loading ? <ActivityIndicator color={theme.accent} /> : null}
      {grouped.map((group) => (
        <View key={group.stage} style={styles.stageBlock}>
          <Text style={[styles.stageTitle, { color: theme.text }, isRTL && styles.rtl]}>{t(STAGE_LABEL[group.stage])}</Text>
          {group.rows.length === 0 ? (
            <Text style={[styles.meta, { color: theme.textDim }, isRTL && styles.rtl]}>—</Text>
          ) : (
            group.rows.map((order) => {
              const next = nextStage(order.workflowStage);
              return (
                <View
                  key={order.id}
                  style={[styles.card, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                  <Text style={[styles.name, { color: theme.text }]}>
                    {order.customerName?.trim() || order.customerPhone || order.carType}
                  </Text>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{order.carType}</Text>
                  {order.carChassisNumber ? (
                    <Text style={[styles.meta, { color: theme.textMuted }]}>
                      {t('detailing_chassis')}: {order.carChassisNumber}
                    </Text>
                  ) : null}
                  {order.estimatedDeliveryDate ? (
                    <Text style={[styles.meta, { color: theme.textMuted }]}>
                      {t('detailing_delivery_date')}: {new Date(order.estimatedDeliveryDate).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                    </Text>
                  ) : null}
                  <View style={[styles.moneyRow, isRTL && styles.moneyRowRtl]}>
                    <Text style={[styles.metaStrong, { color: theme.text }]}>
                      {t('detailing_deposit_paid')}: {formatEgp(order.depositPaid, locale)}
                    </Text>
                    <Text style={[styles.metaStrong, { color: theme.accent }]}>
                      {t('detailing_remaining_balance')}: {formatEgp(order.remainingBalance, locale)}
                    </Text>
                  </View>
                  <Text style={[styles.meta, { color: theme.textMuted }]}>{formatEgp(order.price, locale)}</Text>
                  {next ? (
                    <Pressable
                      onPress={() => void onAdvance(order)}
                      disabled={busyId === order.id}
                      style={[styles.advanceBtn, { backgroundColor: theme.accent, opacity: busyId === order.id ? 0.6 : 1 }]}>
                      <FontAwesome name="arrow-right" size={12} color={theme.onAccent} />
                      <Text style={[styles.advanceText, { color: theme.onAccent }]}>{t('detailing_advance_stage')}</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })
          )}
        </View>
      ))}
    </OwnerSectionCard>
  );
}

const styles = StyleSheet.create({
  stageBlock: { marginBottom: 14, gap: 8 },
  stageTitle: { fontSize: 14, fontWeight: '800' },
  rtl: { textAlign: 'right', writingDirection: 'rtl' },
  meta: { fontSize: 12, fontWeight: '600' },
  metaStrong: { fontSize: 12, fontWeight: '800' },
  name: { fontSize: 15, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 4 },
  moneyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 6 },
  moneyRowRtl: { flexDirection: 'row-reverse' },
  advanceBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  advanceText: { fontSize: 12, fontWeight: '800' },
});
