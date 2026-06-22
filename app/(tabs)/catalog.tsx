import FontAwesome from '@expo/vector-icons/FontAwesome';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';
import { useI18n } from '@/context/I18nContext';
import { photoUrlForCatalogCar } from '@/lib/catalogPhotos';
import { listCatalogCars, searchCatalogCars } from '@/lib/storage';

type CatalogRow = {
  id: number;
  brand: string;
  model: string;
  variant: string | null;
  notes: string | null;
};

export default function CatalogScreen() {
  const colorScheme = useColorScheme();
  const palette = Colors[colorScheme ?? 'light'];
  const { t } = useI18n();
  const [query, setQuery] = useState('');
  const [rows, setRows] = useState<CatalogRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const data = await listCatalogCars();
        if (!cancelled) setRows(data);
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  const displayed = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const hay = `${r.brand} ${r.model} ${r.variant ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query]);

  const runServerSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      const data = await listCatalogCars();
      setRows(data);
      return;
    }
    const data = await searchCatalogCars(q);
    setRows(data);
  }, [query]);

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <Text style={[styles.intro, { color: palette.text }]}>{t('catalog_intro')}</Text>
      <View
        style={[
          styles.searchBar,
          { backgroundColor: colorScheme === 'dark' ? '#2c2c2e' : '#ececec' },
        ]}>
        <FontAwesome name="search" size={16} color={palette.tabIconDefault} />
        <TextInput
          placeholder={t('catalog_filter_placeholder')}
          placeholderTextColor={palette.tabIconDefault}
          value={query}
          onChangeText={setQuery}
          style={[styles.input, { color: palette.text }]}
          autoCorrect={false}
          autoCapitalize="none"
        />
        <Pressable onPress={runServerSearch} hitSlop={8}>
          <Text style={{ color: palette.tint, fontWeight: '600' }}>{t('catalog_sql_search')}</Text>
        </Pressable>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(item) => String(item.id)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => router.push(`/add-car?id=${item.id}`)}
            style={({ pressed }) => [
              styles.row,
              {
                borderColor: colorScheme === 'dark' ? '#333' : '#ddd',
                opacity: pressed ? 0.75 : 1,
              },
            ]}>
            <Image
              source={{ uri: photoUrlForCatalogCar(item.brand, item.model) }}
              style={styles.thumb}
              contentFit="cover"
              transition={180}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: palette.text }]}>
                {item.brand} {item.model}
              </Text>
              {item.variant ? (
                <Text style={[styles.rowSub, { color: palette.text }]}>{item.variant}</Text>
              ) : null}
              {item.notes ? (
                <Text style={[styles.note, { color: palette.tabIconDefault }]}>{item.notes}</Text>
              ) : null}
            </View>
            <FontAwesome name="plus-circle" size={22} color={palette.tint} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  intro: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 82,
    height: 56,
    borderRadius: 10,
    backgroundColor: '#00000018',
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  rowSub: {
    fontSize: 14,
    marginTop: 4,
    opacity: 0.9,
  },
  note: {
    fontSize: 12,
    marginTop: 6,
    fontStyle: 'italic',
  },
});
