import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useI18n } from '@/context/I18nContext';
import { getDb } from '@/lib/storage';

type DbReadyContextValue = {
  ready: boolean;
  error: Error | null;
};

const DatabaseContext = createContext<DbReadyContextValue>({
  ready: false,
  error: null,
});

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await getDb();
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e : new Error(String(e)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ ready, error }), [ready, error]);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>{t('db_error_title')}</Text>
        <Text style={styles.errorBody}>{error.message}</Text>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.loading}>{t('db_loading_catalog')}</Text>
      </View>
    );
  }

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loading: {
    marginTop: 12,
    fontSize: 16,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorBody: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
  },
});

export function useDatabaseReady() {
  return useContext(DatabaseContext);
}
