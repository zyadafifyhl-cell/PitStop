import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { CustomerStoreOrdersList } from '@/components/customer/CustomerStoreOrdersList';
import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { useCustomerAuth } from '@/context/CustomerAuthContext';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

function formatDisplayPhone(phone: string): string {
  return phone.startsWith('+20') ? `0${phone.slice(3)}` : phone;
}

export default function MyOrdersScreen() {
  const { t } = useI18n();
  const theme = useAppTheme();
  const { customer } = useCustomerAuth();

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {customer ? (
          <View style={[styles.pageHeader, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.profileName, { color: theme.text }]}>{customer.name}</Text>
            {customer.phone ? (
              <Text style={[styles.profilePhone, { color: theme.textMuted }]}>
                {formatDisplayPhone(customer.phone)}
              </Text>
            ) : null}
            <Text style={[styles.pageLead, { color: theme.textMuted }]}>{t('customer_orders_lead')}</Text>
          </View>
        ) : null}

        <CustomerStoreOrdersList userId={customer?.id} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { width: '100%', maxWidth: 1024, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48 },
  pageHeader: {
    borderWidth: 1,
    borderRadius: 24,
    padding: 16,
    marginBottom: 14,
    gap: 4,
  },
  profileName: { fontSize: 20, fontWeight: '900' },
  profilePhone: { fontSize: 16, fontWeight: '700' },
  pageLead: { fontSize: 15, lineHeight: 22, fontWeight: '600', marginTop: 4 },
});
