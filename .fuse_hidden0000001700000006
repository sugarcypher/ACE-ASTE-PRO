# Ace Paste Cleaner Pro — Monetization Setup Guide

**Owner:** ThinkWell Labs  
**Last updated:** 2026-05-06  
**Project ref:** `eqoltjofjlznlirbalrb`

One-time reference for wiring up shared subscriptions across acepaste.xyz and the browser extension. Most of this is already done — the checklist at the bottom shows exactly what remains.

---

## Architecture

```
User (web or extension)
      │
      ▼
acepaste.xyz/account.html  ←── auth.js ──→  Supabase Auth (email/password)
      │                                              │
      │  JWT (1h expiry, silent refresh)    subscriptions table
      │                                              │
      ├── Web app: sessionStorage + UI gates         │
      │                                              │
      └── Extension: externally_connectable    ◄─────┘
              background.js → chrome.storage.local
              (silent JWT refresh via refresh_token)
              popup.js reads chrome.storage.local

Stripe events → stripe-webhook edge function → updates subscriptions table
Browser CSP violations → csp-report edge function → csp_violations table
```

---

## Edge functions (all deployed)

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `stripe-webhook` | `/functions/v1/stripe-webhook` | Processes Stripe events; updates plan in `subscriptions` |
| `restore-purchase` | `/functions/v1/restore-purchase` | Lets users re-link a Stripe purchase to their account |
| `subscription-check` | `/functions/v1/subscription-check` | Returns current plan for a JWT-authenticated user |
| `create-portal-session` | `/functions/v1/create-portal-session` | Creates a Stripe billing portal session |
| `csp-report` | `/functions/v1/csp-report` | Receives browser CSP violation reports (no auth) |

All functions use pinned esm.sh imports (`@supabase/supabase-js@2.39.3`, `stripe@14.21.0`).

---

## Database tables

| Table | Purpose | Retention |
|-------|---------|-----------|
| `subscriptions` | One row per user; tracks plan + Stripe IDs | Permanent |
| `restore_attempts` | Logs restore-purchase attempts (email + timestamp) | 30 days (auto-purged) |
| `processed_webhook_events` | Idempotency guard — prevents Stripe duplicate events | 7 days (auto-purged) |
| `csp_violations` | CSP violation reports from browsers | 30 days (auto-purged) |

All tables have RLS enabled. `processed_webhook_events` and `csp_violations` are service_role-only.

Purge jobs run daily at 03:00 UTC via pg_cron (already scheduled).

---

## Plans

| Plan | Price | Billing | Stripe type |
|------|-------|---------|-------------|
| Free | $0 | — | — |
| 1-Day Trial | $1.23 | One-time | Payment |
| Monthly | $12.34/mo | Recurring | Subscription |
| Annual | $123.45/yr | Recurring | Subscription |
| Lifetime | $234.56 | One-time | Payment |

### Savings vs next tier down

| Plan | Compared to | Savings |
|------|-------------|---------|
| Monthly | 30 × $1.23 = $36.90 | **67%** |
| Annual | 12 × $12.34 = $148.08 | **17%** |
| Lifetime | 3 × $123.45 = $370.35 | **37%** (breakeven ~1.9 yrs vs annual) |

---

## Security controls in place

| Control | Where | Status |
|---------|-------|--------|
| Cloudflare Turnstile (invisible CAPTCHA) | account.html sign-in, sign-up, recovery | ✅ Live |
| JWT silent refresh (5 min before expiry) | auth.js + background.js | ✅ Live |
| Server-side JWT invalidation on sign-out | background.js → `/auth/v1/logout` | ✅ Live |
| Webhook idempotency (dedup table) | stripe-webhook + DB | ✅ Live |
| CSP violation reporting | all pages → csp-report function | ✅ Live |
| Strict CSP (hash-allowlisted scripts) | index.html + _headers | ✅ Live |
| esm.sh dependency pinning | all edge functions | ✅ Live |
| RLS on all tables | Supabase DB | ✅ Live |
| Incident response policy | INCIDENT-RESPONSE.md | ✅ Written |
| Automated purge jobs (pg_cron) | DB | ✅ Scheduled |
| Extension origin validation (sender.origin) | background.js | ✅ Live |
| ReDoS protection + output size cap | cleaner.js | ✅ Live |

---

## What's still needed (Stripe side)

All of the above is already deployed. The remaining steps are manual Stripe configuration.

### 1 — Create products

Stripe Dashboard → Products → Add product. Create four:

| Name | Price | Billing |
|------|-------|---------|
| Ace Paste — 1-Day Trial | $1.23 | One-time |
| Ace Paste — Monthly | $12.34/mo | Recurring monthly |
| Ace Paste — Annual | $123.45/yr | Recurring yearly |
| Ace Paste — Lifetime | $234.56 | One-time |

Copy the four **Price IDs** (`price_abc123...`).

### 2 — Wire Price IDs into the webhook function

In `supabase/functions/stripe-webhook/index.ts`, replace the four `price_REPLACE_*` constants:

```ts
const PRICE_TO_PLAN: Record<string, string> = {
  'price_REPLACE_TRIAL_PRICE_ID':    'trial',
  'price_REPLACE_MONTHLY_PRICE_ID':  'monthly',
  'price_REPLACE_YEARLY_PRICE_ID':   'yearly',
  'price_REPLACE_LIFETIME_PRICE_ID': 'lifetime',
};
```

Do the same in `supabase/functions/restore-purchase/index.ts`.

Redeploy both functions after editing:
```bash
supabase functions deploy stripe-webhook
supabase functions deploy restore-purchase
```

### 3 — Set edge function secrets

Supabase Dashboard → Edge Functions → Manage secrets:

```
STRIPE_SECRET_KEY     = sk_live_...
STRIPE_WEBHOOK_SECRET = whsec_...   (from step 4)
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 4 — Register Stripe webhook

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- **URL:** `https://eqoltjofjlznlirbalrb.supabase.co/functions/v1/stripe-webhook`
- **Events:**
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`

Copy the **Signing secret** (`whsec_...`) → add as `STRIPE_WEBHOOK_SECRET` in step 3.

### 5 — Create Payment Links

For each product → Create payment link:
- Enable **Collect customer email**
- Set **Success URL** to: `https://acepaste.xyz/account.html?payment=success`

Paste the four links into `pricing.html` (replace `REPLACE_TRIAL_LINK`, `REPLACE_MONTHLY_LINK`, `REPLACE_YEARLY_LINK`, `REPLACE_LIFETIME_LINK`).

### 6 — Activate Stripe Customer Portal

Stripe Dashboard → Billing → Customer portal → Activate:
- Enable: customers can update and cancel subscriptions

Copy the portal URL and paste into `account.html` (replace `REPLACE_STRIPE_PORTAL`).

### 7 — Test end-to-end

Use Stripe test mode with card `4242 4242 4242 4242`:

1. `acepaste.xyz/pricing.html` → pick a plan → complete checkout
2. Check `subscriptions` table updated (Supabase Dashboard → Table Editor)
3. `acepaste.xyz/account.html` → sign in → plan should reflect purchase
4. Open extension → sign in → premium features should unlock
5. Verify freemium limits still apply on free accounts (>2,000 chars, locked options)

Switch to live Stripe keys when confirmed working in test mode.

---

## Supabase rate limits (manual — dashboard only)

Supabase Dashboard → Authentication → Rate Limits:
- Defaults are reasonable; tighten email sign-up rate if you see bot traffic post-launch.

Supabase Dashboard → Authentication → Attack Protection:
- Turnstile already configured (Site Key + Secret Key set, provider: Turnstile). ✅

---

## Key references

| Item | Value |
|------|-------|
| Project ref | `eqoltjofjlznlirbalrb` |
| Project URL | `https://eqoltjofjlznlirbalrb.supabase.co` |
| Webhook endpoint | `https://eqoltjofjlznlirbalrb.supabase.co/functions/v1/stripe-webhook` |
| Turnstile site key | `0x4AAAAAADKDgrgt_iRwIndF` |
| Incident response policy | `INCIDENT-RESPONSE.md` |
| DB schema reference | `supabase/schema.sql` |
