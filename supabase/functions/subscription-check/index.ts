/**
 * subscription-check — Supabase Edge Function v3
 *
 * GET /functions/v1/subscription-check
 * Authorization: Bearer <supabase_jwt>
 *
 * Returns: { plan: "free" | "trial" | "monthly" | "yearly" | "lifetime" }
 *
 * Security hardening:
 *  - Cache-Control: no-store on all responses (prevents proxy/CDN caching)
 *  - Consistent response shape on all paths
 */

// Supply-chain hardening: pin to minor version so esm.sh cannot silently
// serve a compromised patch. Update this pin when intentionally upgrading.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin':  'https://acepaste.xyz',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
};

const noCache = { 'Cache-Control': 'no-store, no-cache, must-revalidate' };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ plan: 'free' }), {
      status: 401,
      headers: { ...corsHeaders, ...noCache, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const jwt = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ plan: 'free' }), {
      status: 401,
      headers: { ...corsHeaders, ...noCache, 'Content-Type': 'application/json' },
    });
  }

  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, trial_ends_at, period_ends_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ plan: 'free' }), {
      headers: { ...corsHeaders, ...noCache, 'Content-Type': 'application/json' },
    });
  }

  let { plan } = data;
  const now = new Date();

  // Server-side plan expiry — fire-and-forget downgrade
  if (plan === 'trial' && data.trial_ends_at && new Date(data.trial_ends_at) < now) {
    plan = 'free';
    supabase.from('subscriptions')
      .update({ plan: 'free', trial_ends_at: null })
      .eq('user_id', user.id).then(() => {});
  }
  if ((plan === 'monthly' || plan === 'yearly') && data.period_ends_at && new Date(data.period_ends_at) < now) {
    plan = 'free';
    supabase.from('subscriptions')
      .update({ plan: 'free' })
      .eq('user_id', user.id).then(() => {});
  }

  return new Response(JSON.stringify({ plan }), {
    headers: { ...corsHeaders, ...noCache, 'Content-Type': 'application/json' },
  });
});
