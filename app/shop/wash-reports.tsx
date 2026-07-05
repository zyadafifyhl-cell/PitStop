import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OwnerHistoryPanel } from '@/components/owner/OwnerHistoryPanel';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { listActiveCouponsForShop } from '@/lib/booking/couponRepository';
import { getWashBranchState, type WashBranchContext } from '@/lib/booking/wash/washBranchStorage';
import { buildReportExportModelFromSavedHtml, openReportPrintFrameWeb } from '@/lib/pdf/reportPrintWeb';
import { listShopReportHistory } from '@/lib/booking/reportHistoryRepository';
import type { WashCenterNotification } from '@/lib/booking/wash/types';

export default function WashReportsScreen() {
  const theme = useAppTheme();
  const { t, locale } = useI18n();
  const { shop, shopStaff } = useShopAuth();
  const params = useLocalSearchParams<{ scope?: string; branchId?: string }>();
  const [reportHistory, setReportHistory] = useState<WashCenterNotification[]>([]);
  const [branchOptions, setBranchOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('all');
  const branchCtx = useMemo<WashBranchContext | undefined>(
    () => (shopStaff ? { staff: shopStaff } : undefined),
    [shopStaff],
  );

  const resolveBranchLabel = useCallback(
    (branch: { name: string; nameAr?: string }) => {
      return locale === 'ar' ? branch.nameAr || branch.name : branch.name;
    },
    [locale],
  );

  const loadBranches = useCallback(async () => {
    if (!shop) return;
    const state = await getWashBranchState(shop, branchCtx);
    const options = [
      { id: 'all', label: t('wash_report_all_branches_option') },
      ...state.branches.map((branch) => ({
        id: branch.id,
        label: resolveBranchLabel(branch),
      })),
    ];
    setBranchOptions(options);
    if (params.scope === 'all') {
      setSelectedBranchId('all');
      return;
    }
    if (typeof params.branchId === 'string' && options.some((option) => option.id === params.branchId)) {
      setSelectedBranchId(params.branchId);
      return;
    }
    setSelectedBranchId(state.activeBranchId ?? 'all');
  }, [shop, branchCtx, params.scope, params.branchId, t, resolveBranchLabel]);

  const loadHistory = useCallback(async () => {
    if (!shop) return;
    const [rows] = await Promise.all([
      listShopReportHistory(shop.id),
      // Ensure coupon persistence query is hydrated for this shop on reports load.
      listActiveCouponsForShop(shop.id),
    ]);
    setReportHistory(rows);
  }, [shop]);

  const onReportGenerated = useCallback((row: WashCenterNotification) => {
    setReportHistory((prev) => {
      if (prev.some((entry) => entry.id === row.id)) return prev;
      return [row, ...prev];
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadBranches();
      void loadHistory();
    }, [loadHistory, loadBranches]),
  );

  const downloadedReports = useMemo(
    () =>
      reportHistory
        .filter((row) => !!row.reportHtml && row.reportHtml.trim().length > 0)
        .filter((row) => selectedBranchId === 'all' || row.branchId === selectedBranchId),
    [reportHistory, selectedBranchId],
  );

  async function onDownloadReport(row: WashCenterNotification) {
    if (!shop) return;
    if (!row.reportHtml) return;
    if (typeof window !== 'undefined') {
      const model = buildReportExportModelFromSavedHtml(row.reportHtml);
      if (!model) {
        Alert.alert(t('wash_report_pdf_fail_title'), t('wash_report_pdf_fail_body'));
        return;
      }
      openReportPrintFrameWeb({
        ...model,
        shopName: locale === 'ar' ? shop.nameAr : shop.name,
        reportTitle: row.title || model.reportTitle,
        generatedAtText: new Date(row.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG'),
        locale: model.locale ?? locale,
      });
      return;
    }
    const file = await Print.printToFileAsync({ html: row.reportHtml });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/pdf',
        dialogTitle: t('wash_report_share_pdf'),
      });
    }
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: theme.bg }]}>
        <Text style={{ color: theme.text }}>{t('book_shop_not_found')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.bg }]} contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()} style={styles.backBtn}>
        <Text style={[styles.backText, { color: theme.accent }]}>{t('wash_notif_back')}</Text>
      </Pressable>
      <OwnerHistoryPanel
        shop={shop}
        staff={shopStaff}
        variant="wash"
        mode="reports"
        branchOptions={branchOptions}
        selectedBranchId={selectedBranchId}
        onSelectBranchId={setSelectedBranchId}
        onReportGenerated={onReportGenerated}
      />
      <View style={[styles.historyCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
        <Text style={[styles.historyTitle, { color: theme.text }]}>{t('wash_report_history_title')}</Text>
        {downloadedReports.length === 0 ? (
          <Text style={[styles.historyEmpty, { color: theme.textMuted }]}>{t('wash_report_history_empty')}</Text>
        ) : (
          downloadedReports.map((row) => (
            <View key={row.id} style={[styles.historyRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.historyRowTitle, { color: theme.text }]}>{row.title}</Text>
                <Text style={[styles.historyRowBody, { color: theme.textMuted }]}>{row.body}</Text>
                <Text style={[styles.historyRowDate, { color: theme.textDim }]}>
                  {new Date(row.createdAt).toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-EG')}
                </Text>
              </View>
              <Pressable
                onPress={() => {
                  void onDownloadReport(row);
                }}
                style={[styles.downloadBtn, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
                <Text style={[styles.downloadBtnText, { color: theme.accent }]}>{t('wash_report_download_pdf')}</Text>
              </Pressable>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 24, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  backBtn: { paddingVertical: 4, alignSelf: 'flex-start' },
  backText: { fontSize: 14, fontWeight: '700' },
  historyCard: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 8 },
  historyTitle: { fontSize: 16, fontWeight: '800' },
  historyEmpty: { fontSize: 13, lineHeight: 18 },
  historyRow: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  historyRowTitle: { fontSize: 14, fontWeight: '800' },
  historyRowBody: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  historyRowDate: { fontSize: 11, marginTop: 4 },
  downloadBtn: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  downloadBtnText: { fontSize: 12, fontWeight: '800' },
});
