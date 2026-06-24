import FontAwesome from '@expo/vector-icons/FontAwesome';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppTheme } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  hint?: string;
  onPress: () => void;
  accent?: string;
};

export function SettingsRow({ icon, label, hint, onPress, accent = AppTheme.accent }: Props) {
  const theme = useAppTheme();
  const { isRTL } = useI18n();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={styles.sideSlot}>
        <View style={[styles.iconWrap, { backgroundColor: `${accent}22` }]}>
          <FontAwesome name={icon} size={18} color={accent} />
        </View>
      </View>
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: theme.text }, isRTL && styles.textRtl]}>{label}</Text>
        {hint ? <Text style={[styles.hint, { color: theme.textMuted }, isRTL && styles.textRtl]}>{hint}</Text> : null}
      </View>
      <View style={styles.sideSlot}>
        <FontAwesome name={isRTL ? 'chevron-left' : 'chevron-right'} size={14} color={theme.textDim} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: AppTheme.border,
  },
  pressed: { opacity: 0.85 },
  sideSlot: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  textRtl: { textAlign: 'right' },
  label: { fontSize: 16, fontWeight: '600' },
  hint: { fontSize: 13, marginTop: 2 },
});
