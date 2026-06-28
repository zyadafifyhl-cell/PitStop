import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

type Props = {
  compact?: boolean;
};

export function WashBusyBadge({ compact }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View
      style={[
        styles.wrap,
        compact && styles.wrapCompact,
        { backgroundColor: `${theme.danger}18`, borderColor: theme.danger },
      ]}>
      <Animated.View style={[styles.dot, { backgroundColor: theme.danger, opacity: pulse }]} />
      <FontAwesome name="exclamation-circle" size={compact ? 12 : 14} color={theme.danger} />
      <Text style={[styles.text, compact && styles.textCompact, { color: theme.danger }]}>
        {t('wash_busy_customer_notice')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  wrapCompact: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  textCompact: {
    flex: 0,
    fontSize: 12,
    lineHeight: 16,
  },
});
