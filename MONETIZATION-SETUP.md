# Ace Paste Cleaner Pro — Monetization Setup Guide

One-time setup to wire up shared subscriptions across acepaste.xyz and the browser extension.

---

## Architecture overview

```
User (web or extension)
      │
      ▼
acepaste.xyz/account.html  ←──  auth.js  ──→  Supabase Auth
      │                                              │
      │  (JWT)                            subscriptions table
      │                                              │
      ├─── Web app: sessionStorage + UI gates        │
      │                                              │
      └─── Extension: externally_connectable    ◄────┘
              background.js → chrome.storage.local
              popup.js reads chrome.storage.local
```

Stripe events → `/functions/v1/stripe-webhook` → updates `subscriptions` table

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) → New Project
2. Note your **Project URL** and **Anon (public) key** (Settings → API)
3. In the SQL editor, paste and run the contents of `supabase/schema.sql`
4. Confirm the `subscriptions` table appears in Table Editor

---

## Step 2 — Configure auth.js

In `auth.js`, replace the two constants at the top:

```js
const ACEPASTE_SUPABASE_URL  = 'https://YOUR_PROJECT_REF.supabase.co';
const ACEPASTE_SUPABASE_ANON = 'YOUR_SUPABASE_ANON_KEY';
```

Supabase Auth is email/password by default. To enable it:
Dashboard → Authentication → Providers → Email → Enable (turn off email confirmation for a smoother initial UX, or leave it on for production).

---

## Step 3 — Create Stripe products

Go to [dashboard.stripe.com](https://dashboard.stripe.com) → Products → Add product.

Create **four products** with these exact prices (or match what you set):

| Product name           | Price      | Billing         | Type        |
|------------------------|------------|-----------------|-------------|
| Ace Paste — 1-Day Trial | $1.23     | One-time        | One-time    |
| Ace Paste — Monthly    | $12.34/mo  | Recurring monthly | Subscription |
| Ace Paste — Annual     | $123.45/yr | Recurring yearly | Subscription |
| Ace Paste — Lifetime   | $234.56    | One-time        | One-time    |

For each product, copy the **Price ID** (starts with `price_`).

### Create Payment Links

For each product, click "Create payment link" and copy the URL. Paste into `pricing.html`:

```html
<!-- Replace the REPLACE_* placeholders in pricing.html -->
<a href="https://buy.stripe.com/REPLACE_TRIAL_LINK" ...>
<a href="https://buy.stripe.com/REPLACE_MONTHLY_LINK" ...>
<a href="https://buy.stripe.com/REPLACE_YEARLY_LINK" ...>
<a href="https://buy.stripe.com/REPLACE_LIFETIME_LINK" ...>
```

**Important:** In each Payment Link, enable "Collect customer email" and set the **success URL** to:
```
https://acepaste.xyz/account.html?payment=success
```

---

## Step 4 — Deploy edge functions

Install the Supabase CLI: `npm install -g supabase`

```bash
cd ACE-ASTE-PRO
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy both functions
supabase functions deploy subscription-check
supabase functions deploy stripe-webhook
```

### Set edge function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_live_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  SUPABASE_SERVICE_ROLE_KEY=... \
  SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
```

The `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are also available automatically inside edge functions, but setting them explicitly ensures consistency.

---

## Step 5 — Register Stripe webhook

1. Stripe Dashboard → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET` (see above)

---

## Step 6 — Map Price IDs in the webhook function

In `supabase/functions/stripe-webhook/index.ts`, replace the placeholder price IDs:

```ts
const PRICE_TO_PLAN: Record<string, string> = {
  'price_REPLACE_TRIAL_PRICE_ID':    'trial',
  'price_REPLACE_MONTHLY_PRICE_ID':  'monthly',
  'price_REPLACE_YEARLY_PRICE_ID':   'yearly',
  'price_REPLACE_LIFETIME_PRICE_ID': 'lifetime',
};
```

Redeploy after changing:
```bash
supabase functions deploy stripe-webhook
```

---

## Step 7 — Update extension manifest

In `AcePasteBrowserExtension/manifest.json`, `externally_connectable` already allows `https://acepaste.xyz/*`. No further changes needed — the extension never calls Supabase directly. Auth flows through the acepaste.xyz page.

---

## Step 8 — Add auth.js to index.html

In `index.html`, add this line in the `<head>` before `app-critical.js`:

```html
<script defer src="/auth.js"></script>
```

Then add the upgrade nudge and account status elements to the page. In the `.wrap` section, add:

```html
<div id="aceUpgradeNudge" style="display:none">
  🔒 Some features require a paid plan.
  <a href="/pricing.html">Upgrade →</a>
</div>
<span id="aceAccountStatus" style="display:none"></span>
```

And add an Account link to the header nav. You'll also need to add the `.ace-premium-locked` style to `styles.css`:

```css
.ace-premium-locked {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
  position: relative;
}
.ace-premium-locked::after {
  content: " 🔒";
  font-size: 0.8em;
}
```

---

## Step 9 — Stripe Customer Portal (for billing management)

1. Stripe Dashboard → Billing → Customer portal → Activate
2. Enable: "Customers can update subscriptions", "Customers can cancel subscriptions"
3. Copy the portal link and replace in `account.html`:
   ```html
   <a href="https://billing.stripe.com/p/login/REPLACE_STRIPE_PORTAL" ...>
   ```

---

## Step 10 — Test the full flow

### Test payment (use Stripe test mode first)
1. Enable test mode in Stripe Dashboard
2. Replace Stripe keys with test keys (`sk_test_...`, `pk_test_...`)
3. Visit `acepaste.xyz/pricing.html` → click a plan → use test card `4242 4242 4242 4242`
4. Check that the webhook fires and `subscriptions` table updates
5. Visit `acepaste.xyz/account.html` → sign in → verify plan shows correctly
6. Open extension → click "Sign in for Pro" → signs in on web → extension reflects Pro status

### Verify freemium limits
- **Free web:** paste >2,000 chars → should truncate + show notice
- **Free web:** AI markup / emoji checkboxes should be locked (🔒) and disabled
- **Free extension:** quarantine checkboxes disabled, scanner buttons disabled
- **Paid:** all features available, no char limit

---

## Pricing summary

Each tier's savings are calculated against the tier below it (progressive comparison).

| Plan     | Price    | Compared to              | Savings |
|----------|----------|--------------------------|---------|
| 1-day    | $1.23/day | — (baseline)            | —       |
| Monthly  | $12.34   | 30 × $1.23 = $36.90     | **67%** |
| Annual   | $123.45  | 12 × $12.34 = $148.08   | **17%** |
| Lifetime | $234.56  | 3 × $123.45 = $370.35   | **37%** (breakeven vs annual ~1.9 yrs) |

---

## Checklist

### ✅ Done automatically
- [x] Supabase project created (`eqoltjofjlznlirbalrb` — ThinkWell Labs org, us-east-1)
- [x] Schema migrated (subscriptions, restore_attempts, lifetime_grant_emails, triggers, RLS, RPCs)
- [x] Lifetime grants seeded (nuumoxx@icloud.com, 13531nxt@gmail.com, b@twl.today)
- [x] `auth.js` constants set (URL + anon key — live values, not placeholders)
- [x] CSP `connect-src` updated in `index.html` and `_headers`
- [x] `subscription-check` edge function deployed (ACTIVE)
- [x] `stripe-webhook` edge function deployed (ACTIVE, JWT verification OFF — correct for webhooks)
- [x] `restore-purchase` edge function deployed (ACTIVE)
- [x] auth.js + freemium gates added to index.html, app-critical.js
- [x] Extension manifest, popup, background wired for auth bridge
- [x] Premium-lock CSS in styles.css

### ⚠️ Still needed — Stripe side (manual, ~15 min)

**1. Create products in Stripe Dashboard → Products → Add product**

| Product name           | Price      | Billing           |
|------------------------|------------|-------------------|
| Ace Paste — 1-Day Trial | $1.23     | One-time          |
| Ace Paste — Monthly    | $12.34/mo  | Recurring monthly |
| Ace Paste — Annual     | $123.45/yr | Recurring yearly  |
| Ace Paste — Lifetime   | $234.56    | One-time          |

**2. Copy the four Price IDs** (format: `price_abc123...`) and redeploy the webhook:
- Open `supabase/functions/stripe-webhook/index.ts` and `supabase/functions/restore-purchase/index.ts`
- Replace the four `price_REPLACE_*` values with real IDs
- Redeploy via: Supabase Dashboard → Edge Functions → stripe-webhook → Deploy new version

**3. Set edge function secrets** — Supabase Dashboard → Edge Functions → Manage secrets:
```
STRIPE_SECRET_KEY     = sk_live_...
STRIPE_WEBHOOK_SECRET = whsec_...  (get this from step 4)
```

**4. Register Stripe webhook** — Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://eqoltjofjlznlirbalrb.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`
- Copy the signing secret → add as `STRIPE_WEBHOOK_SECRET` in step 3

**5. Create Payment Links** for each product → enable "Collect customer email" → success URL:
```
https://acepaste.xyz/account.html?payment=success
```
Paste the four links into `pricing.html` (replace `REPLACE_TRIAL_LINK`, `REPLACE_MONTHLY_LINK`, etc.)

**6. Stripe Customer Portal** — Stripe Dashboard → Billing → Customer portal → Activate:
- Paste the portal URL into `account.html` (replace `REPLACE_STRIPE_PORTAL`)

**7. Test in Stripe test mode** with card `4242 4242 4242 4242`, then switch to live keys.

---

## Supabase project reference

| Key | Value |
|-----|-------|
| Project ref | `eqoltjofjlznlirbalrb` |
| Project URL | `https://eqoltjofjlznlirbalrb.supabase.co` |
| Webhook endpoint | `https://eqoltjofjlznlirbalrb.supabase.co/functions/v1/stripe-webhook` |
