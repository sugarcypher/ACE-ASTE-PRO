/**
 * Cloudflare Worker for ads.txt handling
 * 
 * This worker:
 * 1. Intercepts requests to /ads.txt
 * 2. Fetches from upstream service (srv.adstxtmanager.com)
 * 3. Falls back to KV storage content if upstream fails
 * 4. Caches successful responses for performance
 * 
 * To deploy:
 * 1. Go to Cloudflare Dashboard → Workers & Pages
 * 2. Create a new Worker
 * 3. Create a KV namespace named "ADS_FALLBACK"
 * 4. Bind the KV namespace to your worker (Settings → Variables → KV Namespace Bindings)
 * 5. Paste this code
 * 6. Add route: acepaste.xyz/ads.txt
 * 
 * To update fallback content:
 * - Use Cloudflare Dashboard → Workers & Pages → KV
 * - Or use Wrangler CLI: wrangler kv:key put "ads.txt" --value="your content" --binding=ADS_FALLBACK
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ads.txt") {
      const upstream = "https://srv.adstxtmanager.com/81161/acepaste.xyz";

      // Minimal fallback – overwritten at runtime by your refresh script
      const fallback = await env.ADS_FALLBACK.get("ads.txt", "text") 
        || "EZOIC-ADS-TXT-FALLBACK";

      try {
        const res = await fetch(upstream, { cf: { cacheEverything: true } });
        if (res.ok) return res;
      } catch (_) {}

      return new Response(fallback, {
        headers: { "Content-Type": "text/plain" }
      });
    }

    return fetch(request);
  }
};

