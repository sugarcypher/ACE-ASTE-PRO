/**
 * stripe-webhook — Supabase Edge Function v8
 *
 * POST /functions/v1/stripe-webhook
 * Stripe-Signature: <sig>
 *
 * Env vars (set via: supabase secrets set KEY=value):
 *   STRIPE_WEBHOOK_SECRET   — whsec_... from Stripe Dashboard → Webhooks
 *   STRIPE_SECRET_KEY       — sk_live_...
 *   SUPABASE_URL            — auto-injected by Supabase runtime
 *   SUPABASE_SERVICE_ROLE_KEY — auto-injected by Supabase runtime
 *
 * Security hardening:
 *  v8 — idempotency guard via processed_webhook_events table.
 *       Stripe guarantees at-least-once delivery; this prevents double-processing
 *       on retries and closes the replay-attack window.
 */

// Supply-chain hardening: pin to minor versions so esm.sh cannot silently
// serve a compromised patch. Update these pins when intentionally upgrading.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Stripe from 'https://esm.sh/stripe@14.21.0?target=deno';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-04-10',
  httpClient: Stripe.createFetchHttpClient(),
});

const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Map Stripe Price IDs → internal plan names.
// Both legacy and new (2026-05) Price IDs are mapped so existing customers'
// recurring subscriptions and new checkouts both resolve correctly.
const PRICE_TO_PLAN: Record<string, string> = {
  // Legacy prices ($1.23 / $12.34 / $123.45 / $234.56)
  'price_1TTrW9EsqFDVCVgWlpNMG4sP': 'trial',
  'price_1TTrWCEsqFDVCVgWmFQoIZI2': 'monthly',
  'price_1TTrWFEsqFDVCVgWkcunxJHq': 'yearly',
  'price_1TTrWIEsqFDVCVgWrFGPxiZ7': 'lifetime',
  // 2026-05 prices ($2.99 / $14.99 / $119 / $499)
  'price_1TUIg7EsqFDVCVgWxVD6pppb': 'trial',     // Day Pass
  'price_1TUIg7EsqFDVCVgWZBUt4aMC': 'monthly',   // Pro Monthly
  'price_1TUIg7EsqFDVCVgW9Huv2nr6': 'yearly',    // Pro Yearly
  'price_1TUIg6EsqFDVCVgWfe6lMyhd': 'lifetime',  // Founders Lifetime
};

Deno.serve(async (req) => {
  const body      = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return new Response('No signature', { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err.message);
    return new Response(`Webhook error: ${err.message}`, { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // ── Idempotency guard ──────────────────────────────────────────────────────
  // INSERT the event_id before processing. If the event was already handled,
  // Postgres raises a unique-violation (23505) and we return 200 immediately.
  // This prevents double-grants on Stripe retries and closes the replay window.
  const { error: dupErr } = await supabase
    .from('processed_webhook_events')
    .insert({ event_id: event.id });

  if (dupErr) {
    if (dupErr.code === '23505') {
      // Already processed — acknowledge to Stripe, do nothing.
      console.log('[webhook] Duplicate event ignored:', event.id);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    // Unexpected DB error — log but continue (don't block legitimate events).
    console.error('[webhook] Could not record event_id:', dupErr.message);
  }

  try {
    switch (event.type) {

      // ── One-time payments: trial + lifetime ──────────────────────────────
      // FIX: expand line_items on the session so we can reliably read price_id.
      // Stripe does not include line_items in the raw webhook payload.
      case 'checkout.session.completed': {
        const rawSession = event.data.object as Stripe.Checkout.Session;

        // Expand line_items via a fresh API call — the only reliable way.
        const session = await stripe.checkout.sessions.retrieve(rawSession.id, {
          expand: ['line_items'],
        });

        // Only process completed, paid sessions
        if (session.payment_status !== 'paid') {
          console.log('[webhook] checkout.session.completed: skipping unpaid session', session.id, session.payment_status);
          break;
        }

        const priceId = session.line_items?.data[0]?.price?.id;
        if (!priceId) {
          console.error('[webhook] checkout.session.completed: no price_id found for session', session.id);
          break;
        }

        const plan = PRICE_TO_PLAN[priceId];
        if (!plan) {
          console.warn('[webhook] Unknown price_id:', priceId, '— add it to PRICE_TO_PLAN');
          break;
        }

        // Skip recurring plans here — handled by subscription events below.
        if (plan === 'monthly' || plan === 'yearly') break;

        const email = session.customer_email || session.customer_details?.email;
        if (!email) {
          console.error('[webhook] checkout.session.completed: no email on session', session.id);
          break;
        }

        const userId = await getUserIdByEmail(supabase, email);
        if (!userId) {
          // User paid but has no account yet. Store a pending grant keyed by email
          // with the correct plan. When they sign up, on_user_created picks it up.
          await supabase.from('lifetime_grant_emails').upsert(
            { email, plan, note: `auto-grant from Stripe checkout ${session.id}` },
            { onConflict: 'email' }
          );
          console.warn(`[webhook] No account for ${email} — added to grant whitelist for plan=${plan}`);
          break;
        }

        const update: Record<string, unknown> = { user_id: userId, plan };
        if (plan === 'trial') {
          update.trial_ends_at = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        }
        if (session.customer) {
          update.stripe_customer_id = session.customer as string;
        }

        const { error } = await supabase.from('subscriptions').upsert(update, { onConflict: 'user_id' });
        if (error) console.error('[webhook] Upsert failed:', error);
        else console.log(`[webhook] Granted plan=${plan} to user=${userId}`);
        break;
      }

      // ── Subscriptions: monthly + yearly ─────────────────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub     = event.data.object as Stripe.Subscription;
        const priceId = sub.items.data[0]?.price.id;
        const plan    = PRICE_TO_PLAN[priceId];
        if (!plan) { console.warn('[webhook] Unknown price_id:', priceId); break; }

        const customerId = sub.customer as string;
        const email      = await getEmailFromCustomer(stripe, customerId);
        if (!email) { console.error('[webhook] No email for customer', customerId); break; }

        const userId = await getUserIdByEmail(supabase, email);
        if (!userId) {
          // No account yet — whitelist so on_user_created picks it up on signup.
          await supabase.from('lifetime_grant_emails').upsert(
            { email, plan, note: `auto-grant from subscription ${sub.id}` },
            { onConflict: 'email' }
          );
          console.warn(`[webhook] No account for ${email} — whitelisted for plan=${plan}`);
          break;
        }

        const { error } = await supabase.from('subscriptions').upsert({
          user_id:                userId,
          plan:                   sub.status === 'active' ? plan : 'free',
          stripe_customer_id:     customerId,
          stripe_subscription_id: sub.id,
          period_ends_at:         new Date(sub.current_period_end * 1000).toISOString(),
        }, { onConflict: 'user_id' });
        if (error) console.error('[webhook] Upsert failed:', error);
        else console.log(`[webhook] Subscription updated plan=${plan} user=${userId}`);
        break;
      }

      // ── Subscription cancelled / expired ────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub        = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        const email      = await getEmailFromCustomer(stripe, customerId);
        if (!email) { console.error('[webhook] No email for customer', customerId); break; }

        const userId = await getUserIdByEmail(supabase, email);
        if (!userId) { console.error('[webhook] No account for email:', email); break; }

        const { error } = await supabase.from('subscriptions')
          .update({ plan: 'free', stripe_subscription_id: null })
          .eq('user_id', userId);
        if (error) console.error('[webhook] Downgrade failed:', error);
        else console.log(`[webhook] Subscription cancelled, downgraded user=${userId}`);
        break;
      }

      // ── Payment failed after all Stripe retries ──────────────────────────
      case 'invoice.payment_failed': {
        const invoice    = event.data.object as Stripe.Invoice;
        // Only act when Stripe has exhausted all retries
        if (invoice.next_payment_attempt !== null) break;

        const customerId = invoice.customer as string;
        const email      = await getEmailFromCustomer(stripe, customerId);
        if (!email) { console.error('[webhook] No email for customer', customerId); break; }

        const userId = await getUserIdByEmail(supabase, email);
        if (!userId) { console.error('[webhook] No account for email:', email); break; }

        const { error } = await supabase.from('subscriptions')
          .update({ plan: 'free' })
          .eq('user_id', userId);
        if (error) console.error('[webhook] Downgrade after payment failure failed:', error);
        else console.log(`[webhook] Payment failed, downgraded user=${userId}`);
        break;
      }

      default:
        console.log('[webhook] Unhandled event type:', event.type);
    }
  } catch (err) {
    console.error('[webhook] Unhandled error:', err);
    return new Response('Internal error', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────

async function getEmailFromCustomer(stripe: Stripe, customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as Stripe.DeletedCustomer).deleted) return null;
    return (customer as Stripe.Customer).email ?? null;
  } catch (err) {
    console.error('[webhook] getEmailFromCustomer failed:', err.message);
    return null;
  }
}

// FIX: single code path via RPC only. The data API cannot query auth.users
// directly even with service role — only the RPC (security definer) can.
async function getUserIdByEmail(
  supabase: ReturnType<typeof createClient>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_user_id_by_email', { email_input: email });
  if (error) {
    console.error('[webhook] get_user_id_by_email RPC error:', error.message);
    return null;
  }
  if (!data || data.length === 0) {
    // Not necessarily an error — user may not have signed up yet.
    console.warn(`[webhook] No Supabase account found for email: ${email}`);
    return null;
  }
  return data[0].id as string;
}
