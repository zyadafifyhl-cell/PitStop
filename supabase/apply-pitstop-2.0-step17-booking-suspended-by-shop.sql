-- PitStop 2.0 — Step 17: Transient booking status for branch closure / vacation
-- Run in Supabase SQL Editor after prior steps.

do $$ begin
  alter type public.booking_status add value if not exists 'suspended_by_shop';
exception
  when duplicate_object then null;
end $$;
