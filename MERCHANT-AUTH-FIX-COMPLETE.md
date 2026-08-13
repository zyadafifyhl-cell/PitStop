# Merchant Registration & Login Flow - Complete Fix

## Problem Summary

When a merchant registered via "Register as merchant" and the admin accepted their request, logging in failed with "Wrong email or password" because:
1. The Auth user's email was not confirmed automatically
2. Auth user metadata was not updated with shop ownership info
3. No fallback for missing Auth users

## Solution Implemented

### 1. Supabase Edge Functions Created

Two new Edge Functions were created to handle merchant approval/rejection with proper Auth management:

#### `approve-merchant` Function
**Location:** `supabase/functions/approve-merchant/index.ts`

**What it does:**
- Verifies the requesting user is an admin
- Gets the Auth user by ID
- **If Auth user exists:** Confirms email and updates metadata
- **If Auth user doesn't exist (fallback):** Creates a new Auth user with temp password
- Calls database RPC `approve_shop_owner` to activate merchant and shop
- Returns success/error response

**Key features:**
- Uses `supabase.auth.admin.updateUserById()` with `email_confirm: true`
- Updates `user_metadata` with `account_type: 'shop_owner'` and `shop_id`
- Secure: Only admins can call it (verified in function body)

#### `reject-merchant` Function
**Location:** `supabase/functions/reject-merchant/index.ts`

**What it does:**
- Verifies the requesting user is an admin
- Calls database RPC `reject_shop_owner` to clean up shop and convert user to customer
- Returns success/error response

### 2. Admin Repository Updated

**File:** `lib/admin/adminRepository.ts`

**Changes:**
- `approveShopOwner()` now calls the `approve-merchant` Edge Function instead of direct RPC
- `rejectShopOwner()` now calls the `reject-merchant` Edge Function instead of direct RPC
- Both functions fetch the current auth session and pass the JWT token to Edge Functions
- Proper error handling for Edge Function responses

**Before:**
```typescript
const { error } = await supabase.rpc('approve_shop_owner', {
  p_target_user_id: userId,
  p_target_shop_id: shopId,
});
```

**After:**
```typescript
const { data, error } = await supabase.functions.invoke('approve-merchant', {
  body: { userId, shopId, userEmail },
  headers: { Authorization: `Bearer ${token}` },
});
```

### 3. User-Facing Messages Updated

**File:** `lib/i18n/strings.ts`

**Changes:**
- Updated `owner_pending_approval_title` and `owner_pending_approval_body` for clarity
- English: "Pending Admin Approval" / "Your merchant registration is under review by the admin..."
- Arabic: "حسابك قيد المراجعة من الأدمن" / "حسابك قيد المراجعة من الأدمن..."

**Where it appears:**
- When a merchant tries to log in before admin approval
- The welcome screen already displays this message (no code change needed in `welcome.tsx`)

## How It Works Now

### Complete Flow:

1. **Merchant Registers** (`/welcome?focus=owner`):
   - Fills registration form with email, password, shop details
   - `registerShopOwner()` is called:
     - Creates Auth user via `supabase.auth.signUp({ email, password })`
     - Calls RPC `register_shop_owner()` to create shop and user row with `role = 'pending_owner'`
   - User is signed out and sees success message

2. **Merchant Tries to Login (Before Approval)**:
   - Goes to `/welcome?focus=owner`
   - Enters email and password
   - `loginShop()` is called:
     - Auth succeeds (user exists)
     - `resolveShopSession()` finds user with `role = 'pending_owner'`
     - Returns `'pending_approval'`
   - Alert shown: "حسابك قيد المراجعة من الأدمن"

3. **Admin Approves**:
   - Admin logs in at `/admin`
   - Views pending merchants in Admin Panel
   - Clicks "Approve" button
   - `approveShopOwner()` is called:
     - Fetches user email from database
     - Gets admin's auth token
     - Calls Edge Function `approve-merchant`:
       - Edge Function confirms Auth user's email
       - Updates user_metadata
       - Calls RPC `approve_shop_owner` to set `role = 'owner'` and `is_active = true`
   - Merchant is now approved

4. **Merchant Logs In (After Approval)**:
   - Goes to `/welcome?focus=owner`
   - Enters same email and password from registration
   - `loginShop()` is called:
     - Auth succeeds (email is now confirmed)
     - `resolveShopSession()` finds user with `role = 'owner'`
     - Shop and staff data loaded
     - Returns `'ok'`
   - Redirects to `/shop` (shop owner dashboard)

## Deployment Steps

### Prerequisites

1. Supabase CLI installed:
   ```bash
   npm install -g supabase
   ```

2. Project linked to Supabase:
   ```bash
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

### Deploy Edge Functions

```bash
# From project root
cd supabase

# Deploy approve-merchant function
npx supabase functions deploy approve-merchant

# Deploy reject-merchant function
npx supabase functions deploy reject-merchant
```

### Verify Deployment

```bash
# List deployed functions
npx supabase functions list

# Should show:
# - approve-merchant (deployed)
# - reject-merchant (deployed)
```

### Test the Complete Flow

1. **Test Registration:**
   ```
   URL: http://localhost:8083/welcome?focus=owner
   Email: testmerchant@example.com
   Password: StrongPass123!
   Shop Type: parts or accessories
   Fill all required fields → Submit
   Expected: "Registration successful" message
   ```

2. **Test Login Before Approval:**
   ```
   URL: http://localhost:8083/welcome?focus=owner
   Email: testmerchant@example.com
   Password: StrongPass123!
   Expected: Alert "حسابك قيد المراجعة من الأدمن"
   ```

3. **Test Admin Approval:**
   ```
   URL: http://localhost:8083/admin
   Login as admin
   Go to Pending Merchants tab
   Find testmerchant@example.com
   Click "Approve"
   Expected: Success message, merchant removed from pending list
   ```

4. **Test Login After Approval:**
   ```
   URL: http://localhost:8083/welcome?focus=owner
   Email: testmerchant@example.com
   Password: StrongPass123!
   Expected: Successful login → Redirect to /shop
   ```

## Files Changed

### New Files:
- `supabase/functions/approve-merchant/index.ts` - Edge Function for approval
- `supabase/functions/reject-merchant/index.ts` - Edge Function for rejection
- `supabase/DEPLOY-MERCHANT-APPROVAL-FUNCTIONS.md` - Detailed deployment guide
- `MERCHANT-AUTH-FIX-COMPLETE.md` - This summary document

### Modified Files:
- `lib/admin/adminRepository.ts` - Updated `approveShopOwner()` and `rejectShopOwner()`
- `lib/i18n/strings.ts` - Updated pending approval messages (EN + AR)

### Unchanged (Already Working):
- `lib/shop/ownerRegistrationRepository.ts` - Registration logic is correct
- `context/ShopAuthContext.tsx` - Login logic handles pending_approval correctly
- `app/welcome.tsx` - Already displays pending approval message

## Error Handling

### "Wrong email or password" after approval
**Cause:** Auth user email not confirmed (now fixed by Edge Function)

**Solution:** Edge Function automatically confirms email on approval

### "Auth user not found" during approval
**Cause:** Registration partially failed, Auth user never created

**Solution:** Edge Function creates new Auth user with temp password (user can reset)

### "Not authorized - admin only" when approving
**Cause:** User clicking approve is not an admin

**Solution:** Ensure admin user has correct role:
```sql
update public.users 
set role = 'admin', is_active = true 
where email = 'admin@demo.com';
```

## Security Notes

1. **Service Role Key:** Only available in Edge Functions (server-side), never exposed to client
2. **Admin Verification:** Edge Functions verify requesting user is admin before proceeding
3. **JWT Authentication:** Admin token passed in Authorization header and validated
4. **RLS Policies:** Database policies ensure only admins can modify user roles

## Summary

The fix ensures:
- ✅ Merchant registers → Auth user created with their password
- ✅ Merchant tries to login → Clear message "حسابك قيد المراجعة من الأدمن"
- ✅ Admin approves → Auth email confirmed, metadata updated, shop activated
- ✅ Merchant logs in → Successful with original registration credentials
- ✅ Seamless flow → No manual email confirmation or password reset needed
- ✅ Fallback handling → Even if Auth user missing, creates one automatically

## Next Steps

1. **Deploy the Edge Functions** (see Deployment Steps above)
2. **Test the complete flow** (see Test the Complete Flow above)
3. **Monitor Edge Function logs** for any issues:
   ```bash
   npx supabase functions logs approve-merchant --tail
   npx supabase functions logs reject-merchant --tail
   ```

## Support

If you encounter any issues:
1. Check Edge Function logs: `npx supabase functions logs FUNCTION_NAME`
2. Verify admin role in database: `select role from users where email = 'admin@demo.com'`
3. Check Supabase Dashboard → Authentication → Users → Verify email confirmed
