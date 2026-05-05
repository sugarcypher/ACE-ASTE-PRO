/**
 * subscription-check — Supabase Edge Function
 *
 * GET /functions/v1/subscription-check
 * Authorization: Bearer <supabase_jwt>
 *
 * Returns: { plan: "free" | "trial" | "monthly" | "yearly" | "lifetime" }
 *
 * Called by:
 *   - auth.js (web app) after login / on page load
 *   - Extension does NOT call this directly; it trusts chrome.storage.local
 *     (which was populated by the auth bridge on acepaste.xyz)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin':  'https://acepaste.xyz',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ plan: 'free', error: 'No token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Verify the JWT and get the user
  const jwt = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
  if (authErr || !user) {
    return new Response(JSON.stringify({ plan: 'free', error: 'Invalid token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Fetch the subscription row
  const { data, error } = await supabase
    .from('subscriptions')
    .select('plan, trial_ends_at, period_ends_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    return new Response(JSON.stringify({ plan: 'free' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let { plan } = data;

  // Expire time-limited plans server-side
  const now = new Date();
  if (plan === 'trial' && data.trial_ends_at && new Date(data.trial_ends_at) < now) {
    plan = 'free';
    // Async downgrade (fire-and-forget)
    supabase.from('subscriptions')
      .update({ plan: 'free', trial_ends_at: null })
      .eq('user_id', user.id)
      .then(() => {});
  }
  if ((plan === 'monthly' || plan === 'yearly') && data.period_ends_at && new Date(data.period_ends_at) < now) {
    plan = 'free';
    supabase.from('subscriptions')
      .update({ plan: 'free' })
      .eq('user_id', user.id)
      .then(() => {});
  }

  return new Response(JSON.stringify({ plan }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
