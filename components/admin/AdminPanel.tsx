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
import type { TranslationKey } from '@/lib/i18n/strings';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  approveShopOwner,
  deleteModerationContent,
  dismissModerationReport,
  fetchMerchantLedger,
  fetchPlatformStats,
  listActiveMerchants,
  listModerationQueue,
  listPendingOwnerRequests,
  rejectShopOwner,
  settleMerchantPlatformFees,
  toggleShopPremium,
  type ActiveMerchant,
  type MerchantLedgerRow,
  type ModerationQueueItem,
  type PendingOwnerRequest,
  type PlatformStats,
} from '@/lib/admin/adminRepository';
import { shopTypeLabel } from '@/lib/booking/format';
import { formatEgp } from '@/lib/booking/reporting';
import { useAppSignOut } from '@/lib/auth/useAppSignOut';
import { logAndGetSafeErrorMessage } from '@/lib/errors/userError';
import { userAlert, userConfirm } from '@/lib/ui/userAlert';

type AdminTab = 'dashboard' | 'pending' | 'merchants' | 'moderation';

export function AdminPanel() {
  const { t, locale, isRTL } = useI18n();
  const theme = useAppTheme();
  const { staff } = useShopAuth();
  const { signOut } = useAppSignOut();
  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [merchantsLoading, setMerchantsLoading] = useState(false);
  const [moderationLoading, setModerationLoading] = useState(false);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [pending, setPending] = useState<PendingOwnerRequest[]>([]);
  const [merchants, setMerchants] = useState<ActiveMerchant[]>([]);
  const [ledger, setLedger] = useState<MerchantLedgerRow[]>([]);
  const [moderation, setModeration] = useState<ModerationQueueItem[]>([]);

  const showActionError = useCallback(
    (error: unknown, context: string) => {
      userAlert(t('admin_action_fail_title'), logAndGetSafeErrorMessage(error, t, context));
    },
    [t],
  );

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [nextStats, nextLedger] = await Promise.all([
        fetchPlatformStats(),
        fetchMerchantLedger(),
      ]);
      setStats(nextStats);
      setLedger(nextLedger);
    } finally {
      setDashboardLoading(false);
    }
  }, []);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    try {
      setPending(await listPendingOwnerRequests());
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadMerchants = useCallback(async () => {
    setMerchantsLoading(true);
    try {
      setMerchants(await listActiveMerchants());
    } finally {
      setMerchantsLoading(false);
    }
  }, []);

  const loadModeration = useCallback(async () => {
    setModerationLoading(true);
    try {
      setModeration(await listModerationQueue());
    } finally {
      setModerationLoading(false);
    }
  }, []);

  const reload = useCallback(async (scope: 'all' | AdminTab = 'all') => {
    const tasks: Array<Promise<void>> = [];
    if (scope === 'all' || scope === 'dashboard') tasks.push(loadDashboard());
    if (scope === 'all' || scope === 'pending') tasks.push(loadPending());
    if (scope === 'all' || scope === 'merchants') tasks.push(loadMerchants());
    if (scope === 'all' || scope === 'moderation') tasks.push(loadModeration());
    await Promise.all(tasks);
  }, [loadDashboard, loadPending, loadMerchants, loadModeration]);

  useEffect(() => {
    void reload('dashboard');
  }, [reload]);

  useEffect(() => {
    if (tab === 'dashboard') {
      void reload('dashboard');
      return;
    }
    if (tab === 'pending') {
      void reload('pending');
      return;
    }
    if (tab === 'merchants') {
      void reload('merchants');
      return;
    }
    void reload('moderation');
  }, [tab, reload]);

  async function onApprove(row: PendingOwnerRequest) {
    const confirmed = await userConfirm(
      t('admin_approve_confirm_title'),
      t('admin_approve_confirm_body').replace('{shop}', row.shopName),
      { confirmLabel: t('admin_accept_btn'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;

    setBusyId(row.userId);
    try {
      await approveShopOwner(row.userId, row.shopId);
      await Promise.all([reload('pending'), reload('dashboard')]);
      userAlert(t('admin_approve_success_title'), t('admin_approve_success_body'));
    } catch (error) {
      showActionError(error, 'admin.approveOwner');
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: PendingOwnerRequest) {
    const confirmed = await userConfirm(
      t('admin_reject_confirm_title'),
      t('admin_reject_confirm_body').replace('{shop}', row.shopName),
      { confirmLabel: t('admin_reject_btn'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;

    setBusyId(row.userId);
    try {
      await rejectShopOwner(row.userId, row.shopId);
      await Promise.all([reload('pending'), reload('dashboard')]);
      userAlert(t('admin_reject_success_title'), t('admin_reject_success_body'));
    } catch (error) {
      showActionError(error, 'admin.rejectOwner');
    } finally {
      setBusyId(null);
    }
  }

  async function onTogglePremium(row: ActiveMerchant) {
    const next = !row.isPremium;
    const confirmed = await userConfirm(
      t('admin_premium_confirm_title'),
      (next ? t('admin_premium_confirm_enable_body') : t('admin_premium_confirm_disable_body')).replace(
        '{shop}',
        row.shopName,
      ),
      { confirmLabel: t('admin_premium_confirm_btn'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;
    await executeTogglePremium(row, next);
  }

  async function executeTogglePremium(row: ActiveMerchant, next: boolean) {
    setBusyId(row.shopId);
    setMerchants((prev) =>
      prev.map((merchant) => (merchant.shopId === row.shopId ? { ...merchant, isPremium: next } : merchant)),
    );
    try {
      await toggleShopPremium(row.shopId, next);
      userAlert(t('admin_premium_updated_title'), t('admin_premium_updated_body'));
      await Promise.all([reload('merchants'), reload('dashboard')]);
    } catch (error) {
      setMerchants((prev) =>
        prev.map((merchant) =>
          merchant.shopId === row.shopId ? { ...merchant, isPremium: row.isPremium } : merchant,
        ),
      );
      showActionError(error, 'admin.togglePremium');
    } finally {
      setBusyId(null);
    }
  }

  async function onSettleLedger(row: MerchantLedgerRow) {
    const confirmed = await userConfirm(
      t('admin_ledger_settle_confirm_title'),
      t('admin_ledger_settle_confirm_body').replace('{shop}', row.shopName),
      { confirmLabel: t('admin_ledger_settle_btn'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;

    setBusyId(row.shopId);
    try {
      await settleMerchantPlatformFees(row.shopId);
      await reload('dashboard');
      userAlert(t('admin_ledger_settled_title'), t('admin_ledger_settled_body'));
    } catch (error) {
      showActionError(error, 'admin.settleLedger');
    } finally {
      setBusyId(null);
    }
  }

  async function onDismissReport(item: ModerationQueueItem) {
    setBusyId(item.id);
    try {
      await dismissModerationReport(item);
      await reload('moderation');
      userAlert(t('admin_moderation_dismissed_title'), t('admin_moderation_dismissed_body'));
    } catch (error) {
      showActionError(error, 'admin.dismissModeration');
    } finally {
      setBusyId(null);
    }
  }

  async function onDeleteReported(item: ModerationQueueItem) {
    setBusyId(item.id);
    try {
      await deleteModerationContent(item);
      await reload('moderation');
      userAlert(t('admin_moderation_deleted_title'), t('admin_moderation_deleted_body'));
    } catch (error) {
      showActionError(error, 'admin.deleteModeration');
    } finally {
      setBusyId(null);
    }
  }

  const tabBtn = (key: AdminTab, label: string) => {
    const active = tab === key;
    return (
      <Pressable
        key={key}
        onPress={() => setTab(key)}
        style={[
          styles.tabCapsule,
          {
            borderColor: active ? theme.accent : 'transparent',
            backgroundColor: active ? theme.accentSoft : 'transparent',
          },
        ]}>
        <Text style={[styles.tabCapsuleText, { color: active ? theme.accent : theme.textMuted }]}>{label}</Text>
      </Pressable>
    );
  };

  function moderationKindLabel(item: ModerationQueueItem): string {
    if (item.kind === 'post') return t('admin_moderation_kind_post');
    if (item.kind === 'comment') return t('admin_moderation_kind_comment');
    return t('admin_moderation_kind_review');
  }

  return (
    <View style={[styles.screen, { backgroundColor: '#080D1A' }]}>
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: '#080D1A' }]}>
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
          {tabBtn('moderation', t('admin_tab_moderation'))}
        </ScrollView>
      </View>

      <ScrollView
        style={{ backgroundColor: '#080D1A' }}
        contentContainerStyle={[styles.content, { backgroundColor: '#080D1A' }]}
        keyboardShouldPersistTaps="handled">
          {tab === 'dashboard' ? (
            <>
              <OwnerSectionCard theme={theme} title={t('admin_dashboard_title')} subtitle={t('admin_dashboard_lead')}>
                <DashboardStatsGrid
                  theme={theme}
                  locale={locale}
                  isRTL={isRTL}
                  t={t}
                  stats={stats}
                  loading={dashboardLoading}
                />
                <Text style={[styles.feeNote, { color: theme.textDim }, isRTL && styles.textRtl]}>
                  {t('admin_platform_fee_note')}
                </Text>
              </OwnerSectionCard>

              <OwnerSectionCard theme={theme} title={t('admin_ledger_title')} subtitle={t('admin_ledger_lead')}>
                {dashboardLoading && ledger.length === 0 ? (
                  <View style={styles.centerInline}>
                    <ActivityIndicator color={theme.accent} />
                  </View>
                ) : ledger.length === 0 ? (
                  <Text style={{ color: theme.textMuted }}>{t('admin_ledger_empty')}</Text>
                ) : (
                  <>
                    <View style={[styles.ledgerHeader, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                      <Text style={[styles.ledgerHeadCell, styles.ledgerMerchantCol, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                        {t('admin_ledger_col_merchant')}
                      </Text>
                      <Text style={[styles.ledgerHeadCell, styles.ledgerNumCol, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                        {t('admin_ledger_col_outstanding')}
                      </Text>
                    </View>
                    {ledger.map((row) => (
                      <View
                        key={row.shopId}
                        style={[styles.ledgerRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                        <View style={styles.ledgerMerchantCol}>
                          <Text style={[styles.rowTitle, { color: theme.text }]}>{row.shopName}</Text>
                          <Text style={{ color: theme.textMuted }}>
                            {shopTypeLabel(row.shopType, locale)} · {row.ownerEmail}
                          </Text>
                          <Text style={{ color: theme.textDim, marginTop: 4 }}>
                            {t('admin_ledger_col_bookings')}: {row.completedBookings} · {t('admin_ledger_col_gross')}:{' '}
                            {formatEgp(row.grossRevenueEgp, locale)}
                          </Text>
                          <Text style={{ color: theme.textDim, marginTop: 2 }}>
                            {t('admin_ledger_col_settled')}:{' '}
                            {new Date(row.lastSettledAt).toLocaleDateString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                          </Text>
                        </View>
                        <View style={styles.ledgerActionsCol}>
                          <Text style={[styles.ledgerFee, { color: theme.accent }]}>
                            {formatEgp(row.outstandingFeeEgp, locale)}
                          </Text>
                          <Pressable
                            onPress={() => onSettleLedger(row)}
                            disabled={busyId === row.shopId || row.outstandingFeeEgp <= 0}
                            style={[
                              styles.settleBtn,
                              {
                                borderColor: theme.accent,
                                opacity: busyId === row.shopId || row.outstandingFeeEgp <= 0 ? 0.5 : 1,
                              },
                            ]}>
                            <Text style={{ color: theme.accent, fontWeight: '800', fontSize: 12 }}>
                              {t('admin_ledger_settle_btn')}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </>
                )}
              </OwnerSectionCard>
            </>
          ) : null}

          {tab === 'pending' ? (
            <PendingRequestsTab
              theme={theme}
              locale={locale}
              isRTL={isRTL}
              t={t}
              pending={pending}
              pendingLoading={pendingLoading}
              busyId={busyId}
              onApprove={onApprove}
              onReject={onReject}
            />
          ) : null}

          {tab === 'merchants' ? (
            <OwnerSectionCard theme={theme} title={t('admin_merchants_title')} subtitle={t('admin_merchants_lead')}>
              {merchantsLoading && merchants.length === 0 ? (
                <View style={styles.centerInline}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : merchants.length === 0 ? (
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
                    <View style={[styles.premiumRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.premiumLabel, { color: theme.text }]}>{t('admin_premium_toggle_label')}</Text>
                        <Text style={[styles.premiumHint, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                          {row.isPremium ? t('admin_premium_toggle_on') : t('admin_premium_toggle_off')}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => onTogglePremium(row)}
                        disabled={busyId === row.shopId}
                        style={[
                          styles.premiumToggle,
                          {
                            backgroundColor: row.isPremium ? theme.accent : theme.bgElevated,
                            borderColor: row.isPremium ? theme.accent : theme.border,
                            opacity: busyId === row.shopId ? 0.6 : 1,
                          },
                        ]}>
                        <View
                          style={[
                            styles.premiumKnob,
                            {
                              backgroundColor: row.isPremium ? theme.onAccent : theme.textDim,
                              alignSelf: row.isPremium ? 'flex-end' : 'flex-start',
                            },
                          ]}
                        />
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </OwnerSectionCard>
          ) : null}

          {tab === 'moderation' ? (
            <OwnerSectionCard theme={theme} title={t('admin_moderation_title')} subtitle={t('admin_moderation_lead')}>
              {moderationLoading && moderation.length === 0 ? (
                <View style={styles.centerInline}>
                  <ActivityIndicator color={theme.accent} />
                </View>
              ) : moderation.length === 0 ? (
                <Text style={{ color: theme.textMuted }}>{t('admin_moderation_empty')}</Text>
              ) : (
                moderation.map((item) => (
                  <View key={`${item.kind}-${item.id}`} style={[styles.rowCard, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                    <Text style={[styles.kindBadge, { color: theme.accent, backgroundColor: theme.accentSoft }]}>
                      {moderationKindLabel(item)}
                    </Text>
                    <Text style={[styles.rowTitle, { color: theme.text, marginTop: 8 }]}>{item.title}</Text>
                    {item.shopName ? (
                      <Text style={{ color: theme.textMuted }}>
                        {t('admin_moderation_shop_label')}: {item.shopName}
                      </Text>
                    ) : null}
                    <Text style={{ color: theme.textMuted, marginTop: 4 }} numberOfLines={4}>
                      {item.body}
                    </Text>
                    <Text style={{ color: theme.textDim, marginTop: 4 }}>
                      {new Date(item.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                    </Text>
                    <View style={styles.actionRow}>
                      <Pressable
                        onPress={() => onDeleteReported(item)}
                        disabled={busyId === item.id}
                        style={[styles.rejectBtn, { backgroundColor: theme.danger, borderColor: theme.danger, opacity: busyId === item.id ? 0.6 : 1 }]}>
                        <Text style={{ color: '#fff', fontWeight: '800' }}>{t('admin_moderation_delete_btn')}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDismissReport(item)}
                        disabled={busyId === item.id}
                        style={[styles.approveBtn, { borderColor: theme.border, borderWidth: 1, backgroundColor: theme.bgElevated }]}>
                        <Text style={{ color: theme.text, fontWeight: '800' }}>{t('admin_moderation_dismiss_btn')}</Text>
                      </Pressable>
                    </View>
                  </View>
                ))
              )}
            </OwnerSectionCard>
          ) : null}
      </ScrollView>
    </View>
  );
}

function PendingRequestsTab({
  theme,
  locale,
  isRTL,
  t,
  pending,
  pendingLoading,
  busyId,
  onApprove,
  onReject,
}: {
  theme: ReturnType<typeof useAppTheme>;
  locale: 'en' | 'ar';
  isRTL: boolean;
  t: (key: TranslationKey) => string;
  pending: PendingOwnerRequest[];
  pendingLoading: boolean;
  busyId: string | null;
  onApprove: (row: PendingOwnerRequest) => void;
  onReject: (row: PendingOwnerRequest) => void;
}) {
  return (
    <OwnerSectionCard theme={theme} title={t('admin_pending_title')} subtitle={t('admin_pending_lead')}>
      {pendingLoading && pending.length === 0 ? (
        <View style={styles.centerInline}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : pending.length === 0 ? (
        <Text style={{ color: theme.textMuted }}>{t('admin_pending_empty')}</Text>
      ) : (
        pending.map((row) => {
          const isBusy = busyId === row.userId;
          return (
            <View
              key={row.userId}
              style={[styles.pendingCard, { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#121826' }]}>
              <Text style={[styles.pendingShopName, { color: theme.text }, isRTL && styles.textRtl]}>{row.shopName}</Text>
              <Text style={[styles.pendingMeta, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {shopTypeLabel(row.shopType, locale)} · {row.email}
              </Text>
              <Text style={[styles.pendingOwner, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                {row.fullName ?? '—'} · {row.phoneShop || row.phone || '—'}
              </Text>
              <Text style={[styles.pendingAddress, { color: theme.textDim }, isRTL && styles.textRtl]}>{row.address}</Text>

              <View style={[styles.pendingCardFooter, isRTL && styles.pendingCardFooterRtl]}>
                <Pressable
                  onPress={() => onReject(row)}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    styles.pendingRejectBtn,
                    { borderColor: 'rgba(255,255,255,0.08)', opacity: isBusy ? 0.5 : pressed ? 0.75 : 1 },
                  ]}>
                  <Text style={[styles.pendingRejectText, { color: theme.textMuted }]}>{t('admin_reject_btn')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => onApprove(row)}
                  disabled={isBusy}
                  style={({ pressed }) => [
                    styles.pendingAcceptBtn,
                    { backgroundColor: theme.accent, opacity: isBusy ? 0.6 : pressed ? 0.88 : 1 },
                  ]}>
                  {isBusy ? (
                    <ActivityIndicator color={theme.onAccent} size="small" />
                  ) : (
                    <Text style={[styles.pendingAcceptText, { color: theme.onAccent }]}>{t('admin_accept_btn')}</Text>
                  )}
                </Pressable>
              </View>
            </View>
          );
        })
      )}
    </OwnerSectionCard>
  );
}

function DashboardStatsGrid({
  theme,
  locale,
  isRTL,
  t,
  stats,
  loading,
}: {
  theme: ReturnType<typeof useAppTheme>;
  locale: 'en' | 'ar';
  isRTL: boolean;
  t: (key: TranslationKey) => string;
  stats: PlatformStats | null;
  loading: boolean;
}) {
  if (loading && !stats) {
    return <AdminStatsSkeleton theme={theme} />;
  }

  if (!stats) {
    return <Text style={{ color: theme.textMuted }}>{t('admin_platform_fee_note')}</Text>;
  }

  return (
    <View style={styles.statsGrid}>
      <DashboardStatCard
        theme={theme}
        isRTL={isRTL}
        label={t('admin_stat_total_revenue')}
        value={formatEgp(stats.totalRevenueEgp, locale)}
        accentColor="#00D4FF"
      />
      <DashboardStatCard
        theme={theme}
        isRTL={isRTL}
        label={t('admin_stat_active_shops')}
        value={String(stats.activeShopsCount)}
        accentColor={theme.green}
      />
      <DashboardStatCard
        theme={theme}
        isRTL={isRTL}
        label={t('admin_stat_completed_bookings')}
        value={String(stats.completedBookingsCount)}
        accentColor="#00D4FF"
      />
      <DashboardStatCard
        theme={theme}
        isRTL={isRTL}
        label={t('admin_stat_reported_posts')}
        value={String(stats.reportedPostsCount)}
        accentColor={theme.textMuted}
      />
    </View>
  );
}

function DashboardStatCard({
  theme,
  label,
  value,
  accentColor,
  isRTL,
}: {
  theme: ReturnType<typeof useAppTheme>;
  label: string;
  value: string;
  accentColor: string;
  isRTL: boolean;
}) {
  return (
    <View
      style={[styles.dashboardStatCard, { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#121826' }]}>
      <Text
        style={[styles.dashboardStatValue, { color: theme.text }, isRTL && styles.textRtl]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}>
        {value}
      </Text>
      <Text
        style={[styles.dashboardStatLabel, { color: accentColor }, isRTL && styles.textRtl]}
        numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function AdminStatsSkeleton({ theme }: { theme: ReturnType<typeof useAppTheme> }) {
  return (
    <View style={styles.statsGrid}>
      {Array.from({ length: 4 }).map((_, idx) => (
        <View
          key={`admin-skeleton-${idx}`}
          style={[
            styles.dashboardStatCard,
            styles.skeletonBlock,
            { borderColor: 'rgba(255,255,255,0.05)', backgroundColor: '#121826' },
          ]}
        />
      ))}
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
  tabCapsule: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 9,
    marginRight: 8,
  },
  tabCapsuleText: { fontWeight: '700', fontSize: 13 },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerInline: { paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  dashboardStatCard: {
    flexGrow: 1,
    flexBasis: '47%',
    minWidth: 148,
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 88,
  },
  dashboardStatValue: { fontSize: 22, fontWeight: '900', lineHeight: 28 },
  dashboardStatLabel: { fontSize: 12, fontWeight: '700', marginTop: 6, lineHeight: 17 },
  skeletonBlock: { opacity: 0.45 },
  feeNote: { fontSize: 11, marginTop: 12, lineHeight: 16 },
  textRtl: { writingDirection: 'rtl', textAlign: 'right' },
  rowCard: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  rowTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  pendingCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 12,
  },
  pendingShopName: { fontSize: 18, fontWeight: '800', lineHeight: 24 },
  pendingMeta: { fontSize: 13, marginTop: 6, lineHeight: 19 },
  pendingOwner: { fontSize: 13, marginTop: 4, lineHeight: 19 },
  pendingAddress: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  pendingCardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
  },
  pendingCardFooterRtl: { flexDirection: 'row-reverse' },
  pendingAcceptBtn: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minWidth: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingAcceptText: { fontSize: 13, fontWeight: '800' },
  pendingRejectBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
  },
  pendingRejectText: { fontSize: 13, fontWeight: '700' },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approveBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  rejectBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1 },
  premiumRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  premiumLabel: { fontSize: 14, fontWeight: '800' },
  premiumHint: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  premiumToggle: {
    width: 52,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  premiumKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  ledgerHeader: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  ledgerHeadCell: { fontSize: 12, fontWeight: '800' },
  ledgerRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    gap: 10,
    alignItems: 'flex-start',
  },
  ledgerMerchantCol: { flex: 1 },
  ledgerActionsCol: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 120, gap: 8 },
  ledgerNumCol: { textAlign: 'right' },
  ledgerFee: { fontSize: 16, fontWeight: '900' },
  settleBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  kindBadge: {
    alignSelf: 'flex-start',
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
});
