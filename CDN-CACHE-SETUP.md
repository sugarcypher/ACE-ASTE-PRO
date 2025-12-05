# CDN Cache Configuration Guide

## Current Cache TTL Issues

PageSpeed Insights reports short cache lifetimes for our assets:
- `/brand.jpg?v=1.0` - 10 minutes (should be 1 year)
- `/app-critical.js?v=1.0` - 10 minutes (should be 1 year)
- `/styles.css?v=1.0` - 10 minutes (should be 1 year)

## Solution: CDN Configuration Required

GitHub Pages doesn't support custom HTTP headers directly. To implement proper caching, you need to configure a CDN (Content Delivery Network) in front of GitHub Pages.

### Recommended CDN: Cloudflare

1. **Add your domain to Cloudflare**
   - Sign up at https://cloudflare.com
   - Add `acepaste.xyz` as a site
   - Update your domain's nameservers to Cloudflare's

2. **Configure Cache Rules in Cloudflare**

   Go to **Rules** → **Page Rules** or **Cache Rules** and add:

   **Rule 1: Versioned Static Assets (1 year cache)**
   ```
   URL Pattern: *acepaste.xyz/*.js?v=* OR *acepaste.xyz/*.css?v=* OR *acepaste.xyz/*.jpg?v=*
   Settings:
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 year (31536000 seconds)
   - Browser Cache TTL: Respect Existing Headers
   ```

   **Rule 2: Non-versioned Static Assets (1 year cache)**
   ```
   URL Pattern: *acepaste.xyz/*.js OR *acepaste.xyz/*.css OR *acepaste.xyz/*.jpg OR *acepaste.xyz/*.png OR *acepaste.xyz/*.webp
   Settings:
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 year (31536000 seconds)
   - Browser Cache TTL: Respect Existing Headers
   ```

   **Rule 3: HTML Files (1 hour cache)**
   ```
   URL Pattern: *acepaste.xyz/*.html
   Settings:
   - Cache Level: Standard
   - Edge Cache TTL: 1 hour (3600 seconds)
   - Browser Cache TTL: Respect Existing Headers
   ```

3. **Enable Cloudflare Transform Rules (for _headers file)**

   Alternatively, use **Transform Rules** → **HTTP Response Header Modification**:

   ```
   Rule Name: Long Cache for Versioned Assets
   When: URI Path matches regex `.*\.(js|css|jpg|png|webp)(\?v=.*)?$`
   Then: Set static header
   Header name: Cache-Control
   Value: public, max-age=31536000, immutable
   ```

### Alternative: Netlify

If using Netlify instead of GitHub Pages:

1. The `_headers` file will be automatically applied
2. No additional configuration needed
3. Netlify respects the `_headers` file patterns

### Alternative: Vercel

If using Vercel:

1. Create `vercel.json`:
```json
{
  "headers": [
    {
      "source": "/(.*\\.(js|css|jpg|png|webp))(\\?v=.*)?$",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=31536000, immutable"
        }
      ]
    },
    {
      "source": "/(.*\\.html)$",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "public, max-age=3600, must-revalidate"
        }
      ]
    }
  ]
}
```

## Why Versioned URLs?

We use versioned URLs (`?v=1.0`) for cache busting:
- When content changes, increment the version (e.g., `?v=1.1`)
- Browsers will fetch the new version
- Old versions remain cached (no harm since they're not requested)

## Expected Results

After CDN configuration:
- ✅ Static assets cached for 1 year (31536000 seconds)
- ✅ HTML files cached for 1 hour (3600 seconds)
- ✅ Improved PageSpeed Insights scores
- ✅ Faster repeat visits for users

## Testing

After configuration, verify with:
```bash
curl -I https://acepaste.xyz/styles.css?v=1.0
curl -I https://acepaste.xyz/app-critical.js?v=1.0
curl -I https://acepaste.xyz/brand.jpg?v=1.0
```

Look for `Cache-Control: public, max-age=31536000, immutable` in the response headers.

