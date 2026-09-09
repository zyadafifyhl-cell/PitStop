import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApproveRequest {
  userId: string;
  shopId: string;
  userEmail: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing Supabase environment variables');
    }

    // Create admin client with service_role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Verify the request is from an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if requesting user is admin
    const { data: requestingUserData } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', requestingUser.id)
      .single();

    if (requestingUserData?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Not authorized - admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body: ApproveRequest = await req.json();
    const { userId, shopId, userEmail } = body;

    if (!userId || !shopId || !userEmail) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Get or create the Auth user
    let { data: authUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(userId);

    // If Auth user doesn't exist, create it (fallback for failed registrations)
    if (getUserError || !authUser.user) {
      console.log('Auth user not found, creating new Auth user for:', userEmail);

      // Generate a temporary password (user will need to reset it)
      const tempPassword = `TempPwd${Math.random().toString(36).slice(2, 10)}!`;

      const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: userEmail,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          account_type: 'shop_owner',
          role: 'owner',
          shop_id: shopId,
        },
      });

      if (createError || !newAuthUser.user) {
        return new Response(
          JSON.stringify({
            error: 'Failed to create Auth user',
            details: createError?.message,
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      authUser = newAuthUser;
      console.log('Auth user created successfully');
    }

    // 2. Update Auth user: confirm email and update metadata
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email_confirm: true,
      user_metadata: {
        ...authUser.user.user_metadata,
        account_type: 'shop_owner',
        role: 'owner',
        shop_id: shopId,
        approved_at: new Date().toISOString(),
      },
      app_metadata: {
        ...authUser.user.app_metadata,
        provider: 'email',
        providers: ['email'],
      },
    });

    if (updateError) {
      console.error('Failed to update Auth user:', updateError);
      return new Response(
        JSON.stringify({
          error: 'Failed to confirm user email',
          details: updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Call the database RPC to update user and shop records
    const { error: rpcError } = await supabaseAdmin.rpc('approve_shop_owner', {
      p_target_user_id: userId,
      p_target_shop_id: shopId,
    });

    if (rpcError) {
      console.error('RPC approve_shop_owner failed:', rpcError);
      return new Response(
        JSON.stringify({
          error: 'Failed to approve merchant in database',
          details: rpcError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: shopRow, error: shopReadError } = await supabaseAdmin
      .from('shops')
      .select('id, is_active, owner_email, owner_user_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopReadError || !shopRow?.is_active || shopRow.owner_user_id !== userId) {
      console.error('Approved shop is not queryable:', shopReadError, shopRow);
      return new Response(
        JSON.stringify({
          error: 'Shop row was not activated',
          details: shopReadError?.message ?? 'shops.is_active is still false',
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Merchant approved successfully',
        userId,
        shopId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
