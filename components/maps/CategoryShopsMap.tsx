import Ionicons from '@expo/vector-icons/Ionicons';
import * as Location from 'expo-location';
import React, { useEffect, useMemo, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import WebView, { type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

/** Class component types from this package collapse to `never` under React 19. */
const MapWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

import { buildNativeLeafletHtml } from '@/components/maps/nativeLeafletHtml';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { formatDistanceAway, haversineKm } from '@/lib/booking/nearby';
import type { ShopMapPin } from '@/lib/booking/shopMapDiscovery';
import type { ShopType } from '@/lib/booking/types';

type Props = {
  shops: ShopMapPin[];
  shopType: ShopType;
  locale: 'en' | 'ar';
  onShopPress: (shopId: string) => void;
  height?: number;
  /** Stretch to the parent height. Used by the service screen map mode. */
  fill?: boolean;
};

type UserFix = { lat: number; lng: number; accuracy: number | null };

const DEFAULT_HEIGHT = 460;

export function CategoryShopsMap({
  shops,
  shopType,
  locale,
  onShopPress,
  height = DEFAULT_HEIGHT,
  fill = false,
}: Props) {
  const theme = useAppTheme();
  const { t, tp } = useI18n();
  const webRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  const userRef = useRef<UserFix | null>(null);
  const [user, setUser] = useState<UserFix | null>(null);
  const [locStatus, setLocStatus] = useState<'pending' | 'granted' | 'denied'>('pending');
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const darkMap = theme.bg === '#000000';

  const markerData = useMemo(
    () =>
      shops.map((shop) => ({
        pinId: shop.pinId,
        shopId: shop.id,
        lat: shop.latitude,
        lng: shop.longitude,
        label: locale === 'ar' ? shop.nameAr || shop.name : shop.name,
        address: locale === 'ar' ? shop.addressAr || shop.address : shop.address,
      })),
    [shops, locale],
  );

  const html = useMemo(
    () => buildNativeLeafletHtml({ shops: markerData, shopType, locale, dark: darkMap }),
    [markerData, shopType, locale, darkMap],
  );

  useEffect(() => {
    readyRef.current = false;
    setMapReady(false);
    setMapFailed(false);
  }, [html]);

  const selected = shops.find((shop) => shop.pinId === selectedPinId) ?? null;
  const selectedLabel = selected ? (locale === 'ar' ? selected.nameAr || selected.name : selected.name) : '';
  const selectedAddress = selected
    ? locale === 'ar'
      ? selected.addressAr || selected.address
      : selected.address
    : '';
  const selectedDistance =
    selected && user
      ? formatDistanceAway(haversineKm(user.lat, user.lng, selected.latitude, selected.longitude), locale)
      : null;

  useEffect(() => {
    if (selectedPinId && !shops.some((shop) => shop.pinId === selectedPinId)) {
      setSelectedPinId(null);
    }
  }, [shops, selectedPinId]);

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function watch() {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission.status !== 'granted') {
          setLocStatus('denied');
          return;
        }
        setLocStatus('granted');
        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (cancelled) return;
        const fix: UserFix = {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          accuracy: current.coords.accuracy,
        };
        userRef.current = fix;
        setUser(fix);
        pushUser(true);

        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 20,
            timeInterval: 4000,
          },
          (next) => {
            const moving: UserFix = {
              lat: next.coords.latitude,
              lng: next.coords.longitude,
              accuracy: next.coords.accuracy,
            };
            userRef.current = moving;
            setUser(moving);
            pushUser(false);
          },
        );
      } catch {
        if (!cancelled) setLocStatus('denied');
      }
    }

    void watch();
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, []);

  function pushUser(fit: boolean) {
    const fix = userRef.current;
    if (!fix || !readyRef.current) return;
    const accuracy = fix.accuracy == null ? 'null' : String(fix.accuracy);
    webRef.current?.injectJavaScript(
      `window.__pitstopSetUser && window.__pitstopSetUser(${fix.lat}, ${fix.lng}, ${accuracy}, ${fit ? 'true' : 'false'}); true;`,
    );
  }

  function onMapMessage(event: WebViewMessageEvent) {
    try {
      const payload = JSON.parse(event.nativeEvent.data) as { type?: string; pinId?: string };
      if (payload.type === 'ready') {
        readyRef.current = true;
        setMapReady(true);
        pushUser(true);
        return;
      }
      if (payload.type === 'error') {
        setMapFailed(true);
        return;
      }
      if (payload.type === 'select' && payload.pinId) {
        setSelectedPinId(payload.pinId);
      }
    } catch {
      // Ignore malformed bridge messages.
    }
  }

  async function recenter() {
    if (locStatus !== 'granted') {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        setLocStatus('denied');
        return;
      }
      setLocStatus('granted');
    }
    webRef.current?.injectJavaScript('window.__pitstopRecenter && window.__pitstopRecenter(); true;');
  }

  function openDirections() {
    if (!selected) return;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${selected.latitude},${selected.longitude}&travelmode=driving`;
    void Linking.openURL(url).catch(() => undefined);
  }

  const statusLabel =
    locStatus === 'denied' ? t('map_location_off') : user ? t('map_your_location') : t('map_locating');

  return (
    <View style={[styles.wrap, fill ? styles.fill : { height }]}>
      {mapFailed ? (
        <View style={[styles.fallback, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
          <Text style={{ color: theme.textMuted, textAlign: 'center' }}>{t('map_unavailable')}</Text>
        </View>
      ) : (
        <MapWebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html, baseUrl: 'https://unpkg.com/' }}
          onMessage={onMapMessage}
          onError={() => setMapFailed(true)}
          javaScriptEnabled
          domStorageEnabled
          geolocationEnabled
          setSupportMultipleWindows={false}
          androidLayerType="hardware"
          nestedScrollEnabled
          overScrollMode="never"
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          style={styles.web}
        />
      )}

      {!mapReady && !mapFailed ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('map_recenter')}
        onPress={() => {
          void recenter();
        }}
        style={[styles.locateBtn, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        <Ionicons name="navigate" size={18} color={theme.accent} />
      </Pressable>

      <View style={[styles.hud, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}>
        {selected ? (
          <>
            <Text style={[styles.hudTitle, { color: theme.text }]} numberOfLines={1}>
              {selectedLabel}
            </Text>
            <Text style={[styles.hudMeta, { color: theme.textMuted }]} numberOfLines={1}>
              {selectedAddress}
            </Text>
            {selectedDistance ? (
              <Text style={[styles.hudDistance, { color: theme.accent }]}>{selectedDistance}</Text>
            ) : null}
            <View style={styles.hudActions}>
              <Pressable
                onPress={openDirections}
                style={[styles.hudBtn, { borderColor: theme.accent, backgroundColor: theme.bgElevated }]}>
                <Ionicons name="navigate-outline" size={16} color={theme.accent} />
                <Text style={[styles.hudBtnText, { color: theme.accent }]}>{t('map_directions')}</Text>
              </Pressable>
              <Pressable
                onPress={() => onShopPress(selected.id)}
                style={[styles.hudBtn, styles.hudBtnFill, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
                <Text style={[styles.hudBtnText, { color: theme.onAccent }]}>{t('map_open_place')}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.hudIdle}>
            <View style={[styles.youDot, { backgroundColor: theme.accent }]} />
            <View style={styles.hudIdleCopy}>
              <Text style={[styles.hudTitle, { color: theme.text }]} numberOfLines={2}>
                {statusLabel}
              </Text>
              <Text style={[styles.hudMeta, { color: theme.textMuted }]}>
                {tp('map_places_count', { count: String(shops.length) })}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', borderRadius: 16, overflow: 'hidden' },
  fill: { flex: 1, minHeight: 320 },
  web: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    padding: 16,
  },
  locateBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hud: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  hudIdle: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hudIdleCopy: { flex: 1, gap: 2 },
  youDot: { width: 12, height: 12, borderRadius: 6 },
  hudTitle: { fontSize: 16, fontWeight: '800' },
  hudMeta: { fontSize: 13 },
  hudDistance: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  hudActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  hudBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  hudBtnFill: {},
  hudBtnText: { fontSize: 14, fontWeight: '800' },
});
