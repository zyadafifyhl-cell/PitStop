# Admin Merchant Approval Fix - Complete Solution

## Problem
Admin "Accept" button was failing with error: "Action failed: Something went wrong. Please try again later."

## Root Cause
The code was attempting to call Supabase Edge Functions (`approve-merchant`, `reject-merchant`) which:
1. May not be deployed yet
2. Require additional setup and authentication
3. Network issues or CORS problems

## Solution Implemented

### 1. **Robust Fallback Mechanism**

Updated `lib/admin/adminRepository.ts` with intelligent fallback logic:

**Flow:**
1. **First attempt**: Try Edge Function (if deployed)
   - Provides Auth user email confirmation
   - Updates user metadata
   - Better for production use

2. **Automatic fallback**: If Edge Function fails, use direct RPC
   - Calls `approve_shop_owner` or `reject_shop_owner` RPC
   - Works immediately without Edge Function deployment
   - Database-only operation (no Auth email confirmation)

**Code Pattern:**
```typescript
// Try Edge Function first
try {
  const { data, error } = await supabase.functions.invoke('approve-merchant', {...});
  if (!error && data?.success) {
    console.log('Edge Function succeeded');
    return;
  }
  console.warn('Edge Function failed, falling back to RPC');
} catch (edgeError) {
  console.warn('Edge Function unavailable');
}

// FALLBACK: Direct RPC
const { error: rpcError } = await supabase.rpc('approve_shop_owner', {...});
if (rpcError) throw new Error(`Approval failed: ${rpcError.message}`);
```

### 2. **Enhanced Error Logging**

**In `adminRepository.ts`:**
- Logs Edge Function failures with full error details
- Logs RPC errors with code, message, details, and hint
- Distinguishes between Edge Function and RPC errors

**In `AdminPanel.tsx`:**
- Logs complete error context including userId, shopId, shopName
- Console logs visible in browser DevTools for debugging
- User-friendly error messages displayed in alerts

### 3. **Database RPC Functions**

The fallback uses existing SQL functions from `apply-pitstop-2.0-step5-admin-approval.sql`:

**`approve_shop_owner(p_target_user_id, p_target_shop_id)`:**
- Verifies requesting user is admin via `is_platform_admin()`
- Checks pending owner request exists
- Updates `users`: sets `role = 'owner'`, `is_active = true`
- Updates `shops`: sets `is_active = true`, links `owner_user_id`

**`reject_shop_owner(p_target_user_id, p_target_shop_id)`:**
- Verifies admin authorization
- Deletes shop branches
- Deletes shop
- Reverts user to customer role

## How to Use

### Immediate Fix (No Edge Functions Required)

1. **Open browser DevTools Console** (F12)
2. **Go to Admin Panel**: `localhost:8083/admin`
3. **Click "Pending requests" tab**
4. **Click "Accept" on any merchant**
5. **Watch console logs**:
   ```
   [approveShopOwner] Edge Function failed or unavailable: {...}
   [approveShopOwner] Falling back to direct RPC approve_shop_owner
   [approveShopOwner] RPC fallback succeeded
   ```
6. **Merchant approved** ✓ - Removed from pending list, shop activated

### Console Logs Explained

**Success (Edge Function):**
```
[approveShopOwner] Edge Function succeeded
```

**Success (RPC Fallback):**
```
[approveShopOwner] Edge Function failed or unavailable: {...}
[approveShopOwner] Falling back to direct RPC approve_shop_owner
[approveShopOwner] RPC fallback succeeded
```

**Failure:**
```
[approveShopOwner] Edge Function failed or unavailable: {...}
[approveShopOwner] Falling back to direct RPC approve_shop_owner
[approveShopOwner] RPC fallback error: {code, message, details, hint}
[AdminPanel] Merchant approval error details: {...}
```

## Deployment Options

### Option A: Use RPC Fallback Only (Immediate)
✅ **Works now** - No additional deployment needed
- Edge Functions will be skipped automatically
- Direct RPC will handle all approvals
- ⚠️ Auth user email confirmation not automatic (merchants may need to use "Forgot Password" on first login)

### Option B: Deploy Edge Functions (Recommended for Production)
1. Deploy Edge Functions:
   ```bash
   npx supabase functions deploy approve-merchant
   npx supabase functions deploy reject-merchant
   ```

2. Edge Functions will be used automatically
3. RPC fallback still available if Edge Functions fail

## Verification Steps

1. **Check Supabase SQL Functions:**
   ```sql
   -- Verify functions exist
   SELECT routine_name FROM information_schema.routines 
   WHERE routine_schema = 'public' 
   AND routine_name IN ('approve_shop_owner', 'reject_shop_owner', 'is_platform_admin');
   ```

2. **Verify Admin User:**
   ```sql
   -- Ensure your admin account has correct role
   SELECT id, email, role, is_active FROM users WHERE email = 'admin@demo.com';
   -- Should show: role = 'admin', is_active = true
   ```

3. **Test Approval Flow:**
   - Register a test merchant (spare parts or accessories)
   - Login as admin
   - View pending requests
   - Click Accept
   - Check browser console for logs
   - Verify merchant removed from pending list
   - Verify merchant can now login

## Troubleshooting

### Error: "Not authorized"
**Cause:** Admin user role is not set correctly

**Fix:**
```sql
UPDATE users SET role = 'admin', is_active = true WHERE email = 'admin@demo.com';
```

### Error: "Pending owner request not found"
**Cause:** User role is not `pending_owner` or shop_id mismatch

**Fix:** Check user record:
```sql
SELECT id, email, role, shop_id FROM users WHERE email = 'merchant@example.com';
-- Should show: role = 'pending_owner', shop_id matching the shop
```

### Error: "function approve_shop_owner does not exist"
**Cause:** SQL migration not applied

**Fix:** Run migration:
```sql
-- Execute contents of: supabase/apply-pitstop-2.0-step5-admin-approval.sql
```

## Summary

✅ **Immediate solution**: RPC fallback works without Edge Functions
✅ **Detailed logging**: Console shows exact error details
✅ **User-friendly errors**: Clear messages for users
✅ **Graceful degradation**: Tries Edge Function first, falls back to RPC
✅ **Production-ready**: Can deploy Edge Functions later for Auth email confirmation

The approval flow now works reliably with automatic fallback to database RPC if Edge Functions are unavailable.
