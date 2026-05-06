/**
 * create-portal-session — Supabase Edge Function v2
 *
 * POST /functions/v1/create-portal-session
 * Authorization: Bearer <supabase_jwt>
 *
 * Security hardening:
 *  - return_url validated against https://acepaste.xyz origin (open-redirect fix)
 *  - Lifetime users without stripe_customer_id get a clear 404 (no Stripe call)
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

const ALLOWED_RETURN_ORIGIN = 'https://acepaste.xyz';
const DEFAULT_RETURN_URL    = 'https://acepaste.xyz/account.html';

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

  const { data: sub, error: subErr } = await supabase
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (subErr || !sub?.stripe_customer_id) {
    return json({ error: 'No billing account found. Contact support if you believe this is an error.' }, 404);
  }

  // Validate return_url — must be same origin as acepaste.xyz
  let returnUrl = DEFAULT_RETURN_URL;
  try {
    const body = await req.json();
    if (body.return_url) {
      const parsed = new URL(body.return_url);
      if (parsed.origin === ALLOWED_RETURN_ORIGIN) {
        returnUrl = body.return_url;
      } else {
        console.warn('[portal] Rejected non-allowlisted return_url:', body.return_url);
      }
    }
  } catch { /* no body or invalid URL — use default */ }

  const session = await stripe.billingPortal.sessions.create({
    customer:   sub.stripe_customer_id,
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
