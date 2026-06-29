import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

const PREMIUM_GOLD = '#D4AF37';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function PremiumUpgradeModal({ visible, onClose }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: `${PREMIUM_GOLD}22`, borderColor: PREMIUM_GOLD }]}>
            <FontAwesome name="lock" size={28} color={PREMIUM_GOLD} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t('premium_upgrade_title')}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('premium_upgrade_body')}</Text>
          <Pressable
            onPress={onClose}
            style={[styles.primaryBtn, { backgroundColor: PREMIUM_GOLD }]}>
            <Text style={[styles.primaryBtnText, { color: '#1A1408' }]}>{t('premium_upgrade_cta')}</Text>
          </Pressable>
          <Pressable onPress={onClose} style={[styles.secondaryBtn, { borderColor: theme.border }]}>
            <Text style={[styles.secondaryBtnText, { color: theme.text }]}>{t('premium_upgrade_cancel')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  primaryBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryBtn: {
    width: '100%',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
