import { router, Stack } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { useI18n } from '@/context/I18nContext';

export default function NotFoundScreen() {
  const { t } = useI18n();

  return (
    <>
      <Stack.Screen options={{ title: t('screen_oops') }} />
      <View style={styles.container}>
        <Text style={styles.title}>{t('not_found_title')}</Text>

        <Pressable onPress={() => router.replace('/')} style={styles.link}>
          <Text style={styles.linkText}>{t('not_found_link')}</Text>
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
    paddingVertical: 15,
  },
  linkText: {
    fontSize: 14,
    color: '#2e78b7',
  },
});
