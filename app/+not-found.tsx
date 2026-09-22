import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useI18n } from '@/context/I18nContext';
import { useAppTheme } from '@/context/ThemePreferenceContext';

export default function NotFoundScreen() {
  const { t } = useI18n();
  const theme = useAppTheme();

  return (
    <>
      <Stack.Screen options={{ title: t('screen_oops') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('not_found_title')}</Text>

        <Pressable onPress={() => router.replace('/')} style={[styles.link, { backgroundColor: theme.accent }]}>
          <Text style={[styles.linkText, { color: theme.onAccent }]}>{t('not_found_link')}</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  link: {
    marginTop: 15,
    minHeight: 48,
    borderRadius: 9,
    paddingHorizontal: 24,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  linkText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
