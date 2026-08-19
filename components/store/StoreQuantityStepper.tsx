import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isAtMaxStock } from '@/lib/store/stockLimits';

type Props = {
  quantity: number;
  max: number;
  disabled?: boolean;
  compact?: boolean;
  allowInput?: boolean;
  onChange: (next: number) => void;
};

export function StoreQuantityStepper({
  quantity,
  max,
  disabled = false,
  compact = false,
  allowInput = false,
  onChange,
}: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [draft, setDraft] = useState(String(quantity));
  const atMax = isAtMaxStock(quantity, max);
  const overStock = quantity > max;
  const canInc = !disabled && max > 0 && quantity < max;
  const canDec = !disabled && quantity > 0;
  const size = compact ? 28 : 32;

  useEffect(() => {
    setDraft(String(quantity));
  }, [quantity]);

  function commitDraft(raw: string) {
    const parsed = Number.parseInt(raw.replace(/[^\d-]/g, ''), 10);
    if (!Number.isFinite(parsed)) {
      setDraft(String(quantity));
      return;
    }
    onChange(parsed);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Pressable
          onPress={() => onChange(quantity - 1)}
          disabled={!canDec}
          style={[
            styles.btn,
            {
              width: size,
              height: size,
              borderColor: theme.border,
              opacity: canDec ? 1 : 0.4,
            },
          ]}>
          <Text style={[styles.btnText, { color: theme.text }]}>−</Text>
        </Pressable>

        {allowInput ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            onBlur={() => commitDraft(draft)}
            onSubmitEditing={() => commitDraft(draft)}
            keyboardType="number-pad"
            editable={!disabled}
            selectTextOnFocus
            style={[
              styles.input,
              {
                color: overStock ? theme.danger : theme.text,
                borderColor: overStock ? theme.danger : theme.border,
              },
            ]}
          />
        ) : (
          <Text style={[styles.value, compact && styles.valueCompact, { color: overStock ? theme.danger : theme.text }]}>
            {quantity}
          </Text>
        )}

        <Pressable
          onPress={() => onChange(quantity + 1)}
          disabled={!canInc}
          style={[
            styles.btn,
            {
              width: size,
              height: size,
              borderColor: atMax || overStock ? theme.danger : theme.border,
              opacity: canInc ? 1 : 0.4,
            },
          ]}>
          <Text style={[styles.btnText, { color: canInc ? theme.text : theme.textMuted }]}>+</Text>
        </Pressable>
      </View>
      {atMax || overStock ? (
        <Text style={[styles.warning, { color: theme.danger }]}>
          {max <= 0
            ? t('store_out_of_stock')
            : t('store_max_stock_reached').replace('{count}', String(max))}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  btn: {
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 16, fontWeight: '800', lineHeight: 18 },
  value: { fontSize: 15, fontWeight: '800', minWidth: 22, textAlign: 'center' },
  valueCompact: { fontSize: 13, minWidth: 18 },
  input: {
    minWidth: 44,
    height: 32,
    borderWidth: 1,
    borderRadius: 8,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  warning: { fontSize: 11, fontWeight: '700', lineHeight: 15 },
});
