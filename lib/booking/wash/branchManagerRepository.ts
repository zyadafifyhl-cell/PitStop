import { setStaffInviteLock } from '@/lib/auth/staffInviteLock';
import { resolveRemoteBranchId } from '@/lib/booking/wash/branchRepository';
import type { DbUser } from '@/lib/supabase/database.types';
import { getSupabase } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function fetchBranchManagerRemote(branchId: string, shopId?: string): Promise<DbUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const targetBranchId =
    !isUuid(branchId) && shopId
      ? (await resolveRemoteBranchId(shopId, branchId)) ?? branchId
      : branchId;
  const direct = await supabase
    .from('users')
    .select('*')
    .eq('branch_id', targetBranchId)
    .eq('role', 'branch_manager')
    .eq('is_active', true)
    .maybeSingle();
  if (!direct.error && direct.data) {
    return direct.data as DbUser;
  }

  // Fallback: some projects link manager on shop_branches.manager_user_id
  const branchRow = await supabase
    .from('shop_branches')
    .select('manager_user_id')
    .eq('id', targetBranchId)
    .maybeSingle();
  const managerUserId = branchRow.data?.manager_user_id;
  if (!managerUserId) return null;

  const linked = await supabase
    .from('users')
    .select('*')
    .eq('id', managerUserId)
    .eq('role', 'branch_manager')
    .eq('is_active', true)
    .maybeSingle();
  if (linked.error) return null;
  return (linked.data as DbUser) ?? null;
}

/**
 * Returns true when the shop has any active branch_manager profile.
 * Used to enforce manager-only controls for owner accounts.
 */
export async function hasAnyBranchManagerRemote(shopId: string): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('shop_id', shopId)
    .eq('role', 'branch_manager')
    .eq('is_active', true)
    .limit(1);

  if (error) return false;
  return (data?.length ?? 0) > 0;
}

/** Remove manager assignment from a branch and deactivate manager access. */
export async function removeBranchManagerRemote(input: {
  shopId: string;
  branchId: string;
  managerUserId: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;

  const targetBranchId =
    !isUuid(input.branchId) ? (await resolveRemoteBranchId(input.shopId, input.branchId)) ?? input.branchId : input.branchId;

  const timestamp = new Date().toISOString();
  const { data: sessionData } = await supabase.auth.getSession();
  const ownerUserId = sessionData.session?.user?.id;

  if (ownerUserId) {
    const { data: deletedRows, error: deleteError } = await supabase
      .from('users')
      .delete()
      .eq('id', input.managerUserId)
      .eq('role', 'branch_manager')
      .eq('shop_id', input.shopId)
      .eq('created_by', ownerUserId)
      .select('id');
    if (deleteError) return false;
    if ((deletedRows?.length ?? 0) === 0) {
      const { error: demoteError } = await supabase
        .from('users')
        .update({
          role: 'customer',
          shop_id: null,
          branch_id: null,
          is_active: true,
          updated_at: timestamp,
        })
        .eq('id', input.managerUserId)
        .eq('role', 'branch_manager')
        .eq('shop_id', input.shopId);
      if (demoteError) return false;
    }
  } else {
    const { error: demoteError } = await supabase
      .from('users')
      .update({
        role: 'customer',
        shop_id: null,
        branch_id: null,
        is_active: true,
        updated_at: timestamp,
      })
      .eq('id', input.managerUserId)
      .eq('role', 'branch_manager')
      .eq('shop_id', input.shopId);
    if (demoteError) return false;
  }

  const { error: branchError } = await supabase
    .from('shop_branches')
    .update({ manager_user_id: null, updated_at: timestamp })
    .eq('id', targetBranchId)
    .eq('shop_id', input.shopId);
  if (branchError) return false;

  return true;
}

/** Returns branch manager if assigned, otherwise owner fallback for operational routing. */
export async function fetchBranchOperationalHandlerRemote(
  shopId: string,
  branchId: string,
): Promise<DbUser | null> {
  const manager = await fetchBranchManagerRemote(branchId, shopId);
  if (manager) return manager;

  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('shop_id', shopId)
    .eq('role', 'owner')
    .eq('is_active', true)
    .maybeSingle();
  if (error) return null;
  return (data as DbUser) ?? null;
}

export type BranchManagerActionResult =
  | { ok: true; mode: 'linked' | 'created' }
  | {
      ok: false;
      reason:
        | 'not_configured'
        | 'not_logged_in'
        | 'signup_failed'
        | 'assign_failed'
        | 'session_lost'
        | 'rate_limited';
      message?: string;
    };

async function restoreOwnerSession(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  ownerSession: Session,
): Promise<boolean> {
  const { error } = await supabase.auth.setSession({
    access_token: ownerSession.access_token,
    refresh_token: ownerSession.refresh_token,
  });
  if (error) return false;
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id === ownerSession.user.id;
}

function isAuthUserNotFound(message: string): boolean {
  return /auth user not found/i.test(message);
}

function isRateLimitError(message: string): boolean {
  return /rate limit|too many requests|email.*limit/i.test(message);
}

function isRpcMissing(message: string): boolean {
  return /function.*does not exist|could not find.*assign_branch_manager/i.test(message);
}

async function assignBranchManagerByEmail(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  input: { email: string; branchId: string; fullName: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await supabase.rpc('assign_branch_manager_by_email', {
    p_email: input.email.trim().toLowerCase(),
    p_branch_id: input.branchId,
    p_full_name: input.fullName.trim(),
  });
  if (error) return { ok: false, message: error.message };
  return { ok: true };
}

/** Promote an Auth user that already exists (no signUp — avoids email rate limits). */
export async function linkBranchManagerByEmail(input: {
  email: string;
  fullName: string;
  branchId: string;
}): Promise<BranchManagerActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not_configured' };

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session?.user?.id) {
    return { ok: false, reason: 'not_logged_in' };
  }

  const assign = await assignBranchManagerByEmail(supabase, input);
  if (assign.ok) return { ok: true, mode: 'linked' };

  if (isRpcMissing(assign.message)) {
    return {
      ok: false,
      reason: 'assign_failed',
      message: 'Run apply-pitstop-2.0-step3-branch-manager-rpc.sql on Supabase, then try again.',
    };
  }

  if (isAuthUserNotFound(assign.message)) {
    return {
      ok: false,
      reason: 'assign_failed',
      message: 'No login account with this email yet. Use “Create new login” with a password.',
    };
  }

  return { ok: false, reason: 'assign_failed', message: assign.message };
}

/** Create Auth login then assign, or link if email already exists. */
export async function createBranchManagerAccount(input: {
  email: string;
  password: string;
  fullName: string;
  branchId: string;
}): Promise<BranchManagerActionResult> {
  const supabase = getSupabase();
  if (!supabase) return { ok: false, reason: 'not_configured' };

  const { data: sessionData } = await supabase.auth.getSession();
  const ownerSession = sessionData.session;
  if (!ownerSession?.access_token || !ownerSession.refresh_token || !ownerSession.user?.id) {
    return { ok: false, reason: 'not_logged_in' };
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const ownerUserId = ownerSession.user.id;

  // 1) Existing Auth user — promote without signUp (no rate limit).
  const assignFirst = await assignBranchManagerByEmail(supabase, {
    email: normalizedEmail,
    branchId: input.branchId,
    fullName: input.fullName,
  });
  if (assignFirst.ok) return { ok: true, mode: 'linked' };

  if (!isAuthUserNotFound(assignFirst.message)) {
    if (isRpcMissing(assignFirst.message)) {
      return {
        ok: false,
        reason: 'assign_failed',
        message: 'Run apply-pitstop-2.0-step3-branch-manager-rpc.sql on Supabase, then try again.',
      };
    }
    return { ok: false, reason: 'assign_failed', message: assignFirst.message };
  }

  if (input.password.trim().length < 6) {
    return {
      ok: false,
      reason: 'signup_failed',
      message: 'Enter a password with at least 6 characters to create a new login.',
    };
  }

  setStaffInviteLock(true);
  try {
    const { error: signUpError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: input.password.trim(),
      options: {
        data: {
          name: input.fullName.trim(),
          full_name: input.fullName.trim(),
        },
      },
    });

    const sessionOk = await restoreOwnerSession(supabase, ownerSession);
    if (!sessionOk) {
      return {
        ok: false,
        reason: 'session_lost',
        message: 'Owner session was lost. Log in again as shop owner, then retry.',
      };
    }

    const duplicateSignup =
      !!signUpError &&
      /already registered|already exists|duplicate|user already/i.test(signUpError.message);

    if (signUpError && !duplicateSignup) {
      if (isRateLimitError(signUpError.message)) {
        return {
          ok: false,
          reason: 'rate_limited',
          message:
            'Supabase blocked new sign-ups (email rate limit). Wait 30–60 minutes, create the user in Supabase Auth → Users, then tap “Link existing email”.',
        };
      }
      return { ok: false, reason: 'signup_failed', message: signUpError.message };
    }

    const assign = await assignBranchManagerByEmail(supabase, {
      email: normalizedEmail,
      branchId: input.branchId,
      fullName: input.fullName,
    });

    if (!assign.ok) {
      return { ok: false, reason: 'assign_failed', message: assign.message };
    }

    const stillOwner = await restoreOwnerSession(supabase, ownerSession);
    if (!stillOwner) {
      const { data: check } = await supabase.auth.getSession();
      if (check.session?.user?.id !== ownerUserId) {
        return {
          ok: false,
          reason: 'session_lost',
          message: 'Manager was assigned, but your owner session ended. Log in again as owner.',
        };
      }
    }

    return { ok: true, mode: 'created' };
  } finally {
    setStaffInviteLock(false);
  }
}
