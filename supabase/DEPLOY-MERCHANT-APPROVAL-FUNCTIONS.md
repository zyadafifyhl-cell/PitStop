# Deploy Merchant Approval Edge Functions

This guide explains how to deploy the new Edge Functions that handle merchant approval with proper Auth user management.

## What These Functions Do

### `approve-merchant`
- Confirms the Auth user's email (sets `email_confirm: true`)
- Updates user metadata with shop ownership info
- Calls the database RPC `approve_shop_owner` to activate the merchant
- **Fallback**: If Auth user doesn't exist, creates one with a temporary password (user can reset it)

### `reject-merchant`
- Calls the database RPC `reject_shop_owner` to clean up the shop and convert user to customer
- Keeps the Auth user intact (converted to customer role)

## Prerequisites

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project (if not already linked):
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

## Deployment Steps

### 1. Deploy the Functions

```bash
# Deploy approve-merchant function
supabase functions deploy approve-merchant

# Deploy reject-merchant function
supabase functions deploy reject-merchant
```

### 2. Set Environment Secrets

The functions need access to environment variables. These are automatically available:
- `SUPABASE_URL` - Your project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (automatically injected)

No additional secrets needed!

### 3. Verify Deployment

```bash
# List deployed functions
supabase functions list

# Check logs for approve-merchant
supabase functions logs approve-merchant

# Check logs for reject-merchant
supabase functions logs reject-merchant
```

## Testing the Flow

### Test Merchant Registration & Approval

1. **Register as Merchant:**
   - Go to `localhost:8083/welcome?focus=owner`
   - Fill in the merchant registration form
   - Submit → You should see "Registration successful, pending admin approval"

2. **Admin Approves:**
   - Login as admin (`admin@demo.com`)
   - Go to Admin Panel → Pending Merchants
   - Click "Approve" on the merchant request
   - The Edge Function will:
     - Confirm the Auth user's email
     - Update metadata
     - Activate the shop in database

3. **Merchant Logs In:**
   - Go to `localhost:8083/welcome?focus=owner`
   - Enter the email and password used during registration
   - Should successfully log in and redirect to `/shop`

### Expected Behavior

**Before Approval (Merchant tries to login):**
- Message: "حسابك قيد المراجعة من الأدمن" (Your account is under admin review)
- No access to shop dashboard

**After Approval:**
- Merchant can log in with their registration credentials
- Full access to shop dashboard at `/shop`

## Troubleshooting

### Error: "Wrong email or password" after approval

**Cause:** Auth user doesn't exist or wasn't confirmed.

**Solution:** The Edge Function now handles this automatically:
- If Auth user exists: Confirms email and updates metadata
- If Auth user doesn't exist: Creates a new one with temp password

**User Action:** If they still can't login, use "Forgot Password" to reset.

### Error: "Failed to approve merchant"

**Check:**
1. Admin authentication (must be logged in as admin)
2. Edge Function logs: `supabase functions logs approve-merchant`
3. Database RLS policies (admin should have access to users and shops tables)

### Error: "Not authorized - admin only"

**Cause:** The requesting user is not an admin.

**Solution:** Ensure the admin user has `role = 'admin'` in the `users` table:
```sql
update public.users 
set role = 'admin', is_active = true 
where email = 'admin@demo.com';
```

## Development & Local Testing

### Run Functions Locally

```bash
# Start local Supabase
supabase start

# Serve the function locally
supabase functions serve approve-merchant --no-verify-jwt

# Test with curl
curl -X POST http://localhost:54321/functions/v1/approve-merchant \
  -H "Authorization: Bearer YOUR_ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"userId":"user-uuid","shopId":"shop-id","userEmail":"merchant@example.com"}'
```

## Integration with Frontend

The `adminRepository.ts` has been updated to call these Edge Functions instead of direct RPC:

```typescript
// lib/admin/adminRepository.ts
export async function approveShopOwner(userId: string, shopId: string): Promise<void> {
  const supabase = getSupabase();
  // ... gets user email and auth token
  
  const { data, error } = await supabase.functions.invoke('approve-merchant', {
    body: { userId, shopId, userEmail },
    headers: { Authorization: `Bearer ${token}` },
  });
  
  if (error || !data?.success) throw new Error(...);
}
```

## Security Notes

1. **Service Role Key:** Only available server-side in Edge Functions, never exposed to client
2. **Admin Auth Check:** Functions verify the requesting user is an admin before proceeding
3. **RLS Policies:** Database RLS ensures only admins can update user roles and shop status

## Summary

This implementation ensures:
- ✅ Merchant registers → Auth user created with password
- ✅ Admin approves → Auth email confirmed, shop activated
- ✅ Merchant logs in → Successful authentication with registration credentials
- ✅ Clear messaging → "Pending approval" before approval, seamless access after
