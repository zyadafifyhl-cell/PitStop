import { setStaffInviteLock } from '@/lib/auth/staffInviteLock';
import type { DbUser } from '@/lib/supabase/database.types';
import { getSupabase } from '@/lib/supabase/client';
import type { Session } from '@supabase/supabase-js';

export async function fetchBranchManagerRemote(branchId: string): Promise<DbUser | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('branch_id', branchId)
    .eq('role', 'branch_manager')
    .eq('is_active', true)
    .maybeSingle();
  if (error) {
    console.warn('Failed to load branch manager:', error.message);
    return null;
  }
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
