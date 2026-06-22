import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useAuth } from '@/context/AuthContext';

/** Legacy phone OTP gate — disabled for booking prototype (customers book as guests). */
export function AuthGate() {
  const pathname = usePathname();
  const router = useRouter();
  const { configured, ready, session } = useAuth();

  useEffect(() => {
    if (!configured || !ready) return;
    const onAuthScreen = pathname === '/login' || pathname === '/verify';
    if (session && onAuthScreen) router.replace('/');
  }, [configured, ready, session, pathname, router]);

  return null;
}
