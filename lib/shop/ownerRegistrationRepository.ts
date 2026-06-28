import type { ShopType } from '@/lib/booking/types';
import { getSupabase } from '@/lib/supabase/client';

export type RegisterShopOwnerInput = {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  shopName: string;
  shopNameAr?: string;
  shopType: ShopType;
  areaId: string;
  address: string;
  addressAr?: string;
};

export type RegisterShopOwnerResult =
  | 'ok'
  | 'email_taken'
  | 'weak_password'
  | 'invalid'
  | 'not_configured';

export async function registerShopOwner(input: RegisterShopOwnerInput): Promise<RegisterShopOwnerResult> {
  const supabase = getSupabase();
  if (!supabase) return 'not_configured';

  const email = input.email.trim().toLowerCase();
  const password = input.password.trim();

  if (!email || password.length < 8) return 'invalid';

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: input.fullName.trim(),
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
        account_type: 'shop_owner',
      },
    },
  });

  if (signUpError) {
    const message = signUpError.message.toLowerCase();
    if (message.includes('already') || message.includes('registered')) return 'email_taken';
    if (message.includes('password')) return 'weak_password';
    return 'invalid';
  }

  if (!signUpData.user) return 'invalid';

  const { error: rpcError } = await supabase.rpc('register_shop_owner', {
    p_shop_name: input.shopName.trim(),
    p_shop_name_ar: (input.shopNameAr ?? input.shopName).trim(),
    p_shop_type: input.shopType,
    p_area_id: input.areaId,
    p_address: input.address.trim(),
    p_address_ar: (input.addressAr ?? input.address).trim(),
    p_phone: input.phone.trim(),
  });

  if (rpcError) {
    await supabase.auth.signOut();
    return 'invalid';
  }

  return 'ok';
}
