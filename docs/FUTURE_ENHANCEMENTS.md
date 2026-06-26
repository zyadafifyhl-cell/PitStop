# Future Enhancements — Architecture Notes

This document captures planned features from the product spec. These are **not implemented** in the current prototype; notes here guide future design only.

## Payments

- **Gateway**: Integrate Paymob or Fawry for Egypt-local card/wallet payments at booking checkout and parts orders.
- **Flow**: Customer selects slot → summary screen (`book_summary_title`) → payment intent → webhook confirms booking status server-side.
- **Data model**: Add `payments` table in Supabase linked to `bookings` and `parts_orders` with `amount_egp`, `status`, `provider_ref`.
- **Shop payouts**: Net settlement after platform fee (already modeled in shop reporting) should reconcile against payment records.

## Loyalty & Rewards

- **Points ledger**: Earn points on completed bookings; redeem for discounts at participating shops.
- **Storage**: Customer-scoped ledger in Supabase; local cache for offline display.
- **UI hooks**: Home offers carousel and shop profile can surface loyalty-eligible deals.

## In-app Payments for Deposits

- Optional deposit at booking time to reduce no-shows.
- Cancellation policy (`book_cancellation_policy`) should be enforced in booking state machine before charge/refund rules apply.

## Advanced Shop Discovery

- **Filters** (strings already reserved): top rated, price, distance, open now, favorites.
- **Nearby GPS**: `location_use_gps` / `nearby/[type]` pattern extends to all service types with geohash or PostGIS in Supabase.
- **Search**: `nearby_search_placeholder` and area search on service location picker.

## Shop Profile Enhancements

- Gallery, share sheet, structured services list, working hours from `shopSchedule`, and reviews from `reviewsStorage`.
- Slot availability labels: available / almost full / booked based on capacity vs. `shopSchedule`.

## Driver Network (Community)

- Current prototype: local AsyncStorage posts with likes (`driverNetworkStorage`).
- **Future**: Supabase `driver_posts` + moderation, image upload to storage bucket, threaded comments sync across devices.

## Vehicle Management

- Current: multi-vehicle list per customer via `vehicleStorage` (local).
- **Future**: Sync vehicles to Supabase profile; pre-fill booking form from selected vehicle.

## Notifications & Reminders

- Push for booking reminders (partially implemented), loyalty milestones, and driver network replies.
- Extend `bookingReminders` for configurable lead times.

## Multi-region Expansion

- Separate catalog seeds per country (EG → SA/AE) with locale-specific areas and compliance copy.

## AI Assistant

- Keep OpenAI path; optional vision for damage photos.
- RAG over Egypt maintenance catalog and shop FAQs.

## Analytics & Admin

- Shop owner dashboard metrics beyond PDF reports: conversion, repeat customers, offer performance.
- Platform admin role for shop verification and content moderation.

---

*Last updated: architecture notes aligned with incremental UI/i18n work in the booking prototype.*
