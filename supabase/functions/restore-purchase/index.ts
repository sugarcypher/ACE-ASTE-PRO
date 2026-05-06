/**
 * restore-purchase — Supabase Edge Function
 *
 * POST /functions/v1/restore-purchase
 * Authorization: Bearer <supabase_jwt>
 * Body: { receipt_email: string }
 *
 * Looks up whether the authenticated user's Stripe purchase exists under
 * a different email (the receipt_email). If found, copies the plan to their
 * account. Covers the case where a user paid with a different email than
 * their Supabase account.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Stripe from 'https://esm.sh/stripe@14?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin':  'https://acepaste.xyz',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  // Verify caller is authenticated
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const jwt = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  // Parse body
  let receiptEmail: string;
  try {
    const body = await req.json();
    receiptEmail = (body.receipt_email || '').trim().toLowerCase();
  } catch {
    return json({ error: 'Invalid request body' }, 400);
  }

  if (!receiptEmail) return json({ error: 'receipt_email is required' }, 400);

  // Don't allow restoring to the same email — nothing to restore
  if (receiptEmail === user.email?.toLowerCase()) {
    return json({ error: 'That is already the email on your account. Your plan should be current.' }, 400);
  }

  // Rate-limit: check restore attempts in the last hour (simple, no Redis needed)
  const { data: recent } = await supabase
    .from('restore_attempts')
    .select('id')
    .eq('user_id', user.id)
    .gte('attempted_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (recent && recent.length >= 5) {
    return json({ error: 'Too many restore attempts. Please wait an hour and try again.' }, 429);
  }

  // Log this attempt
  await supabase.from('restore_attempts').insert({
    user_id: user.id,
    receipt_email: receiptEmail,
  });

  // 1. Check if there's a pending grant for this email in lifetime_grant_emails
  const { data: grantRow } = await supabase
    .from('lifetime_grant_emails')
    .select('email, plan')
    .eq('email', receiptEmail)
    .maybeSingle();

  if (grantRow) {
    const grantedPlan = grantRow.plan || 'lifetime';
    const grantUpdate: Record<string, unknown> = { user_id: user.id, plan: grantedPlan };
    if (grantedPlan === 'trial') {
      grantUpdate.trial_ends_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    }
    await supabase.from('subscriptions').upsert(grantUpdate, { onConflict: 'user_id' });
    return json({ plan: grantedPlan });
  }

  // 2. Search Stripe for a customer with that receipt email
  const customers = await stripe.customers.list({ email: receiptEmail, limit: 5 });
  if (!customers.data.length) {
    return json({ error: 'No Stripe purchase found for that email.' });
  }

  // Find the most recent paid subscription or one-time charge across those customers
  let bestPlan: string | null = null;
  let bestPeriodEnd: Date | null = null;

  for (const customer of customers.data) {
    // Check active subscriptions
    const subs = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 5,
    });
    for (const sub of subs.data) {
      const priceId = sub.items.data[0]?.price.id;
      const plan = PRICE_TO_PLAN[priceId];
      if (plan === 'monthly' || plan === 'yearly') {
        const periodEnd = new Date(sub.current_period_end * 1000);
        if (!bestPeriodEnd || periodEnd > bestPeriodEnd) {
          bestPlan = plan;
          bestPeriodEnd = periodEnd;
        }
      }
    }

    // Check one-time payments (trial, lifetime) via charges or payment intents
    const sessions = await stripe.checkout.sessions.list({
      customer: customer.id,
      limit: 10,
    });
    for (const session of sessions.data) {
      if (session.payment_status !== 'paid') continue;
      const expanded = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items'],
      });
      const priceId = expanded.line_items?.data[0]?.price?.id;
      if (!priceId) continue;
      const plan = PRICE_TO_PLAN[priceId];
      if (plan === 'lifetime') { bestPlan = 'lifetime'; break; }
      if (plan === 'trial' && bestPlan !== 'lifetime') bestPlan = 'trial';
    }
    if (bestPlan === 'lifetime') break;
  }

  if (!bestPlan) {
    return json({ error: 'No active purchase found for that email.' });
  }

  // Apply the found plan to the authenticated user's account
  const update: Record<string, unknown> = { user_id: user.id, plan: bestPlan };
  if (bestPeriodEnd) update.period_ends_at = bestPeriodEnd.toISOString();

  const { error: upsertErr } = await supabase
    .from('subscriptions')
    .upsert(update, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('[restore] Upsert error:', upsertErr);
    return json({ error: 'Failed to apply plan. Contact support.' }, 500);
  }

  console.log(`[restore] Restored plan=${bestPlan} for user=${user.id} from receipt_email=${receiptEmail}`);
  return json({ plan: bestPlan });
});

// ── Helpers ───────────────────────────────────────────────────────────────

const PRICE_TO_PLAN: Record<string, string> = {
  'price_1TTrW9EsqFDVCVgWlpNMG4sP': 'trial',
  'price_1TTrWCEsqFDVCVgWmFQoIZI2': 'monthly',
  'price_1TTrWFEsqFDVCVgWkcunxJHq': 'yearly',
  'price_1TTrWIEsqFDVCVgWrFGPxiZ7': 'lifetime',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
