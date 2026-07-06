import * as Location from 'expo-location';
import { Platform } from 'react-native';

const WEB_GEO_TIMEOUT_MS = 6000;
const WEB_GEO_MAX_AGE_MS = 60_000;

type LatLng = { latitude: number; longitude: number };

function fromExpoPosition(pos: Location.LocationObject): LatLng {
  return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
}

/** Fast web GPS via network triangulation; high accuracy on native. */
export async function getFastCurrentPosition(): Promise<LatLng> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise<LatLng>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => reject(error),
        {
          enableHighAccuracy: false,
          timeout: WEB_GEO_TIMEOUT_MS,
          maximumAge: WEB_GEO_MAX_AGE_MS,
        },
      );
    });
  }

  const pos = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.High,
  });
  return fromExpoPosition(pos);
}
