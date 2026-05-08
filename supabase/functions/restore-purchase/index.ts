/**
 * restore-purchase — Supabase Edge Function v6
 *
 * POST /functions/v1/restore-purchase
 * Authorization: Bearer <supabase_jwt>
 * Body: { receipt_email: string }
 *
 * Security hardening (all versions):
 *  v4 — reads plan column, sets trial_ends_at for trial plans
 *  v5 — consumed_at IS NULL check; unified error strings; lowercase normalization
 *  v6 — atomic whitelist claim via UPDATE...RETURNING (TOCTOU race fix)
 *       two concurrent calls can no longer both succeed on the same grant
 */

// Supply-chain hardening: pin to minor versions so esm.sh cannot silently
// serve a compromised patch. Update these pins when intentionally upgrading.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin':  'https://acepaste.xyz',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
};

const NO_PURCHASE_MSG = 'No purchase found for that email. Check your Stripe receipt and try again.';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const jwt = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  let receiptEmail: string;
  try {
    const body = await req.json();
    receiptEmail = (body.receipt_email || '').trim().toLowerCase();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!receiptEmail) return json({ error: 'receipt_email is required' }, 400);

  if (receiptEmail === user.email?.toLowerCase()) {
    return json({ error: 'That is already the email on your account. Your plan should be current.' }, 400);
  }

  // Rate-limit: 5 attempts per user per hour
  const { data: recent } = await supabase
    .from('restore_attempts')
    .select('id')
    .eq('user_id', user.id)
    .gte('attempted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (recent && recent.length >= 5) {
    return json({ error: 'Too many restore attempts. Please wait an hour and try again.' }, 429);
  }

  await supabase.from('restore_attempts').insert({ user_id: user.id, receipt_email: receiptEmail });

  // ── 1. Atomic whitelist claim ─────────────────────────────────────────────
  // Use UPDATE...RETURNING rather than SELECT then UPDATE to eliminate the
  // TOCTOU race: only one concurrent call can set consumed_at from NULL.
  const { data: claimedRows } = await supabase
    .from('lifetime_grant_emails')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', receiptEmail)
    .is('consumed_at', null)
    .select('plan');

  if (claimedRows && claimedRows.length > 0) {
    const grantedPlan = claimedRows[0].plan || 'lifetime';
    const grantUpdate: Record<string, unknown> = { user_id: user.id, plan: grantedPlan };
    if (grantedPlan === 'trial') {
      grantUpdate.trial_ends_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    await supabase.from('subscriptions').upsert(grantUpdate, { onConflict: 'user_id' });
    console.log(`[restore] Whitelist grant plan=${grantedPlan} applied to user=${user.id}`);
    return json({ plan: grantedPlan });
  }

  // ── 2. Search Stripe ──────────────────────────────────────────────────────
  const customers = await stripe.customers.list({ email: receiptEmail, limit: 5 });
  if (!customers.data.length) {
    return json({ error: NO_PURCHASE_MSG });  // unified — don't reveal Stripe customer existence
  }

  let bestPlan: string | null = null;
  let bestPeriodEnd: Date | null = null;

  for (const customer of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: customer.id, status: 'active', limit: 5 });
    for (const sub of subs.data) {
      const priceId = sub.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId];
      if (plan === 'monthly' || plan === 'yearly') {
        const periodEnd = new Date(sub.current_period_end * 1000);
        if (!bestPeriodEnd || periodEnd > bestPeriodEnd) { bestPlan = plan; bestPeriodEnd = periodEnd; }
      }
    }

    const sessions = await stripe.checkout.sessions.list({ customer: customer.id, limit: 10 });
    for (const session of sessions.data) {
      if (session.payment_status !== 'paid') continue;
      const expanded = await stripe.checkout.sessions.retrieve(session.id, { expand: ['line_items'] });
      const priceId = expanded.line_items?.data[0]?.price?.id;
      if (!priceId) continue;
      const plan = PRICE_TO_PLAN[priceId];
      if (plan === 'lifetime') { bestPlan = 'lifetime'; break; }
      if (plan === 'trial' && bestPlan !== 'lifetime') bestPlan = 'trial';
    }
    if (bestPlan === 'lifetime') break;
  }

  if (!bestPlan) {
    return json({ error: NO_PURCHASE_MSG });  // same string regardless of path
  }

  const update: Record<string, unknown> = { user_id: user.id, plan: bestPlan };
  if (bestPeriodEnd) update.period_ends_at = bestPeriodEnd.toISOString();
  if (bestPlan === 'trial') {
    update.trial_ends_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }

  const { error: upsertErr } = await supabase
    .from('subscriptions').upsert(update, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('[restore] Upsert error:', upsertErr);
    return json({ error: 'Failed to apply plan. Contact support.' }, 500);
  }

  console.log(`[restore] Restored plan=${bestPlan} for user=${user.id} from receipt_email=${receiptEmail}`);
  return json({ plan: bestPlan });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const PRICE_TO_PLAN: Record<string, string> = {
  // Legacy prices
  'price_1TTrW9EsqFDVCVgWlpNMG4sP': 'trial',
  'price_1TTrWCEsqFDVCVgWmFQoIZI2': 'monthly',
  'price_1TTrWFEsqFDVCVgWkcunxJHq': 'yearly',
  'price_1TTrWIEsqFDVCVgWrFGPxiZ7': 'lifetime',
  // 2026-05 prices
  'price_1TUIg7EsqFDVCVgWxVD6pppb': 'trial',     // Day Pass
  'price_1TUIg7EsqFDVCVgWZBUt4aMC': 'monthly',   // Pro Monthly
  'price_1TUIg7EsqFDVCVgW9Huv2nr6': 'yearly',    // Pro Yearly
  'price_1TUIg6EsqFDVCVgWfe6lMyhd': 'lifetime',  // Founders Lifetime
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
