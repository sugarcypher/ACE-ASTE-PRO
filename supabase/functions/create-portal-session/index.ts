/**
 * create-portal-session — Supabase Edge Function
 *
 * POST /functions/v1/create-portal-session
 * Authorization: Bearer <supabase_jwt>
 *
 * Creates a Stripe Billing Portal session for the authenticated user
 * and returns the session URL. The client then redirects to it.
 *
 * Env vars:
 *   STRIPE_SECRET_KEY           — sk_live_...
 *   SUPABASE_URL                — auto-injected
 *   SUPABASE_SERVICE_ROLE_KEY   — auto-injected
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

  // Fetch the user's Stripe customer ID from the subscriptions table
  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr || !sub?.stripe_customer_id) {
    return json({ error: 'No billing account found. Make a purchase first.' }, 404);
  }

  // Parse optional return_url from body
  let returnUrl = 'https://acepaste.xyz/account.html';
  try {
    const body = await req.json();
    if (body.return_url) returnUrl = body.return_url;
  } catch { /* no body or not JSON — use default */ }

  // Create a portal session
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });

  return json({ url: session.url });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
