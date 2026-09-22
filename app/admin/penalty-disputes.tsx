import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  listPendingPenaltyDisputes,
  resolvePenaltyDispute,
  type PendingPenaltyDispute,
} from '@/lib/admin/adminRepository';
import { formatEgp } from '@/lib/booking/reporting';
import { userAlert, userConfirm } from '@/lib/ui/userAlert';

export default function AdminPenaltyDisputesScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { isAdmin } = useShopAuth();
  const [rows, setRows] = useState<PendingPenaltyDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listPendingPenaltyDisputes());
    } catch (error) {
      userAlert(t('admin_action_fail_title'), error instanceof Error ? error.message : t('order_dispute_failed_body'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (!isAdmin) {
      router.replace('/admin');
      return;
    }
    void refresh();
  }, [isAdmin, refresh]);

  async function onResolve(row: PendingPenaltyDispute, action: 'waive' | 'reject') {
    const confirmed = await userConfirm(
      action === 'waive' ? t('admin_dispute_waive') : t('admin_dispute_reject'),
      action === 'waive' ? t('admin_dispute_waive_confirm') : t('admin_dispute_reject_confirm'),
    );
    if (!confirmed) return;
    setBusyId(row.bookingId);
    try {
      await resolvePenaltyDispute(row.bookingId, action);
      setRows((current) => current.filter((item) => item.bookingId !== row.bookingId));
    } catch (error) {
      userAlert(t('admin_action_fail_title'), error instanceof Error ? error.message : t('order_dispute_failed_body'));
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) return null;

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
      </Pressable>

      <OwnerSectionCard
        theme={theme}
        title={t('admin_disputes_title')}
        subtitle={t('admin_disputes_lead')}>
        {loading ? <ActivityIndicator color={theme.accent} /> : null}
        {!loading && rows.length === 0 ? (
          <Text style={{ color: theme.textMuted }}>{t('admin_disputes_empty')}</Text>
        ) : null}

        {rows.map((row) => (
          <View key={row.bookingId} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.topRow}>
              <View style={styles.flex}>
                <Text style={[styles.customer, { color: theme.text }]}>{row.customerName}</Text>
                <Text style={[styles.meta, { color: theme.textMuted }]}>{row.customerPhone}</Text>
              </View>
              <Text style={[styles.amount, { color: theme.danger }]}>{formatEgp(row.penaltyFee, locale)}</Text>
            </View>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {row.shopName} · {row.branchName}
            </Text>
            <Text style={[styles.service, { color: theme.text }]}>{row.serviceName}</Text>
            <Text style={[styles.meta, { color: theme.textMuted }]}>
              {new Date(row.scheduledAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
            </Text>
            <View style={[styles.reasonBox, { backgroundColor: theme.bg, borderColor: theme.border }]}>
              <Text style={[styles.reasonLabel, { color: theme.textMuted }]}>{t('admin_dispute_reason')}</Text>
              <Text style={[styles.reason, { color: theme.text }]}>{row.disputeReason}</Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                disabled={busyId === row.bookingId}
                onPress={() => void onResolve(row, 'waive')}
                style={[styles.actionBtn, { backgroundColor: theme.accent, opacity: busyId === row.bookingId ? 0.6 : 1 }]}>
                <Text style={styles.actionText}>{t('admin_dispute_waive')}</Text>
              </Pressable>
              <Pressable
                disabled={busyId === row.bookingId}
                onPress={() => void onResolve(row, 'reject')}
                style={[styles.actionBtn, { backgroundColor: theme.danger, opacity: busyId === row.bookingId ? 0.6 : 1 }]}>
                <Text style={styles.actionText}>{t('admin_dispute_reject')}</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </OwnerSectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 12 },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  backText: { fontSize: 14, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 7, marginTop: 10 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1 },
  customer: { fontSize: 17, fontWeight: '700' },
  meta: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  service: { fontSize: 15, fontWeight: '800' },
  amount: { fontSize: 17, fontWeight: '700' },
  reasonBox: { borderWidth: 1, borderRadius: 9, padding: 12, gap: 5, marginTop: 5 },
  reasonLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  reason: { fontSize: 14, lineHeight: 21, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 7 },
  actionBtn: { flex: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 12, alignItems: 'center' },
  actionText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', letterSpacing: 0.5, textAlign: 'center' },
});
