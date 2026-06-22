import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import { photoUrlForCatalogCar } from '@/lib/catalogPhotos';
import { addUserVehicle, getCatalogCar } from '@/lib/storage';

export default function AddCarModal() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const catalogCarId = Number(id);
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t, tp } = useI18n();
  const [nickname, setNickname] = useState('');
  const [saving, setSaving] = useState(false);
  const [catalogMeta, setCatalogMeta] = useState<{
    brand: string;
    model: string;
    variant: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!Number.isFinite(catalogCarId) || catalogCarId <= 0) return;
    (async () => {
      const row = await getCatalogCar(catalogCarId);
      if (!cancelled && row) {
        setCatalogMeta({ brand: row.brand, model: row.model, variant: row.variant });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [catalogCarId]);

  async function save() {
    if (!Number.isFinite(catalogCarId) || catalogCarId <= 0) {
      Alert.alert(t('add_alert_missing_title'), t('add_alert_missing_body'));
      return;
    }
    setSaving(true);
    try {
      const userVehicleId = await addUserVehicle(catalogCarId, nickname.trim() || null);
      router.replace(`/car/${userVehicleId}`);
    } catch (e) {
      Alert.alert(t('add_alert_save_fail_title'), e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: t('screen_add_car') }} />
      <KeyboardAvoidingView
        style={[styles.screen, { backgroundColor: palette.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {catalogMeta ? (
          <View style={styles.heroWrap}>
            <Image
              source={{ uri: photoUrlForCatalogCar(catalogMeta.brand, catalogMeta.model) }}
              style={styles.heroImg}
              contentFit="cover"
              transition={200}
            />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.82)']}
              style={styles.heroFade}
            />
            <Text style={styles.heroTitle}>
              {catalogMeta.brand} {catalogMeta.model}
              {catalogMeta.variant ? ` · ${catalogMeta.variant}` : ''}
            </Text>
          </View>
        ) : null}

        <Text style={[styles.label, { color: palette.text }]}>{t('add_nickname_label')}</Text>
        <TextInput
          placeholder={t('add_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          value={nickname}
          onChangeText={setNickname}
          style={[
            styles.input,
            {
              color: palette.text,
              borderColor: colorScheme === 'dark' ? '#444' : '#ccc',
              backgroundColor: colorScheme === 'dark' ? '#1c1c1e' : '#fff',
            },
          ]}
        />
        <Text style={[styles.help, { color: palette.tabIconDefault }]}>
          {tp('add_help', { id: String(catalogCarId || '—') })}
        </Text>

        <Pressable
          onPress={save}
          disabled={saving}
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.tint, opacity: saving ? 0.6 : 1 },
          ]}>
          <Text style={styles.primaryBtnText}>
            {saving ? t('add_saving') : t('add_save')}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.secondaryBtn}>
          <Text style={[styles.secondaryBtnText, { color: palette.tint }]}>{t('add_cancel')}</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 20,
  },
  heroWrap: {
    marginHorizontal: -20,
    marginTop: -8,
    marginBottom: 18,
    height: 168,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'flex-end',
  },
  heroImg: {
    ...StyleSheet.absoluteFillObject,
  },
  heroFade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    padding: 16,
    zIndex: 1,
  },
  label: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  help: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryBtn: {
    marginTop: 28,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryBtn: {
    marginTop: 16,
    alignItems: 'center',
    paddingVertical: 8,
  },
  secondaryBtnText: {
    fontSize: 16,
    fontWeight: '500',
  },
});
