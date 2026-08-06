import * as ImagePicker from 'expo-image-picker';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { STORE_SUB_CATEGORIES, STORE_VEHICLE_BRANDS } from '@/lib/store/constants';
import { createStoreProduct } from '@/lib/store/productRepository';
import type { StoreCompatibilityType, StoreProductCategory, StoreProductDraft } from '@/lib/store/types';
import { uploadImageToBucket } from '@/lib/supabase/storageUpload';

type Props = {
  onSaved?: () => void;
};

const COMPAT_OPTIONS: Array<{ id: StoreCompatibilityType; labelKey: 'store_compat_universal' | 'store_compat_brand' | 'store_compat_model' }> = [
  { id: 'universal', labelKey: 'store_compat_universal' },
  { id: 'brand_specific', labelKey: 'store_compat_brand' },
  { id: 'model_specific', labelKey: 'store_compat_model' },
];

export function StoreProductForm({ onSaved }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<StoreProductCategory>('spare_parts');
  const [subCategory, setSubCategory] = useState('engine_oil');
  const [price, setPrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [imageUrl, setImageUrl] = useState<string | undefined>();
  const [compatibilityType, setCompatibilityType] = useState<StoreCompatibilityType>('universal');
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [brand, setBrand] = useState('Nissan');
  const [model, setModel] = useState('Sunny');
  const [yearStart, setYearStart] = useState('2018');
  const [yearEnd, setYearEnd] = useState('2024');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const subCategories = useMemo(() => STORE_SUB_CATEGORIES[category], [category]);

  async function onPickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t('store_admin_image_denied_title'), t('store_admin_image_denied_body'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]?.uri) return;

    setUploading(true);
    try {
      const uploaded = await uploadImageToBucket({
        localUri: result.assets[0].uri,
        bucket: 'shop-images',
        folderPath: 'pitstop-store',
      });
      if (uploaded) setImageUrl(uploaded);
    } finally {
      setUploading(false);
    }
  }

  function toggleBrand(value: string) {
    setSelectedBrands((prev) => (prev.includes(value) ? prev.filter((row) => row !== value) : [...prev, value]));
  }

  async function onSave() {
    const parsedPrice = Number(price);
    const parsedStock = Number(stockQuantity);
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0 || !Number.isFinite(parsedStock)) {
      Alert.alert(t('store_admin_invalid_title'), t('store_admin_invalid_body'));
      return;
    }

    const draft: StoreProductDraft = {
      name: name.trim(),
      description: description.trim() || undefined,
      category,
      subCategory,
      price: parsedPrice,
      stockQuantity: Math.max(0, Math.floor(parsedStock)),
      imageUrl,
      compatibilityType,
      compatibilityRows: [],
    };

    if (compatibilityType === 'brand_specific') {
      if (!selectedBrands.length) {
        Alert.alert(t('store_admin_invalid_title'), t('store_admin_brand_required'));
        return;
      }
      draft.compatibilityRows = selectedBrands.map((row) => ({ brand: row }));
    }

    if (compatibilityType === 'model_specific') {
      draft.compatibilityRows = [
        {
          brand,
          model,
          yearStart: Number(yearStart) || undefined,
          yearEnd: Number(yearEnd) || undefined,
        },
      ];
    }

    setSaving(true);
    try {
      const saved = await createStoreProduct(draft);
      if (!saved) {
        Alert.alert(t('store_admin_save_fail_title'), t('store_admin_save_fail_body'));
        return;
      }
      setName('');
      setDescription('');
      setPrice('');
      setStockQuantity('10');
      setImageUrl(undefined);
      setCompatibilityType('universal');
      setSelectedBrands([]);
      onSaved?.();
      Alert.alert(t('store_admin_save_success_title'), t('store_admin_save_success_body'));
    } finally {
      setSaving(false);
    }
  }

  const fieldStyle = [
    styles.field,
    { color: theme.text, borderColor: theme.border, backgroundColor: theme.bgElevated },
  ];

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_name')}</Text>
      <TextInput value={name} onChangeText={setName} style={fieldStyle} placeholder={t('store_admin_name_ph')} placeholderTextColor={theme.textDim} />

      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_description')}</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        style={[fieldStyle, styles.multiline]}
        multiline
        placeholder={t('store_admin_description_ph')}
        placeholderTextColor={theme.textDim}
      />

      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_category')}</Text>
      <View style={styles.row}>
        {(['spare_parts', 'accessories'] as StoreProductCategory[]).map((value) => {
          const active = category === value;
          return (
            <Pressable
              key={value}
              onPress={() => {
                setCategory(value);
                setSubCategory(STORE_SUB_CATEGORIES[value][0]?.id ?? 'engine_oil');
              }}
              style={[styles.chip, { backgroundColor: active ? theme.accent : theme.bgElevated, borderColor: active ? theme.accent : theme.border }]}>
              <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800' }}>
                {value === 'spare_parts' ? t('store_cat_parts') : t('store_cat_accessories')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_subcategory')}</Text>
      <View style={styles.rowWrap}>
        {subCategories.map((row) => {
          const active = subCategory === row.id;
          return (
            <Pressable
              key={row.id}
              onPress={() => setSubCategory(row.id)}
              style={[styles.chip, { backgroundColor: active ? theme.accentSoft : theme.bgElevated, borderColor: active ? theme.accent : theme.border }]}>
              <Text style={{ color: active ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>{row.labelEn}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.twoCol}>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_price')}</Text>
          <TextInput value={price} onChangeText={setPrice} keyboardType="decimal-pad" style={fieldStyle} placeholder="280" placeholderTextColor={theme.textDim} />
        </View>
        <View style={styles.col}>
          <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_stock')}</Text>
          <TextInput value={stockQuantity} onChangeText={setStockQuantity} keyboardType="number-pad" style={fieldStyle} placeholder="10" placeholderTextColor={theme.textDim} />
        </View>
      </View>

      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_image')}</Text>
      <Pressable onPress={() => void onPickImage()} style={[styles.imageBtn, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        {uploading ? (
          <ActivityIndicator color={theme.accent} />
        ) : imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.preview} />
        ) : (
          <Text style={{ color: theme.textMuted }}>{t('store_admin_image_pick')}</Text>
        )}
      </Pressable>

      <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_compatibility')}</Text>
      <View style={styles.rowWrap}>
        {COMPAT_OPTIONS.map((option) => {
          const active = compatibilityType === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setCompatibilityType(option.id)}
              style={[styles.chip, { backgroundColor: active ? theme.accent : theme.bgElevated, borderColor: active ? theme.accent : theme.border }]}>
              <Text style={{ color: active ? theme.onAccent : theme.text, fontWeight: '800', fontSize: 12 }}>{t(option.labelKey)}</Text>
            </Pressable>
          );
        })}
      </View>

      {compatibilityType === 'brand_specific' ? (
        <View style={styles.rowWrap}>
          {STORE_VEHICLE_BRANDS.map((value) => {
            const active = selectedBrands.includes(value);
            return (
              <Pressable
                key={value}
                onPress={() => toggleBrand(value)}
                style={[styles.chip, { backgroundColor: active ? theme.accentSoft : theme.bgElevated, borderColor: active ? theme.accent : theme.border }]}>
                <Text style={{ color: active ? theme.accent : theme.text, fontWeight: '700', fontSize: 12 }}>{value}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {compatibilityType === 'model_specific' ? (
        <View style={styles.modelBlock}>
          <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_brand')}</Text>
          <TextInput value={brand} onChangeText={setBrand} style={fieldStyle} />
          <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_model')}</Text>
          <TextInput value={model} onChangeText={setModel} style={fieldStyle} />
          <View style={styles.twoCol}>
            <View style={styles.col}>
              <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_year_start')}</Text>
              <TextInput value={yearStart} onChangeText={setYearStart} keyboardType="number-pad" style={fieldStyle} />
            </View>
            <View style={styles.col}>
              <Text style={[styles.label, { color: theme.text }]}>{t('store_admin_year_end')}</Text>
              <TextInput value={yearEnd} onChangeText={setYearEnd} keyboardType="number-pad" style={fieldStyle} />
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={() => void onSave()}
        disabled={saving}
        style={[styles.saveBtn, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]}>
        {saving ? <ActivityIndicator color={theme.onAccent} /> : <Text style={[styles.saveText, { color: theme.onAccent }]}>{t('store_admin_save')}</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, paddingBottom: 32 },
  label: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  field: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  twoCol: { flexDirection: 'row', gap: 10 },
  col: { flex: 1 },
  imageBtn: { borderWidth: 1, borderRadius: 12, minHeight: 120, alignItems: 'center', justifyContent: 'center' },
  preview: { width: '100%', height: 160, borderRadius: 12 },
  modelBlock: { gap: 4 },
  saveBtn: { marginTop: 16, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  saveText: { fontSize: 16, fontWeight: '900' },
});
