import AsyncStorage from '@react-native-async-storage/async-storage';

import { syncPrimaryVehicleFromCarType } from '@/lib/booking/vehicleStorage';

export type CarProfile = {
  carType: string;
};

function key(customerId: string): string {
  return `@pitstop/car-profile/${customerId}`;
}

export async function getSavedCarProfile(customerId: string): Promise<CarProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(key(customerId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CarProfile>;
    if (typeof parsed.carType === 'string' && parsed.carType.trim()) {
      return { carType: parsed.carType.trim() };
    }
  } catch {
    // ignore malformed local data
  }
  return null;
}

export async function saveCarProfile(customerId: string, profile: CarProfile): Promise<void> {
  const carType = profile.carType.trim();
  await AsyncStorage.setItem(key(customerId), JSON.stringify({ carType }));
  await syncPrimaryVehicleFromCarType(customerId, carType);
}
