/**
 * Cloudflare Worker for ads.txt handling
 * 
 * This worker:
 * 1. Intercepts requests to /ads.txt
 * 2. Fetches from upstream service (srv.adstxtmanager.com)
 * 3. Falls back to static content if upstream fails
 * 4. Caches successful responses for performance
 * 
 * To deploy:
 * 1. Go to Cloudflare Dashboard → Workers & Pages
 * 2. Create a new Worker
 * 3. Paste this code
 * 4. Add route: acepaste.xyz/ads.txt
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // Only handle /ads.txt requests
    if (url.pathname === "/ads.txt") {
      const upstream = "https://srv.adstxtmanager.com/19390/acepaste.xyz";
      const fallback = `# ads.txt fallback
# This is served when the upstream service is unavailable
# Update this with your actual ads.txt content

# Placeholder - replace with actual ads.txt content
# Example format:
# google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0`;

      try {
        // Try to fetch from upstream with caching
        const response = await fetch(upstream, {
          cf: {
            cacheEverything: true,
            cacheTtl: 3600, // Cache for 1 hour
          },
          headers: {
            'User-Agent': request.headers.get('User-Agent') || 'Cloudflare-Worker',
          },
        });

        // If successful and has content, return it
        if (response.ok) {
          const text = await response.text();
          if (text && text.length > 10) {
            return new Response(text, {
              headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'public, max-age=3600',
              },
            });
          }
        }
      } catch (error) {
        // Upstream failed, use fallback
        console.error('ads.txt upstream failed:', error);
      }

      // Serve fallback
      return new Response(fallback, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'public, max-age=300', // Cache fallback for 5 minutes
        },
      });
    }

    // For all other requests, pass through
    return fetch(request);
  },
};

