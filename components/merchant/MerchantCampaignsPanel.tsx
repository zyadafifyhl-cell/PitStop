import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { MerchantCampaignForm } from '@/components/merchant/MerchantCampaignForm';
import { MerchantCampaignList } from '@/components/merchant/MerchantCampaignList';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  shopId: string;
};

export function MerchantCampaignsPanel({ shopId }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <View style={styles.wrap}>
      <Text style={[styles.lead, { color: theme.textMuted }]}>{t('campaign_panel_lead')}</Text>
      <MerchantCampaignForm
        shopId={shopId}
        onDeployed={() => {
          setRefreshKey((key) => key + 1);
        }}
      />
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('campaign_list_title')}</Text>
      <MerchantCampaignList shopId={shopId} refreshKey={refreshKey} onChanged={() => setRefreshKey((key) => key + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', marginTop: 8 },
});
