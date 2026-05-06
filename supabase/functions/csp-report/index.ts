/**
 * csp-report — Supabase Edge Function v1
 *
 * POST /functions/v1/csp-report
 * Content-Type: application/csp-report  (sent automatically by browsers)
 *
 * Receives Content Security Policy violation reports from browsers and logs
 * them to the csp_violations table for monitoring.
 *
 * Two uses:
 *  1. Detecting injection attempts (someone trying to load an unauthorised script)
 *  2. Catching CSP regressions when the site changes (new inline script, etc.)
 *
 * This endpoint intentionally requires NO auth — browsers send reports
 * automatically and cannot attach a JWT. Rate-limited by Supabase's
 * built-in throttling; payload is validated and capped before insert.
 */

// Supply-chain hardening: pinned to exact minor version.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const MAX_BODY_BYTES = 8_192; // browsers rarely exceed 2 KB; 8 KB is generous

Deno.serve(async (req) => {
  // Handle CORS preflight (browsers don't preflight csp-report POSTs, but
  // be safe for future report-to API usage which does send OPTIONS).
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Reject oversized payloads early to prevent log-flooding attacks.
  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return new Response('Payload Too Large', { status: 413 });
  }

  let report: Record<string, unknown> = {};
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return new Response('Payload Too Large', { status: 413 });
    const parsed = JSON.parse(raw);
    // Both report-uri (csp-report key) and report-to (array) formats
    report = parsed['csp-report'] ?? (Array.isArray(parsed) ? parsed[0] : parsed) ?? {};
  } catch {
    // Malformed JSON — still return 204 so browsers don't retry indefinitely.
    return new Response(null, { status: 204 });
  }

  // Sanitise: truncate all fields to reasonable lengths before storing.
  function trunc(v: unknown, max = 512): string | null {
    if (v == null) return null;
    return String(v).slice(0, max);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    await supabase.from('csp_violations').insert({
      document_uri:        trunc(report['document-uri']        ?? report['documentURL']),
      violated_directive:  trunc(report['violated-directive']  ?? report['violatedDirective']),
      effective_directive: trunc(report['effective-directive'] ?? report['effectiveDirective']),
      blocked_uri:         trunc(report['blocked-uri']         ?? report['blockedURL']),
      source_file:         trunc(report['source-file']         ?? report['sourceFile']),
      line_number:         Number(report['line-number']        ?? report['lineNumber'])   || null,
      column_number:       Number(report['column-number']      ?? report['columnNumber']) || null,
      disposition:         trunc(report['disposition'], 16),
    });
  } catch (err) {
    // Log but never surface errors — a noisy logger must not affect the site.
    console.error('[csp-report] Insert failed:', err?.message);
  }

  // Always 204: browsers retry on non-2xx, which would amplify noise.
  return new Response(null, { status: 204 });
});
