import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { UpgradeProModal } from '@/components/owner/UpgradeProModal';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useShopSubscription } from '@/lib/shop/useShopSubscription';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  children: React.ReactNode;
  /** Force lock even when premium (rare). Default: lock when !isPro. */
  locked?: boolean;
  shopId?: string;
  hint?: string;
};

export function PremiumFeatureGate({ children, locked, shopId, hint }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { shop } = useShopAuth();
  const { isPro } = useShopSubscription(shopId ?? shop?.id);
  const [modalVisible, setModalVisible] = useState(false);
  const isLocked = locked ?? !isPro;

  if (!isLocked) return <>{children}</>;

  return (
    <>
      <View style={styles.wrap}>
        <View style={[styles.content, styles.dimmed]} pointerEvents="none">
          {children}
        </View>
        <Pressable
          style={[styles.overlay, { backgroundColor: `${theme.bg}88` }]}
          onPress={() => setModalVisible(true)}
          accessibilityRole="button"
          accessibilityLabel={t('premium_locked_badge')}>
          <View style={[styles.lockBadge, { backgroundColor: theme.card, borderColor: theme.premium }]}>
            <FontAwesome name="lock" size={18} color={theme.premium} />
            <Text style={[styles.lockText, { color: theme.premium }]}>{t('premium_locked_badge')}</Text>
          </View>
          <Text style={[styles.hint, { color: theme.text }]}>{hint ?? t('premium_upgrade_cta')}</Text>
        </Pressable>
      </View>
      <UpgradeProModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    marginBottom: 12,
  },
  content: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  dimmed: {
    opacity: 0.42,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 10,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  lockText: {
    fontSize: 14,
    fontWeight: '800',
  },
  hint: {
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 320,
  },
});
