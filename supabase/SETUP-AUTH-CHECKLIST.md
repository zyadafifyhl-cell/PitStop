# PitStop — Auth setup checklist (do in order)

Project: `https://qlopvpyeawauepsyrirz.supabase.co`

## Step 0 — Enable email login (REQUIRED)

If this is off, **every** login fails (customer, owner, admin).

1. Dashboard → **Authentication** → **Providers** → **Email**
2. Turn **ON**: Enable Email provider
3. For development, turn **OFF**: Confirm email (optional but easier)
4. **Save**

Quick test in SQL Editor is not enough — this must be done in the Dashboard UI.

---

## Step 1 — Run SQL migrations (once)

Run in SQL Editor, in order:

1. `apply-pitstop-2.0-on-existing-db.sql` (or steps 1–4 if split)
2. `apply-pitstop-2.0-step5-admin-approval.sql`
3. `apply-pitstop-2.0-step6-shop-premium.sql` (if not already applied)
4. **`apply-pitstop-2.0-steps-7-through-8-bundle.sql`** — walk-in POS, reviews, community feed
5. **`apply-pitstop-2.0-step9-admin-saas.sql`** — admin premium toggle, ledger, moderation
6. `seed.sql` + `seed-test-data.sql` (demo shops)

---

## Step 2 — Demo accounts

Create each user in **Authentication → Users → Add user** with password `demo123` and **Auto Confirm User** checked.

| Role | Email | Tab on /welcome | After login |
|------|-------|-----------------|-------------|
| Customer | `customer@demo.com` | Customer | Home `/` |
| Shop owner | `wash@demo.com` | Shop owner | `/shop` |
| Branch manager | `manager.wash@demo.com` | Shop owner | `/shop` |
| Platform admin | `admin@demo.com` | Shop owner | `/admin` |

Then run `seed-admin-user.sql` for admin role in `public.users`.

Owner/manager rows are linked by `seed-test-data.sql` if Auth users exist first.

---

## Step 3 — Your personal email (e.g. Gmail)

1. **Customer tab** → Create account (register) OR Add user in Dashboard
2. Must be **confirmed** (Auto Confirm in Dashboard, or open email link)
3. Use **Customer** tab — not Shop owner (unless you set owner role in DB)

---

## Step 4 — Verify from app

URL: `http://localhost:8082/welcome`

| Test | Expected |
|------|----------|
| Continue as guest | Works without Supabase login |
| customer@demo.com / demo123 | Customer tab → home |
| wash@demo.com / demo123 | Shop owner tab → shop dashboard |
| admin@demo.com / demo123 | Shop owner tab → admin panel |

---

## Common errors

| Message | Cause | Fix |
|---------|-------|-----|
| Email logins are disabled | Email provider off | Step 0 |
| Invalid login credentials | User missing or wrong password | Add user in Dashboard |
| Email not confirmed | Confirm email is ON | Auto Confirm user or open email link |
| Login failed (customer) after auth OK | Email is shop staff | Use Shop owner tab |
| No shop for this email | Auth OK but no shop row | Match `shops.owner_email` |
