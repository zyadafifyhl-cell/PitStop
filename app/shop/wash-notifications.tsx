import { Redirect } from 'expo-router';

/** Legacy route — redirects to the unified owner hub. */
export default function WashNotificationsRedirect() {
  return <Redirect href="/shop/wash-owner-hub?tab=queue" />;
}
