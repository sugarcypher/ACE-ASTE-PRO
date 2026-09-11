/**
 * restore-purchase — RETIRED 2026-09-10 (v9)
 *
 * The full toolset is free, so there is nothing to restore. The previous version
 * accepted any receipt_email without proving the caller owned it, which let any
 * signed-in user look up whether an email was a Stripe customer and claim unused
 * lifetime grants. This stub keeps the endpoint answering politely and does nothing.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin':  'https://acepaste.xyz',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
  }
  return new Response(
    JSON.stringify({ error: 'Restore is no longer needed: every AcePaste feature is free. Questions: support@acepaste.xyz' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
