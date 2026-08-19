import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { MAX_STORE_PRODUCT_IMAGES, STORE_SUB_CATEGORIES } from '@/lib/store/constants';
import { createStoreProduct } from '@/lib/store/productRepository';
import type { StoreProduct, StoreProductCategory } from '@/lib/store/types';
import { materializePickerAsset, uploadImageToBucket } from '@/lib/supabase/storageUpload';

type Props = {
  visible: boolean;
  shopId: string;
  category: StoreProductCategory | null;
  onClose: () => void;
  onCreated: (product: StoreProduct) => void;
};

type PreviewImage = {
  id: string;
  previewUri: string;
  mimeType?: string | null;
  fileName?: string | null;
  webFile?: Blob | File | null;
  base64?: string | null;
};

function newPreviewId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function AddProductModal({ visible, shopId, category, onClose, onCreated }: Props) {
  const theme = useAppTheme();
  const { t } = useI18n();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('0');
  const [previewImages, setPreviewImages] = useState<PreviewImage[]>([]);
  const [adding, setAdding] = useState(false);

  const reset = useCallback(() => {
    setName('');
    setPrice('');
    setStock('0');
    setPreviewImages([]);
  }, []);

  const close = useCallback(() => {
    if (adding) return;
    reset();
    onClose();
  }, [adding, onClose, reset]);

  const pickImages = useCallback(async () => {
    const remaining = MAX_STORE_PRODUCT_IMAGES - previewImages.length;
    if (remaining <= 0) {
      Alert.alert(t('store_owner_images_limit'), t('store_owner_images_limit_body'));
      return;
    }
    if (Platform.OS !== 'web') {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('store_owner_image_permission_title'), t('store_owner_image_permission_body'));
        return;
      }
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.85,
      base64: Platform.OS !== 'web',
    });
    const assets = picked.canceled ? [] : picked.assets ?? [];
    if (!assets.length) return;

    const staged: PreviewImage[] = assets.slice(0, remaining).map((asset) => ({
      id: newPreviewId(),
      previewUri: asset.uri,
      mimeType: asset.mimeType,
      fileName: asset.fileName,
      webFile: asset.file ?? null,
      base64: asset.base64 ?? null,
    }));
    setPreviewImages((current) => [...current, ...staged].slice(0, MAX_STORE_PRODUCT_IMAGES));

    void Promise.all(
      staged.map(async (item, index) => {
        const asset = assets[index];
        if (!asset) return;
        try {
          const materialized = await materializePickerAsset(asset);
          setPreviewImages((current) =>
            current.map((row) =>
              row.id === item.id
                ? {
                    ...row,
                    previewUri: materialized.localUri || row.previewUri,
                    mimeType: materialized.mimeType ?? row.mimeType,
                    fileName: materialized.fileName ?? row.fileName,
                    webFile: materialized.webFile ?? row.webFile,
                    base64: materialized.base64 ?? row.base64,
                  }
                : row,
            ),
          );
        } catch (error) {
          console.error('Storage Upload Error:', error);
        }
      }),
    );
  }, [previewImages.length, t]);

  const removeImage = useCallback((id: string) => {
    if (adding) return;
    setPreviewImages((current) => current.filter((item) => item.id !== id));
  }, [adding]);

  const addProduct = useCallback(async () => {
    if (!category) return;
    const parsedPrice = Number(price);
    const stockQuantity = Number(stock);
    if (!name.trim() || !Number.isFinite(parsedPrice) || parsedPrice < 0 || !Number.isInteger(stockQuantity) || stockQuantity < 0) {
      Alert.alert(t('store_owner_save_failed'), t('store_owner_invalid_price'));
      return;
    }

    setAdding(true);
    try {
      const imageUrls: string[] = [];
      for (const image of previewImages) {
        const publicUrl = await uploadImageToBucket({
          localUri: image.previewUri,
          mimeType: image.mimeType,
          fileName: image.fileName,
          webFile: image.webFile,
          base64: image.base64,
          bucket: 'product-images',
          folderPath: `shops/${shopId}/products`,
          throwOnError: true,
        });
        imageUrls.push(publicUrl);
      }

      const created = await createStoreProduct({
        shopId,
        name: name.trim(),
        imageUrl: imageUrls[0],
        imageUrls,
        category,
        subCategory: STORE_SUB_CATEGORIES[category][0]?.id ?? 'other',
        price: parsedPrice,
        stockQuantity,
        compatibilityType: 'universal',
        compatibilityRows: [],
      });
      if (!created) {
        Alert.alert(t('store_owner_save_failed'), t('store_owner_save_failed'));
        return;
      }
      reset();
      onCreated(created);
    } catch (error) {
      console.error('Storage Upload Error:', error);
      Alert.alert(
        t('store_owner_image_upload_failed_title'),
        error instanceof Error ? error.message : t('store_owner_image_upload_failed_body'),
      );
    } finally {
      setAdding(false);
    }
  }, [category, name, onCreated, previewImages, price, reset, shopId, stock, t]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: '#1e293b', borderColor: '#334155' }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: theme.text }]}>{t('store_owner_add_product')}</Text>
            <Pressable onPress={close} hitSlop={8}>
              <FontAwesome name="times" size={20} color={theme.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_product_image')}</Text>
            {previewImages.length ? (
              <View style={styles.previewGrid}>
                {previewImages.map((image, index) => (
                  <View key={image.id} style={[styles.previewTile, { borderColor: '#475569' }]}>
                    <Image source={{ uri: image.previewUri }} style={styles.previewImage} contentFit="cover" />
                    {index === 0 ? (
                      <View style={[styles.coverBadge, { backgroundColor: theme.accent }]}>
                        <Text style={[styles.coverBadgeText, { color: theme.onAccent }]}>{t('store_owner_cover_image')}</Text>
                      </View>
                    ) : null}
                    <Pressable
                      disabled={adding}
                      accessibilityLabel={t('store_owner_remove_image')}
                      onPress={() => removeImage(image.id)}
                      style={[styles.removeThumb, { backgroundColor: theme.danger }]}>
                      <FontAwesome name="times" size={10} color="#fff" />
                    </Pressable>
                  </View>
                ))}
                {previewImages.length < MAX_STORE_PRODUCT_IMAGES ? (
                  <Pressable
                    disabled={adding}
                    onPress={() => void pickImages()}
                    style={[styles.addTile, { borderColor: '#475569', backgroundColor: '#0f172a' }]}>
                    <FontAwesome name="plus" size={16} color={theme.accent} />
                    <Text style={[styles.addTileText, { color: theme.accent }]}>{t('store_owner_add_more_images')}</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <Pressable
                disabled={adding}
                onPress={() => void pickImages()}
                style={({ pressed }) => [
                  styles.uploadDropzone,
                  {
                    borderColor: pressed ? theme.accent : '#475569',
                    backgroundColor: '#0f172a',
                    opacity: adding ? 0.65 : 1,
                  },
                ]}>
                <View style={[styles.uploadIcon, { backgroundColor: theme.accentSoft }]}>
                  <FontAwesome name="cloud-upload" size={24} color={theme.accent} />
                </View>
                <Text style={[styles.uploadTitle, { color: theme.text }]}>{t('store_owner_upload_product_images')}</Text>
                <Text style={[styles.uploadHint, { color: theme.textMuted }]}>{t('store_owner_upload_images_hint')}</Text>
              </Pressable>
            )}

            <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_product_name')}</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={t('store_owner_product_name')}
              placeholderTextColor={theme.textDim}
              style={[styles.modalInput, { color: theme.text, borderColor: '#475569', backgroundColor: '#0f172a' }]}
            />

            <View style={styles.modalGrid}>
              <View style={styles.modalGridItem}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_price')}</Text>
                <View style={[styles.moneyInputWrap, { borderColor: '#475569', backgroundColor: '#0f172a' }]}>
                  <TextInput
                    value={price}
                    onChangeText={setPrice}
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    placeholderTextColor={theme.textDim}
                    style={[styles.moneyInput, { color: theme.text }]}
                  />
                  <Text style={[styles.currency, { color: theme.textMuted }]}>EGP</Text>
                </View>
              </View>
              <View style={styles.modalGridItem}>
                <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{t('store_owner_stock')}</Text>
                <TextInput
                  value={stock}
                  onChangeText={setStock}
                  keyboardType="number-pad"
                  style={[styles.modalInput, { color: theme.text, borderColor: '#475569', backgroundColor: '#0f172a' }]}
                />
              </View>
            </View>
          </ScrollView>
          <View style={styles.modalActions}>
            <Pressable onPress={close} style={[styles.modalButton, { borderColor: '#475569' }]}>
              <Text style={[styles.actionText, { color: theme.text }]}>{t('alert_cancel')}</Text>
            </Pressable>
            <Pressable
              disabled={adding}
              onPress={() => void addProduct()}
              style={[styles.modalButton, { backgroundColor: theme.accent, opacity: adding ? 0.6 : 1 }]}>
              {adding ? (
                <View style={styles.addingRow}>
                  <ActivityIndicator color={theme.onAccent} />
                  <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('store_owner_uploading_images')}</Text>
                </View>
              ) : (
                <Text style={[styles.actionText, { color: theme.onAccent }]}>{t('store_owner_add_product')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { width: '100%', maxWidth: 520, maxHeight: '88%', borderWidth: 1, borderRadius: 18, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#334155' },
  modalTitle: { fontSize: 19, fontWeight: '900' },
  modalBody: { padding: 18 },
  fieldLabel: { marginBottom: 7, fontSize: 11, fontWeight: '800' },
  modalInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 15, fontSize: 14 },
  uploadDropzone: {
    minHeight: 154,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    marginBottom: 16,
  },
  uploadIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  uploadTitle: { fontSize: 14, fontWeight: '900', textAlign: 'center' },
  uploadHint: { fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 5 },
  previewGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  previewTile: { width: 92, height: 92, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  previewImage: { width: '100%', height: '100%' },
  coverBadge: { position: 'absolute', left: 4, bottom: 4, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  coverBadgeText: { fontSize: 8, fontWeight: '900' },
  removeThumb: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTile: {
    width: 92,
    height: 92,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 8,
  },
  addTileText: { fontSize: 10, fontWeight: '800', textAlign: 'center' },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  modalGridItem: { flex: 1, minWidth: 180 },
  moneyInputWrap: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 15,
  },
  moneyInput: { flex: 1, height: 42, minWidth: 0, paddingHorizontal: 11, fontSize: 14, fontWeight: '700' },
  currency: { paddingRight: 10, fontSize: 11, fontWeight: '900' },
  modalActions: { flexDirection: 'row', gap: 10, padding: 18, borderTopWidth: 1, borderTopColor: '#334155' },
  modalButton: { flex: 1, minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  addingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionText: { fontSize: 12, fontWeight: '900' },
});
