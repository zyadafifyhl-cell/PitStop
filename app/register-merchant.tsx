import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useRouter, type Href } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AutomotiveBackground } from '@/components/ui/AutomotiveBackground';
import { PitStopEgWordmark } from '@/components/ui/PitStopEgWordmark';
import { useI18n } from '@/context/I18nContext';
import { useShopAuth } from '@/context/ShopAuthContext';
import { useShopCatalog } from '@/context/ShopCatalogContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { isStrongPassword } from '@/lib/authValidation';
import { listAreas } from '@/lib/booking/catalogRepository';
import { MERCHANT_TYPE_OPTIONS } from '@/lib/booking/shopCategories';
import type { ShopType } from '@/lib/booking/types';
import { isValidEgyptMobile } from '@/lib/phone';
import { userAlert } from '@/lib/ui/userAlert';

export default function RegisterMerchantScreen() {
  const router = useRouter();
  const theme = useAppTheme();
  const { t, locale, isRTL } = useI18n();
  const { registerOwner, busy } = useShopAuth();
  const { ready: catalogReady } = useShopCatalog();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [shopName, setShopName] = useState('');
  const [shopNameAr, setShopNameAr] = useState('');
  const [address, setAddress] = useState('');
  const [addressAr, setAddressAr] = useState('');
  const [shopType, setShopType] = useState<ShopType>('detailing_studio');
  const [areaId, setAreaId] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [message, setMessage] = useState('');

  const areas = useMemo(() => (catalogReady ? listAreas() : []), [catalogReady]);

  useEffect(() => {
    if (!areaId && areas[0]) setAreaId(areas[0].id);
  }, [areaId, areas]);

  const fieldStyle = [
    styles.input,
    { backgroundColor: theme.bgElevated, borderColor: theme.border, color: theme.text, textAlign: (isRTL ? 'right' : 'left') as 'right' | 'left' },
  ];

  async function onSubmit() {
    setMessage('');
    if (!acceptedTerms) {
      userAlert(t('owner_register_terms_required_title'), t('owner_register_terms_required_body'));
      return;
    }
    if (!isValidEgyptMobile(phone) || !isStrongPassword(password) || !shopName.trim() || !address.trim() || !areaId) {
      setMessage(t('owner_register_invalid'));
      userAlert(t('owner_register_fail_title'), t('owner_register_invalid'));
      return;
    }
    const result = await registerOwner({
      email,
      password,
      fullName,
      phone,
      shopName,
      shopNameAr,
      shopType,
      areaId,
      address,
      addressAr,
    });
    if (result === 'ok') {
      userAlert(t('owner_register_success_title'), t('owner_register_success_body'));
      router.replace('/welcome?focus=owner&pending=1' as Href);
      return;
    }
    if (result === 'email_taken') {
      setMessage(t('customer_email_taken'));
      return;
    }
    if (result === 'weak_password') {
      setMessage(t('customer_weak_password_body'));
      return;
    }
    setMessage(t('owner_register_invalid'));
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.bg }]}>
      <AutomotiveBackground theme={theme} variant="welcome" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <PitStopEgWordmark size="hero" style={styles.logo} />
          <Text style={[styles.title, { color: theme.text }]}>{t('owner_register_link')}</Text>
          <Text style={[styles.lead, { color: theme.textMuted }]}>{t('owner_register_lead')}</Text>

          <Text style={[styles.section, { color: theme.text }]}>{t('owner_register_type_label')}</Text>
          <Text style={[styles.hint, { color: theme.textDim }]}>{t('owner_register_type_hint')}</Text>
          <View style={styles.typeGrid}>
            {MERCHANT_TYPE_OPTIONS.map((option) => {
              const selected = shopType === option.type;
              return (
                <Pressable
                  key={option.type}
                  onPress={() => setShopType(option.type)}
                  style={[
                    styles.typeCard,
                    {
                      borderColor: selected ? theme.accent : theme.border,
                      backgroundColor: selected ? theme.accentSoft : theme.card,
                    },
                  ]}>
                  <FontAwesome name={option.icon} size={16} color={selected ? theme.accent : theme.text} />
                  <Text style={[styles.typeTitle, { color: selected ? theme.accent : theme.text }]}>{t(option.titleKey)}</Text>
                  <Text style={[styles.typeSub, { color: theme.textMuted }]} numberOfLines={2}>
                    {t(option.subKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <TextInput placeholder={t('customer_name_placeholder')} placeholderTextColor={theme.textDim} value={fullName} onChangeText={setFullName} style={fieldStyle} />
          <TextInput placeholder={t('auth_phone_placeholder')} placeholderTextColor={theme.textDim} keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={fieldStyle} />
          <TextInput placeholder={t('customer_email_placeholder')} placeholderTextColor={theme.textDim} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={fieldStyle} />
          <TextInput placeholder={t('customer_password_placeholder')} placeholderTextColor={theme.textDim} secureTextEntry value={password} onChangeText={setPassword} style={fieldStyle} />
          <TextInput placeholder={t('owner_register_shop_name')} placeholderTextColor={theme.textDim} value={shopName} onChangeText={setShopName} style={fieldStyle} />
          <TextInput placeholder={t('owner_register_shop_name_ar')} placeholderTextColor={theme.textDim} value={shopNameAr} onChangeText={setShopNameAr} style={fieldStyle} />
          <TextInput placeholder={t('owner_register_address')} placeholderTextColor={theme.textDim} value={address} onChangeText={setAddress} style={fieldStyle} />
          <TextInput placeholder={t('owner_register_address_ar')} placeholderTextColor={theme.textDim} value={addressAr} onChangeText={setAddressAr} style={fieldStyle} />

          <Text style={[styles.section, { color: theme.text }]}>{t('owner_register_area_label')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.areaRow}>
            {areas.map((area) => {
              const selected = area.id === areaId;
              return (
                <Pressable
                  key={area.id}
                  onPress={() => setAreaId(area.id)}
                  style={[
                    styles.areaChip,
                    {
                      backgroundColor: selected ? theme.accent : theme.bgElevated,
                      borderColor: selected ? theme.accent : theme.border,
                    },
                  ]}>
                  <Text style={{ color: selected ? theme.onAccent : theme.text, fontWeight: '700', fontSize: 12 }}>
                    {locale === 'ar' ? area.nameAr : area.name}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <Pressable onPress={() => setAcceptedTerms((value) => !value)} style={styles.termsRow}>
            <FontAwesome name={acceptedTerms ? 'check-square' : 'square-o'} size={18} color={theme.accent} />
            <Text style={[styles.termsText, { color: theme.textMuted }]}>{t('owner_register_terms_checkbox')}</Text>
          </Pressable>

          {message ? <Text style={[styles.message, { color: theme.danger }]}>{message}</Text> : null}

          <Pressable onPress={() => void onSubmit()} disabled={busy} style={[styles.submit, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}>
            <Text style={[styles.submitText, { color: theme.onAccent }]}>{busy ? t('auth_registering') : t('owner_register_btn')}</Text>
          </Pressable>
          <Pressable onPress={() => router.replace('/welcome?focus=owner' as Href)} style={styles.switchLink}>
            <Text style={[styles.switchText, { color: theme.warm }]}>{t('owner_have_account')}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 40, paddingBottom: 48, gap: 10 },
  logo: { alignSelf: 'center', marginBottom: 8 },
  title: { fontSize: 24, fontWeight: '900', textAlign: 'center' },
  lead: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
  section: { fontSize: 14, fontWeight: '800', marginTop: 8 },
  hint: { fontSize: 12, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  typeCard: { width: '48%', flexGrow: 1, borderWidth: 1, borderRadius: 16, padding: 12, gap: 6, minHeight: 108 },
  typeTitle: { fontSize: 13, fontWeight: '800' },
  typeSub: { fontSize: 11, lineHeight: 16 },
  areaRow: { gap: 8, paddingVertical: 4 },
  areaChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8 },
  termsText: { flex: 1, fontSize: 12, lineHeight: 18 },
  message: { fontSize: 13, fontWeight: '700' },
  submit: { borderRadius: 16, alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  submitText: { fontSize: 16, fontWeight: '800' },
  switchLink: { alignItems: 'center', paddingVertical: 10 },
  switchText: { fontSize: 14, fontWeight: '700' },
});
