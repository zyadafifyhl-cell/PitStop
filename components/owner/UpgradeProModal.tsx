import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

const UPGRADE_MAILTO =
  'mailto:Pitstopeg26@gmail.com?subject=PitStop%20Pro%20upgrade';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function UpgradeProModal({ visible, onClose }: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();

  const highlights = [
    t('premium_feature_multibranch'),
    t('premium_feature_staff'),
    t('premium_feature_campaigns'),
    t('premium_feature_inventory'),
    t('premium_feature_analytics'),
  ];

  async function onUpgrade() {
    try {
      await Linking.openURL(UPGRADE_MAILTO);
    } catch {
      /* ignore */
    }
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.iconWrap, { backgroundColor: theme.premiumSoft, borderColor: theme.premium }]}>
            <FontAwesome name="star" size={26} color={theme.premium} />
          </View>
          <Text style={[styles.title, { color: theme.text }]}>{t('premium_upgrade_title')}</Text>
          <Text style={[styles.body, { color: theme.textMuted }]}>{t('premium_upgrade_body')}</Text>
          <View style={styles.list}>
            {highlights.map((line) => (
              <View key={line} style={[styles.listRow, isRTL && styles.listRowRtl]}>
                <FontAwesome name="check" size={13} color={theme.premium} />
                <Text style={[styles.listText, { color: theme.text }]}>{line}</Text>
              </View>
            ))}
          </View>
          <Pressable onPress={() => void onUpgrade()} style={[styles.primaryBtn, { backgroundColor: theme.accent }]}>
            <Text style={[styles.primaryBtnText, { color: theme.onAccent }]}>{t('premium_upgrade_cta')}</Text>
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
    backgroundColor: 'rgba(15,23,42,0.42)',
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
    marginBottom: 14,
  },
  list: { width: '100%', gap: 8, marginBottom: 18 },
  listRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  listRowRtl: { flexDirection: 'row-reverse' },
  listText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '700' },
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
