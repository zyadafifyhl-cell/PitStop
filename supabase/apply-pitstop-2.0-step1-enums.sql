-- =============================================================================
-- PitStop 2.0 — STEP 1 of 2 (run FIRST, alone, then click Run)
-- Supabase must COMMIT new enum values before step 2 can use them.
-- =============================================================================

do $$ begin
  alter type public.shop_type add value if not exists 'accessories';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.user_role add value if not exists 'branch_manager';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.booking_status add value if not exists 'in_progress';
exception when duplicate_object then null;
end $$;

do $$ begin
  alter type public.booking_status add value if not exists 'no_show';
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.store_category as enum ('parts', 'accessories');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shop_operating_status as enum ('open', 'closed', 'busy', 'vacation');
exception when duplicate_object then null;
end $$;

-- Success? Now run: apply-pitstop-2.0-step2-main.sql
