-- PitStop 2.0 Step 21: Same-cart BOGO promotions (Buy X Get Y Free)
-- Adds buy_quantity / get_free_quantity and extends offer_type with 'bogo'.

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS buy_quantity integer,
  ADD COLUMN IF NOT EXISTS get_free_quantity integer;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_offer_type_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_offer_type_check
  CHECK (
    offer_type = ANY (
      ARRAY[
        'percentage'::text,
        'flat_amount'::text,
        'buy_x_get_y'::text,
        'bogo'::text
      ]
    )
  );

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_bogo_buy_quantity_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_bogo_buy_quantity_check
  CHECK (buy_quantity IS NULL OR buy_quantity >= 1);

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS offers_bogo_get_free_quantity_check;
ALTER TABLE public.offers
  ADD CONSTRAINT offers_bogo_get_free_quantity_check
  CHECK (get_free_quantity IS NULL OR get_free_quantity >= 1);

COMMENT ON COLUMN public.offers.buy_quantity IS
  'BOGO: paid units required per promo group (e.g. 1 for Buy 1 Get 1, 2 for Buy 2 Get 1).';
COMMENT ON COLUMN public.offers.get_free_quantity IS
  'BOGO: free units granted per complete promo group (e.g. 1 for Buy X Get 1 Free).';
