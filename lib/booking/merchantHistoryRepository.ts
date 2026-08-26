import { getSupabase } from '@/lib/supabase/client';

export type MerchantHistoryKind = 'booking' | 'store_order';

export async function hideMerchantHistoryItem(input: {
  id: string;
  type: MerchantHistoryKind;
  shopId: string;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.rpc('hide_history_item', {
    p_id: input.id,
    p_type: input.type,
    p_shop_id: input.shopId,
  });
  if (error) {
    console.warn('[merchantHistory] hide_history_item:', error.message);
    return false;
  }
  return true;
}

export async function clearAllShopHistory(input: {
  shopId: string;
  type: MerchantHistoryKind;
}): Promise<boolean> {
  const supabase = getSupabase();
  if (!supabase) return false;
  const { error } = await supabase.rpc('clear_all_shop_history', {
    p_shop_id: input.shopId,
    p_type: input.type,
  });
  if (error) {
    console.warn('[merchantHistory] clear_all_shop_history:', error.message);
    return false;
  }
  return true;
}
