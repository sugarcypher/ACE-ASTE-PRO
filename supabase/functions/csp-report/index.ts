/**
 * csp-report — RETIRED 2026-09-10 (v2)
 *
 * GitHub Pages cannot send a report-uri header and browsers ignore report-uri in a
 * <meta> policy, so this endpoint never received a real report. The previous version
 * accepted unlimited anonymous database inserts. This stub accepts and discards.
 */
Deno.serve(() => new Response(null, { status: 204 }));
