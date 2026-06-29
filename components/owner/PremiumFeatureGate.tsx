import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PremiumUpgradeModal } from '@/components/owner/PremiumUpgradeModal';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

const PREMIUM_GOLD = '#D4AF37';

type Props = {
  children: React.ReactNode;
  /** Force lock even when premium (rare). Default: lock when !isPremium. */
  locked?: boolean;
};

export function PremiumFeatureGate({ children, locked }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const { isPremium } = useShopAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const isLocked = locked ?? !isPremium;

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
          <View style={[styles.lockBadge, { backgroundColor: theme.card, borderColor: PREMIUM_GOLD }]}>
            <FontAwesome name="lock" size={20} color={PREMIUM_GOLD} />
            <Text style={[styles.lockText, { color: theme.text }]}>{t('premium_locked_badge')}</Text>
          </View>
        </Pressable>
      </View>
      <PremiumUpgradeModal visible={modalVisible} onClose={() => setModalVisible(false)} />
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
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
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
});
