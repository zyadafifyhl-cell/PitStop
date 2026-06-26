# PitStop 2.0 — Database Schema

## Overview

```
auth.users          ← Supabase Auth (email + password)
    │
    └── public.users    ← role, shop_id, branch_id (app identity)

public.shops          ← brand / business (one owner)
    │
    ├── public.shop_branches       ← physical branches
    │       ├── public.branch_services
    │       └── public.branch_employees   (no login)
    │
    ├── public.bookings
    ├── public.store
    └── public.parts_orders
```

## Roles (`public.user_role`)

| Role | Login | `shop_id` | `branch_id` | Purpose |
|------|-------|-----------|-------------|---------|
| `customer` | ✅ | null | null | Books services |
| `owner` | ✅ | required | null | Owns shop, creates branches & managers |
| `branch_manager` | ✅ | required | required | Runs one branch day-to-day |
| `admin` | ✅ | optional | optional | Platform admin (future) |

**Employees** are **not** in `users` — they live in `branch_employees` only.

## Core tables

### `public.users`
Single app identity table (replaces legacy `profiles`).

| Column | Notes |
|--------|-------|
| `id` | FK → `auth.users` |
| `email` | lowercase |
| `full_name`, `phone` | display / contact |
| `role` | see above |
| `shop_id` | owner + branch_manager |
| `branch_id` | branch_manager only |
| `created_by` | owner who invited a branch manager |
| `is_active` | soft disable login |

Auto-created on signup via trigger `on_auth_user_created`.

### `public.shops`
Brand-level record (catalog). Legacy `owner_email` kept for backward compatibility until app fully uses `users`.

### `public.shop_branches`
Each physical location. One default branch (`slug = 'main'`) is seeded per shop.

Stores branch profile, `weekly_hours` (jsonb), `shop_status`, gallery URLs, etc.

### `public.branch_employees`
Roster only — **no auth account**.

| Column | Notes |
|--------|-------|
| `full_name` | required |
| `phone`, `job_title`, `notes` | optional |
| `branch_id` | required |

### `public.branch_services`
Per-branch service menu (replaces local-only wash services over time).

### `public.bookings`
Extended with `branch_id`, `service_id`, `service_name`, notes, and statuses:
`pending`, `confirmed`, `in_progress`, `done`, `cancelled`, `no_show`.

## RLS helpers

| Function | Meaning |
|----------|---------|
| `is_shop_owner(shop_id)` | Current user is owner (users row or legacy owner_email) |
| `is_branch_manager(branch_id)` | Current user manages this branch |
| `can_manage_shop(shop_id)` | Owner or any branch manager of that shop |
| `can_manage_branch(branch_id)` | Owner of parent shop or assigned branch manager |

## Setup order

### Fresh Supabase project
1. `supabase/schema.sql`
2. `supabase/seed.sql`
3. `supabase/seed-branches.sql` (optional demo employees + 2nd branch)

### Existing project (already ran old schema)
1. `supabase/migrate-roles-branches.sql`
2. Re-run RLS section from `schema.sql` (helpers + policies)
3. `supabase/seed-branches.sql` (optional)

### Auth users (Dashboard → Authentication)
Create demo owners with password `demo123`:
- `wash@demo.com`, `maintenance@demo.com`, etc.

Link owner to shop:
```sql
update public.users
set role = 'owner', shop_id = 'shop-wash-nile'
where email = 'wash@demo.com';
```

Create branch manager:
```sql
-- after Auth user manager.wash@demo.com exists
update public.users
set role = 'branch_manager',
    shop_id = 'shop-wash-nile',
    branch_id = (select id from shop_branches where shop_id = 'shop-wash-nile' and slug = 'main')
where email = 'manager.wash@demo.com';
```

## App migration (next steps — not in SQL)

1. `ShopAuthContext` → read `public.users.role` instead of only `owner_email`
2. Route `owner` vs `branch_manager` to different dashboards
3. Sync `washBranchStorage` → `shop_branches` table
4. Owner UI: create branch manager accounts (Supabase Admin API or Edge Function)

---

*Last updated: PitStop 2.0 roles + branches schema.*
