import type { CustomerVehicle } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

type UserVehicleRow = {
  id: string;
  user_id: string;
  label: string;
  make_model: string;
  color: string | null;
  plate: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

function isUuid(value: string | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mapRow(row: UserVehicleRow): CustomerVehicle {
  return {
    id: row.id,
    label: row.label,
    makeModel: row.make_model,
    color: row.color ?? undefined,
    plate: row.plate ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Resolve the authenticated session user id — must match the caller's customer id. */
export async function resolveAuthenticatedUserId(expectedUserId: string): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !isUuid(expectedUserId)) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user?.id) return null;
  if (data.session.user.id !== expectedUserId) return null;
  return data.session.user.id;
}

export async function listUserVehiclesRemote(userId: string): Promise<CustomerVehicle[]> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId) return [];

  const { data, error } = await supabase
    .from('user_vehicles')
    .select('*')
    .eq('user_id', authUserId)
    .order('is_active', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    console.warn('listUserVehiclesRemote:', error.message);
    return [];
  }

  return (data as UserVehicleRow[]).map(mapRow);
}

export async function getActiveUserVehicleIdRemote(userId: string): Promise<string | null> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId) return null;

  const { data, error } = await supabase
    .from('user_vehicles')
    .select('id')
    .eq('user_id', authUserId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('getActiveUserVehicleIdRemote:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function addUserVehicleRemote(
  userId: string,
  input: { label?: string; makeModel: string; color?: string; plate?: string; setActive?: boolean },
): Promise<CustomerVehicle | null> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId) return null;

  const makeModel = input.makeModel.trim();
  if (!makeModel) return null;

  const setActive = input.setActive !== false;
  const now = new Date().toISOString();

  if (setActive) {
    const { error: clearError } = await supabase
      .from('user_vehicles')
      .update({ is_active: false, updated_at: now })
      .eq('user_id', authUserId);
    if (clearError) console.warn('addUserVehicleRemote:clearActive:', clearError.message);
  }

  const { data, error } = await supabase
    .from('user_vehicles')
    .insert({
      user_id: authUserId,
      label: input.label?.trim() || makeModel,
      make_model: makeModel,
      color: input.color?.trim() || null,
      plate: input.plate?.trim() || null,
      is_active: setActive,
    })
    .select('*')
    .single();

  if (error) {
    console.warn('addUserVehicleRemote:', error.message);
    return null;
  }

  return mapRow(data as UserVehicleRow);
}

export async function updateUserVehicleRemote(
  userId: string,
  vehicleId: string,
  input: Partial<Pick<CustomerVehicle, 'label' | 'makeModel' | 'color' | 'plate'>>,
): Promise<CustomerVehicle | null> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId || !isUuid(vehicleId)) return null;

  const patch: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (input.label != null) patch.label = input.label.trim() || input.makeModel?.trim() || '';
  if (input.makeModel != null) patch.make_model = input.makeModel.trim();
  if (input.color != null) patch.color = input.color.trim() || null;
  if (input.plate != null) patch.plate = input.plate.trim() || null;

  const { data, error } = await supabase
    .from('user_vehicles')
    .update(patch)
    .eq('id', vehicleId)
    .eq('user_id', authUserId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('updateUserVehicleRemote:', error.message);
    return null;
  }

  return data ? mapRow(data as UserVehicleRow) : null;
}

export async function removeUserVehicleRemote(userId: string, vehicleId: string): Promise<boolean> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId || !isUuid(vehicleId)) return false;

  const { error } = await supabase
    .from('user_vehicles')
    .delete()
    .eq('id', vehicleId)
    .eq('user_id', authUserId);

  if (error) {
    console.warn('removeUserVehicleRemote:', error.message);
    return false;
  }

  return true;
}

export async function setActiveUserVehicleRemote(
  userId: string,
  vehicleId: string,
): Promise<CustomerVehicle | null> {
  const supabase = getSupabase();
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!supabase || !authUserId || !isUuid(vehicleId)) return null;

  const now = new Date().toISOString();

  const { error: clearError } = await supabase
    .from('user_vehicles')
    .update({ is_active: false, updated_at: now })
    .eq('user_id', authUserId);
  if (clearError) {
    console.warn('setActiveUserVehicleRemote:clearActive:', clearError.message);
    return null;
  }

  const { data, error } = await supabase
    .from('user_vehicles')
    .update({ is_active: true, updated_at: now })
    .eq('id', vehicleId)
    .eq('user_id', authUserId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.warn('setActiveUserVehicleRemote:', error.message);
    return null;
  }

  return data ? mapRow(data as UserVehicleRow) : null;
}

/** Upload local-only vehicles to Supabase when the remote garage is empty. */
export async function syncLocalVehiclesToRemote(
  userId: string,
  localRows: CustomerVehicle[],
  activeVehicleId?: string | null,
): Promise<CustomerVehicle[]> {
  const authUserId = await resolveAuthenticatedUserId(userId);
  if (!authUserId || !localRows.length) return [];

  const remote = await listUserVehiclesRemote(userId);
  if (remote.length) return remote;

  const uploaded: CustomerVehicle[] = [];
  for (let index = 0; index < localRows.length; index += 1) {
    const row = localRows[index];
    const created = await addUserVehicleRemote(userId, {
      label: row.label,
      makeModel: row.makeModel,
      color: row.color,
      plate: row.plate,
      setActive: activeVehicleId ? row.id === activeVehicleId : index === 0,
    });
    if (created) uploaded.push(created);
  }

  return uploaded.length ? listUserVehiclesRemote(userId) : [];
}
