import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { createElement, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/context/ThemePreferenceContext';
import {
  dateFromYmd,
  formatDateYmdLabel,
  minBookingDate,
  toDateYmd,
} from '@/lib/booking/format';
import type { Locale } from '@/lib/i18n/strings';

type Props = {
  valueYmd: string;
  onChangeYmd: (ymd: string) => void;
  locale: Locale;
  label: string;
  pickHint: string;
  minimumDate?: Date;
  borderColor?: string;
  backgroundColor?: string;
  textColor?: string;
  compact?: boolean;
};

export function BookingDatePicker({
  valueYmd,
  onChangeYmd,
  locale,
  label,
  pickHint,
  minimumDate,
  borderColor,
  backgroundColor,
  textColor,
  compact = false,
}: Props) {
  const theme = useAppTheme();
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const resolvedBorderColor = borderColor ?? theme.border;
  const resolvedBackgroundColor = backgroundColor ?? theme.card;
  const resolvedTextColor = textColor ?? theme.text;
  const minDate = minimumDate ?? minBookingDate();
  const selected = dateFromYmd(valueYmd) ?? minDate;
  const minYmd = toDateYmd(minDate);

  function onNativeChange(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === 'android') setShowAndroidPicker(false);
    if (date) onChangeYmd(toDateYmd(date));
  }

  if (Platform.OS === 'web') {
    return (
      <View style={compact ? styles.wrapCompact : styles.wrap}>
        <Text style={[compact ? styles.labelCompact : styles.label, { color: resolvedTextColor }]}>{label}</Text>
        {createElement('input', {
          type: 'date',
          value: valueYmd,
          min: minYmd,
          onChange: (e: { target: { value: string } }) => onChangeYmd(e.target.value),
          style: {
            width: '100%',
            borderWidth: 1,
            borderStyle: 'solid',
            borderColor: resolvedBorderColor,
            borderRadius: compact ? 10 : 12,
            padding: compact ? 8 : 14,
            fontSize: compact ? 14 : 16,
            backgroundColor: resolvedBackgroundColor,
            color: resolvedTextColor,
            boxSizing: 'border-box',
          },
        })}
      </View>
    );
  }

  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <Text style={[compact ? styles.labelCompact : styles.label, { color: resolvedTextColor }]}>{label}</Text>
      {Platform.OS === 'android' ? (
        <>
          <Pressable
            onPress={() => setShowAndroidPicker(true)}
            style={[compact ? styles.fieldCompact : styles.field, { borderColor: resolvedBorderColor, backgroundColor: resolvedBackgroundColor }]}>
            <FontAwesome name="calendar" size={18} color={theme.accent} />
            <Text style={[styles.value, { color: resolvedTextColor }]}>
              {formatDateYmdLabel(valueYmd, locale)}
            </Text>
          </Pressable>
          {showAndroidPicker ? (
            <DateTimePicker
              value={selected}
              mode="date"
              display="default"
              minimumDate={minDate}
              onChange={onNativeChange}
            />
          ) : null}
        </>
      ) : (
        <View style={[styles.pickerWrap, { borderColor: resolvedBorderColor, backgroundColor: resolvedBackgroundColor }]}>
          <Text style={[styles.iosHint, { color: theme.textMuted }]}>{pickHint}</Text>
          <DateTimePicker
            value={selected}
            mode="date"
            display="inline"
            minimumDate={minDate}
            onChange={onNativeChange}
            locale={locale === 'ar' ? 'ar-EG' : undefined}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  wrapCompact: { marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  labelCompact: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  fieldCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  value: { fontSize: 16, fontWeight: '600', flex: 1 },
  pickerWrap: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  iosHint: { fontSize: 12, paddingHorizontal: 12, paddingTop: 10 },
});
