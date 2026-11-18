import FontAwesome from '@expo/vector-icons/FontAwesome';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { OsmLocationPicker } from '@/components/maps/OsmLocationPicker';
import { BOXED_OVERLAY } from '@/constants/Theme';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { getFastCurrentPosition } from '@/lib/geolocation/getFastCurrentPosition';
import { searchPlacesInEgypt, type PlaceSearchResult } from '@/lib/geolocation/searchPlaces';
import { userAlert } from '@/lib/ui/userAlert';

type Props = {
  visible: boolean;
  initialLatitude: number;
  initialLongitude: number;
  saving?: boolean;
  onClose: () => void;
  onSave: (latitude: number, longitude: number) => Promise<void> | void;
};

/** Header, search row, coordinate row and footer, measured so the map fills what is left. */
const CHROME_HEIGHT = 300;

export function BranchLocationPickerModal({
  visible,
  initialLatitude,
  initialLongitude,
  saving,
  onClose,
  onSave,
}: Props) {
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { height: windowHeight } = useWindowDimensions();
  const [latitude, setLatitude] = useState(initialLatitude);
  const [longitude, setLongitude] = useState(initialLongitude);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLatitude(initialLatitude);
    setLongitude(initialLongitude);
    setQuery('');
    setResults(null);
    // Only reset when the modal opens, not when the saved pin changes underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => () => searchAbortRef.current?.abort(), []);

  const mapHeight = Math.round(Math.min(380, Math.max(180, windowHeight * 0.9 - CHROME_HEIGHT)));

  async function runSearch() {
    const q = query.trim();
    if (q.length < 2 || searching) return;
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    try {
      setResults(await searchPlacesInEgypt(q, { locale, signal: controller.signal }));
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return;
      console.error('[BranchLocationPicker] place search failed:', error);
      setResults(null);
      userAlert(t('map_search_failed'), t('map_search_place_hint'));
    } finally {
      if (searchAbortRef.current === controller) setSearching(false);
    }
  }

  function selectResult(result: PlaceSearchResult) {
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    setQuery(result.name);
    setResults(null);
  }

  async function useCurrentGps() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      userAlert(t('wash_branch_gps_denied_title'), t('wash_branch_gps_denied_body'));
      return;
    }
    setLocating(true);
    try {
      const coords = await getFastCurrentPosition();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setResults(null);
    } catch {
      userAlert(
        t('wash_branch_gps_fail_title'),
        Platform.OS === 'web' ? t('wash_branch_gps_fail_body_web') : t('wash_branch_gps_fail_body'),
      );
    } finally {
      setLocating(false);
    }
  }

  const rowDirection = isRTL ? styles.rowRtl : null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text }, isRTL && styles.textRtl]}>
              {t('wash_branch_gps_pick_on_map')}
            </Text>
            <Text style={[styles.lead, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {t('map_picker_hint')}
            </Text>
          </View>

          <View style={styles.body}>
            <View style={[styles.searchRow, rowDirection]}>
              <View style={[styles.searchField, rowDirection, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <FontAwesome name="search" size={13} color={theme.textMuted} />
                <TextInput
                  value={query}
                  onChangeText={(value) => {
                    setQuery(value);
                    if (!value.trim()) setResults(null);
                  }}
                  onSubmitEditing={() => void runSearch()}
                  returnKeyType="search"
                  placeholder={t('map_search_placeholder')}
                  placeholderTextColor={theme.textDim}
                  style={[styles.searchInput, { color: theme.text }, isRTL && styles.textRtl]}
                />
                {query ? (
                  <Pressable
                    onPress={() => {
                      setQuery('');
                      setResults(null);
                    }}
                    hitSlop={8}
                    accessibilityLabel={t('alert_cancel')}>
                    <FontAwesome name="times-circle" size={14} color={theme.textDim} />
                  </Pressable>
                ) : null}
              </View>
              <Pressable
                onPress={() => void runSearch()}
                disabled={searching || query.trim().length < 2}
                style={[
                  styles.searchBtn,
                  { backgroundColor: theme.accent, opacity: searching || query.trim().length < 2 ? 0.6 : 1 },
                ]}>
                {searching ? (
                  <ActivityIndicator size="small" color={theme.onAccent} />
                ) : (
                  <Text style={[styles.searchBtnText, { color: theme.onAccent }]}>{t('map_search_btn')}</Text>
                )}
              </Pressable>
            </View>

            <View style={[styles.coordRow, rowDirection]}>
              <View style={[styles.coordPill, rowDirection, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <FontAwesome name="map-marker" size={13} color={theme.accent} />
                <Text style={[styles.coordText, { color: theme.text }]} numberOfLines={1}>
                  {latitude.toFixed(5)}, {longitude.toFixed(5)}
                </Text>
              </View>
              <Pressable
                onPress={() => void useCurrentGps()}
                disabled={locating}
                accessibilityRole="button"
                accessibilityLabel={t('map_current_gps')}
                style={[
                  styles.gpsBtn,
                  rowDirection,
                  { borderColor: theme.accent, backgroundColor: theme.accentSoft, opacity: locating ? 0.65 : 1 },
                ]}>
                {locating ? (
                  <ActivityIndicator size="small" color={theme.accent} />
                ) : (
                  <FontAwesome name="crosshairs" size={14} color={theme.accent} />
                )}
                <Text style={[styles.gpsText, { color: theme.accent }]}>{t('map_current_gps')}</Text>
              </Pressable>
            </View>

            <View style={styles.mapArea}>
              <View style={[styles.mapWrap, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
                <OsmLocationPicker
                  latitude={latitude}
                  longitude={longitude}
                  onChange={(lat, lng) => {
                    setLatitude(lat);
                    setLongitude(lng);
                    setResults(null);
                  }}
                  height={mapHeight}
                />
              </View>

              {results ? (
                <View style={[styles.results, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  {results.length === 0 ? (
                    <View style={styles.resultEmpty}>
                      <Text style={[styles.resultEmptyTitle, { color: theme.text }, isRTL && styles.textRtl]}>
                        {t('map_search_no_results')}
                      </Text>
                      <Text style={[styles.resultHint, { color: theme.textMuted }, isRTL && styles.textRtl]}>
                        {t('map_search_place_hint')}
                      </Text>
                    </View>
                  ) : (
                    <ScrollView keyboardShouldPersistTaps="handled" style={styles.resultsScroll}>
                      {results.map((result, index) => (
                        <Pressable
                          key={result.id}
                          onPress={() => selectResult(result)}
                          style={({ pressed }) => [
                            styles.resultRow,
                            rowDirection,
                            index > 0 && { borderTopWidth: 1, borderTopColor: theme.border },
                            pressed && { backgroundColor: theme.bgElevated },
                          ]}>
                          <FontAwesome name="map-marker" size={14} color={theme.accent} style={styles.resultIcon} />
                          <View style={styles.resultTextCol}>
                            <Text
                              style={[styles.resultName, { color: theme.text }, isRTL && styles.textRtl]}
                              numberOfLines={1}>
                              {result.name}
                            </Text>
                            {result.details ? (
                              <Text
                                style={[styles.resultDetails, { color: theme.textMuted }, isRTL && styles.textRtl]}
                                numberOfLines={1}>
                                {result.details}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      ))}
                      <Text
                        style={[
                          styles.resultHint,
                          styles.resultFooterHint,
                          { color: theme.textMuted, borderTopColor: theme.border },
                          isRTL && styles.textRtl,
                        ]}>
                        {t('map_search_place_hint')}
                      </Text>
                    </ScrollView>
                  )}
                </View>
              ) : null}
            </View>
          </View>

          <View style={[styles.footer, rowDirection, { borderTopColor: theme.border }]}>
            <Pressable
              onPress={onClose}
              style={[styles.footerBtn, styles.footerSecondary, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
              <Text style={[styles.footerBtnText, { color: theme.text }]}>{t('add_cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={() => void onSave(latitude, longitude)}
              disabled={saving}
              style={[styles.footerBtn, { backgroundColor: theme.accent, opacity: saving ? 0.7 : 1 }]}>
              {saving ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <Text style={[styles.footerBtnText, { color: theme.onAccent }]}>{t('map_save_location')}</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...BOXED_OVERLAY.backdrop, zIndex: 50 },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '90%',
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
    zIndex: 50,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 18, fontWeight: '900' },
  lead: { fontSize: 12, lineHeight: 17, marginTop: 4 },
  body: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, flexShrink: 1 },
  rowRtl: { flexDirection: 'row-reverse' },
  textRtl: { textAlign: 'right', writingDirection: 'rtl' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 8, minWidth: 0 },
  searchBtn: {
    borderRadius: 12,
    minHeight: 42,
    minWidth: 76,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBtnText: { fontSize: 13, fontWeight: '800' },
  coordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coordPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 0,
  },
  coordText: { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'], flexShrink: 1 },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gpsText: { fontSize: 12, fontWeight: '800' },
  mapArea: { position: 'relative' },
  mapWrap: { borderWidth: 1, borderRadius: 12, padding: 4, overflow: 'hidden' },
  results: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1100,
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  resultsScroll: { maxHeight: 260 },
  resultRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 9 },
  resultIcon: { marginTop: 2 },
  resultTextCol: { flex: 1, minWidth: 0 },
  resultName: { fontSize: 14, fontWeight: '800', lineHeight: 19 },
  resultDetails: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  resultEmpty: { padding: 12, gap: 4 },
  resultEmptyTitle: { fontSize: 13, fontWeight: '800' },
  resultHint: { fontSize: 12, lineHeight: 17 },
  resultFooterHint: { borderTopWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  footerBtn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  footerSecondary: { borderWidth: 1 },
  footerBtnText: { fontSize: 15, fontWeight: '800' },
});
