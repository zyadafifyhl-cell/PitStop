-- PitStop 2.0 — step 4: restore customer booking policies (if step2 removed them)
-- Run in Supabase SQL Editor if bookings/login work but inserts fail silently.

drop policy if exists "Anyone can create bookings" on public.bookings;
drop policy if exists "Customers and shop staff can create bookings" on public.bookings;
create policy "Customers and shop staff can create bookings" on public.bookings
  for insert with check (
    public.can_manage_shop(shop_id)
    or (
      auth.uid() is not null
      and customer_id = auth.uid()
      and status = 'pending'::public.booking_status
      and booking_type::text = 'app'
    )
  );

drop policy if exists "Customers can read own bookings" on public.bookings;
create policy "Customers can read own bookings" on public.bookings
  for select using (customer_id = auth.uid());

drop policy if exists "Customers can cancel own bookings" on public.bookings;
create policy "Customers can cancel own bookings" on public.bookings
  for update using (customer_id = auth.uid())
  with check (status = 'cancelled'::public.booking_status);

drop policy if exists "Customers can delete own bookings" on public.bookings;
create policy "Customers can delete own bookings" on public.bookings
  for delete using (customer_id = auth.uid());
