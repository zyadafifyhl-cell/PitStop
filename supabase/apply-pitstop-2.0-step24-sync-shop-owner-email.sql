-- PitStop 2.0 — Step 24: Sync shops.owner_email from public.users owner rows
-- Run in Supabase SQL editor or via migration tooling.
--
-- Ensures shop owner login (shops.owner_email lookup) matches the canonical
-- owner identity stored on public.users for each shop.

BEGIN;

UPDATE public.shops AS s
SET owner_email = u.email
FROM public.users AS u
WHERE s.id = u.shop_id
  AND u.role = 'owner';

-- Optional: keep owner_user_id aligned when missing
UPDATE public.shops AS s
SET owner_user_id = u.id
FROM public.users AS u
WHERE s.id = u.shop_id
  AND u.role = 'owner'
  AND s.owner_user_id IS DISTINCT FROM u.id;

COMMIT;

-- Verification (expect 0 mismatches after sync)
-- SELECT s.id, s.owner_email, u.email
-- FROM public.shops s
-- JOIN public.users u ON u.shop_id = s.id AND u.role = 'owner'
-- WHERE lower(s.owner_email) <> lower(u.email);
