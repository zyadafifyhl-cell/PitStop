import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { Customer } from '@/lib/booking/customers';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';
import { userAlert, userConfirm } from '@/lib/ui/userAlert';

type Props = {
  visible: boolean;
  customer: Customer | null;
  onClose: () => void;
  verifyPassword: (password: string) => Promise<'ok' | 'invalid' | 'not_configured'>;
  updateProfile: (input: {
    name: string;
    email: string;
    phone: string;
    password?: string;
  }) => Promise<'ok' | 'invalid' | 'not_configured' | 'email_taken' | 'weak_password'>;
  deleteAccount: () => Promise<'ok' | 'invalid' | 'not_configured'>;
  resetPassword: (email: string) => Promise<'ok' | 'invalid' | 'not_configured'>;
};

function ProfileFieldInput({
  icon,
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'sentences' | 'words';
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: theme.textMuted }]}>{label}</Text>
      <View style={[styles.fieldRow, { borderColor: theme.border, backgroundColor: theme.bgElevated }]}>
        <FontAwesome name={icon} size={16} color={theme.textDim} style={styles.fieldIcon} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textDim}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize ?? 'sentences'}
          style={[styles.fieldInput, { color: theme.text }]}
        />
      </View>
    </View>
  );
}

export function PrivacySettingsModal({
  visible,
  customer,
  onClose,
  verifyPassword,
  updateProfile,
  deleteAccount,
  resetPassword,
}: Props) {
  const theme = useAppTheme();
  const { t, isRTL } = useI18n();
  const [unlocked, setUnlocked] = useState(false);
  const [verifyInput, setVerifyInput] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setUnlocked(false);
      setVerifyInput('');
      setPassword('');
      return;
    }
    if (customer) {
      setName(customer.name);
      setEmail(customer.email);
      setPhone(customer.phone.replace('+20', '0'));
    }
  }, [visible, customer]);

  async function onUnlock() {
    const result = await verifyPassword(verifyInput);
    if (result === 'ok') {
      setUnlocked(true);
      setVerifyInput('');
      return;
    }
    if (result === 'not_configured') {
      Alert.alert(t('privacy_not_configured_title'), t('privacy_not_configured_body'));
      return;
    }
    Alert.alert(t('privacy_wrong_password_title'), t('privacy_wrong_password_body'));
  }

  async function onSaveProfile() {
    if (!customer) return;
    const changedPassword = password.trim().length > 0;
    setBusy(true);
    try {
      const result = await updateProfile({
        name,
        email,
        phone,
        password: password.trim() || undefined,
      });
      if (result === 'ok') {
        userAlert(
          changedPassword ? t('customer_reset_password_title') : t('privacy_profile_saved_title'),
          changedPassword ? t('customer_reset_password_done') : t('privacy_profile_saved_body'),
        );
        setPassword('');
        return;
      }
      if (result === 'email_taken') {
        Alert.alert(t('privacy_profile_save_fail_title'), t('privacy_profile_email_taken'));
        return;
      }
      if (result === 'weak_password') {
        Alert.alert(t('privacy_profile_save_fail_title'), t('customer_weak_password_body'));
        return;
      }
      Alert.alert(t('privacy_profile_save_fail_title'), t('privacy_profile_save_fail_body'));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteAccount() {
    const confirmed = await userConfirm(
      t('privacy_delete_confirm_title'),
      t('privacy_delete_confirm_body'),
      { confirmLabel: t('privacy_delete_confirm_btn'), cancelLabel: t('alert_cancel') },
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const result = await deleteAccount();
      if (result === 'ok') {
        onClose();
        router.replace('/welcome');
        userAlert(t('privacy_delete_success_title'), t('privacy_delete_success_body'));
        return;
      }
      if (result === 'not_configured') {
        Alert.alert(t('privacy_not_configured_title'), t('privacy_delete_not_configured_body'));
        return;
      }
      Alert.alert(t('privacy_delete_fail_title'), t('privacy_delete_fail_body'));
    } finally {
      setDeleting(false);
    }
  }

  async function onResetPassword() {
    if (!customer?.email) return;
    const result = await resetPassword(customer.email);
    Alert.alert(
      t('customer_reset_password_title'),
      result === 'ok' ? t('customer_reset_password_sent') : t('customer_reset_password_fail'),
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView contentContainerStyle={styles.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={[styles.modalTitle, { color: theme.text }, isRTL && styles.textRtl]}>
              {t('privacy_settings_title')}
            </Text>
            <Text style={[styles.modalLead, { color: theme.textMuted }, isRTL && styles.textRtl]}>
              {unlocked ? t('privacy_profile_edit_lead') : t('privacy_settings_lead')}
            </Text>

            {!unlocked ? (
              <>
                <ProfileFieldInput
                  icon="lock"
                  label={t('privacy_password_label')}
                  value={verifyInput}
                  onChangeText={setVerifyInput}
                  placeholder={t('privacy_password_placeholder')}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Pressable onPress={onUnlock} style={[styles.modalBtn, { backgroundColor: theme.accent }]}>
                  <Text style={[styles.modalBtnText, { color: theme.onAccent }]}>{t('privacy_unlock')}</Text>
                </Pressable>
                <Pressable onPress={onResetPassword} style={styles.modalLinkBtn}>
                  <Text style={[styles.modalLinkText, { color: theme.accent }]}>{t('privacy_forgot_password')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <ProfileFieldInput
                  icon="user"
                  label={t('privacy_user_label')}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('privacy_user_label')}
                />
                <ProfileFieldInput
                  icon="envelope"
                  label={t('privacy_email_label')}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t('privacy_email_label')}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <ProfileFieldInput
                  icon="phone"
                  label={t('privacy_phone_label')}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder={t('privacy_phone_label')}
                  keyboardType="phone-pad"
                />
                <ProfileFieldInput
                  icon="lock"
                  label={t('privacy_password_label')}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={t('privacy_new_password_placeholder')}
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Pressable
                  onPress={onSaveProfile}
                  disabled={busy}
                  style={[styles.modalBtn, { backgroundColor: theme.accent, opacity: busy ? 0.7 : 1 }]}>
                  {busy ? (
                    <ActivityIndicator color={theme.onAccent} />
                  ) : (
                    <Text style={[styles.modalBtnText, { color: theme.onAccent }]}>{t('privacy_profile_save')}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={onDeleteAccount}
                  disabled={deleting}
                  style={[styles.deleteBtn, { borderColor: theme.danger, opacity: deleting ? 0.7 : 1 }]}>
                  {deleting ? (
                    <ActivityIndicator color={theme.danger} />
                  ) : (
                    <Text style={[styles.deleteBtnText, { color: theme.danger }]}>{t('privacy_delete_account')}</Text>
                  )}
                </Pressable>
              </>
            )}

            <Pressable onPress={onClose} style={[styles.modalCloseBtn, { borderColor: theme.border }]}>
              <Text style={[styles.modalCloseText, { color: theme.textMuted }]}>{t('alert_cancel')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  modalScroll: { paddingBottom: 8 },
  modalTitle: { fontSize: 20, fontWeight: '800', marginBottom: 6 },
  modalLead: { fontSize: 13, lineHeight: 19, marginBottom: 12 },
  fieldWrap: { marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '700', marginBottom: 6 },
  fieldRow: {
    borderWidth: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    minHeight: 48,
  },
  fieldIcon: { marginRight: 10 },
  fieldInput: { flex: 1, fontSize: 15, paddingVertical: 10 },
  modalBtn: {
    marginTop: 6,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalBtnText: { fontSize: 15, fontWeight: '800' },
  modalLinkBtn: { marginTop: 10, alignItems: 'center' },
  modalLinkText: { fontSize: 13, fontWeight: '700' },
  deleteBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '800' },
  modalCloseBtn: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
  textRtl: { textAlign: 'right' },
});
