import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { OwnerSectionCard } from '@/components/owner/OwnerSectionCard';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  approveShopOwner,
  fetchPlatformStats,
  listActiveMerchants,
  listPendingOwnerRequests,
  rejectShopOwner,
  type ActiveMerchant,
  type PendingOwnerRequest,
  type PlatformStats,
} from '@/lib/admin/adminRepository';
import { formatEgp } from '@/lib/booking/reporting';
import { shopTypeLabel } from '@/lib/booking/format';
import { userAlert } from '@/lib/ui/userAlert';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';

type AdminTab = 'dashboard' | 'pending' | 'merchants';

export function AdminPanel() {
  const { t, locale } = useI18n();
  const theme = useAppTheme();
  const { staff } = useShopAuth();
  const { signOut } = useAppSignOut();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pending, setPending] = useState<PendingOwnerRequest[]>([]);
  const [merchants, setMerchants] = useState<ActiveMerchant[]>([]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStats, nextPending, nextMerchants] = await Promise.all([
        fetchPlatformStats(),
        listPendingOwnerRequests(),
        listActiveMerchants(),
      ]);
      setStats(nextStats);
      setPending(nextPending);
      setMerchants(nextMerchants);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function onApprove(row: PendingOwnerRequest) {
    setBusyId(row.userId);
    try {
      await approveShopOwner(row.userId, row.shopId);
      await reload();
      userAlert(t('admin_approve_success_title'), t('admin_approve_success_body'));
    } catch (error) {
      userAlert(
        t('admin_action_fail_title'),
        error instanceof Error ? error.message : t('admin_action_fail_body'),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: PendingOwnerRequest) {
    setBusyId(row.userId);
    try {
      await rejectShopOwner(row.userId, row.shopId);
      await reload();
      userAlert(t('admin_reject_success_title'), t('admin_reject_success_body'));
    } catch (error) {
      userAlert(
        t('admin_action_fail_title'),
        error instanceof Error ? error.message : t('admin_action_fail_body'),
      );
    } finally {
      setBusyId(null);
    }
  }

  const tabBtn = (key: AdminTab, label: string) => (
    <Pressable
      key={key}
      onPress={() => setTab(key)}
      style={[
        styles.tabBtn,
        { borderColor: theme.border, backgroundColor: theme.bgElevated },
        tab === key && { backgroundColor: theme.accent, borderColor: theme.accent },
      ]}>
      <Text style={[styles.tabBtnText, { color: tab === key ? theme.onAccent : theme.text }]}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <View style={styles.headerTop}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>{t('admin_panel_title')}</Text>
          <Pressable onPress={() => signOut().then(() => router.replace('/welcome'))} hitSlop={8}>
            <Text style={[styles.logout, { color: theme.accent }]}>{t('admin_logout')}</Text>
          </Pressable>
        </View>
        <Text style={[styles.headerSub, { color: theme.textMuted }]}>
          {t('admin_signed_in_as')} {staff?.email ?? '—'}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
          {tabBtn('dashboard', t('admin_tab_dashboard'))}
          {tabBtn('pending', t('admin_tab_pending'))}
          {tabBtn('merchants', t('admin_tab_merchants'))}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {tab === 'dashboard' && stats ? (
            <>
              <OwnerSectionCard theme={theme} title={t('admin_dashboard_title')} subtitle={t('admin_dashboard_lead')}>
                <View style={styles.statsGrid}>
                  <StatCard theme={theme} label={t('admin_stat_total_bookings')} value={String(stats.totalBookings)} />
                  <StatCard theme={theme} label={t('admin_stat_completed')} value={String(stats.completedBookings)} />
                  <StatCard theme={theme} label={t('admin_stat_gross')} value={formatEgp(stats.grossRevenueEgp, locale)} />
                  <StatCard
                    theme={theme}
                    label={t('admin_stat_platform_fee')}
                    value={formatEgp(stats.platformFeeEgp, locale)}
                  />
                  <StatCard theme={theme} label={t('admin_stat_pending_owners')} value={String(stats.pendingOwnerCount)} />
                  <StatCard theme={theme} label={t('admin_stat_active_merchants')} value={String(stats.activeMerchantCount)} />
                </View>
                <Text style={[styles.feeNote, { color: theme.textDim }]}>{t('admin_platform_fee_note')}</Text>
              </OwnerSectionCard>
            </>
          ) : null}

          {tab === 'pending' ? (
            <OwnerSectionCard theme={theme} title={t('admin_pending_title')} subtitle={t('admin_pending_lead')}>
              {pending.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>{t('admin_pending_empty')}</Text>
              ) : (
                pending.map((row) => (
                  <View key={row.userId} style={[styles.rowCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{row.shopName}</Text>
                    <Text style={{ color: theme.textMuted }}>
                      {shopTypeLabel(row.shopType, locale)} · {row.email}
                    </Text>
                    <Text style={{ color: theme.textMuted }}>
                      {row.fullName ?? '—'} · {row.phoneShop || row.phone || '—'}
                    </Text>
                    <Text style={{ color: theme.textDim, marginTop: 4 }}>{row.address}</Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        onPress={() => onApprove(row)}
                        disabled={busyId === row.userId}
                        style={[styles.approveBtn, { backgroundColor: theme.accent, opacity: busyId === row.userId ? 0.6 : 1 }]}>
                        <Text style={{ color: theme.onAccent, fontWeight: '800' }}>{t('admin_accept_btn')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onReject(row)}
                        disabled={busyId === row.userId}
                        style={[styles.rejectBtn, { borderColor: theme.border }]}>
                        <Text style={{ color: theme.warm, fontWeight: '800' }}>{t('admin_reject_btn')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </OwnerSectionCard>
          ) : null}

          {tab === 'merchants' ? (
            <OwnerSectionCard theme={theme} title={t('admin_merchants_title')} subtitle={t('admin_merchants_lead')}>
              {merchants.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>{t('admin_merchants_empty')}</Text>
              ) : (
                merchants.map((row) => (
                  <View key={row.userId} style={[styles.rowCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.rowTitle, { color: theme.text }]}>{row.shopName}</Text>
                    <Text style={{ color: theme.textMuted }}>
                      {shopTypeLabel(row.shopType, locale)} · {row.email}
                    </Text>
                    <Text style={{ color: theme.textMuted }}>
                      {t('admin_merchant_branches')}: {row.branchCount}
                    </Text>
                  </View>
                ))
              )}
            </OwnerSectionCard>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

function StatCard({
  theme,
  label,
  value,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  value: string;
}) {
  return (
    <View style={[styles.statCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { borderBottomWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 22, fontWeight: '900' },
  headerSub: { fontSize: 12, marginTop: 4, marginBottom: 10 },
  logout: { fontWeight: '700', fontSize: 14 },
  tabsRow: { gap: 8, paddingBottom: 4 },
  tabBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  tabBtnText: { fontWeight: '700', fontSize: 13 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  statCard: { width: '47%', borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 72 },
  statValue: { fontSize: 18, fontWeight: '900' },
  statLabel: { fontSize: 11, marginTop: 4 },
  feeNote: { fontSize: 11, marginTop: 12, lineHeight: 16 },
  rowCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
});
