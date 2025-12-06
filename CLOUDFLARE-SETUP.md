# Cloudflare Setup Guide for Security Headers

## Why This Is Needed

GitHub Pages **does not support custom HTTP headers**. Security headers like `X-Frame-Options` and CSP `frame-ancestors` must be set via HTTP headers (not meta tags) to protect against clickjacking attacks.

## Quick Setup Steps

### 1. Add Domain to Cloudflare

1. Sign up at [cloudflare.com](https://cloudflare.com) (free plan works)
2. Add your site: `acepaste.xyz`
3. Cloudflare will scan your DNS records
4. Update your domain's nameservers to Cloudflare's (provided in dashboard)

### 2. Configure Security Headers

Go to **Rules** → **Transform Rules** → **HTTP Response Header Modification**

#### Create Rule: Security Headers

**Rule Name**: `Security Headers for All Pages`

**When**: 
- URI Path matches: `*`

**Then**: Set static headers (add each one):

1. **X-Frame-Options**
   - Header name: `X-Frame-Options`
   - Value: `SAMEORIGIN`

2. **X-Content-Type-Options**
   - Header name: `X-Content-Type-Options`
   - Value: `nosniff`

3. **Referrer-Policy**
   - Header name: `Referrer-Policy`
   - Value: `strict-origin-when-cross-origin`

4. **Permissions-Policy**
   - Header name: `Permissions-Policy`
   - Value: `geolocation=(), microphone=(), camera=()`

5. **Cross-Origin-Opener-Policy**
   - Header name: `Cross-Origin-Opener-Policy`
   - Value: `same-origin-allow-popups`

6. **Strict-Transport-Security**
   - Header name: `Strict-Transport-Security`
   - Value: `max-age=31536000; includeSubDomains; preload`

### 3. Configure Content-Security-Policy

**Rule Name**: `CSP Header`

**When**: 
- URI Path matches: `*`

**Then**: Set static header:

- Header name: `Content-Security-Policy`
- Value: (copy from `_headers` file, line 13)

```
default-src 'self'; script-src 'self' 'sha256-86c2365ca49c78f7eaabd6bce2bd492268a07e72859cc270b77257a25d483565' 'sha256-42990002847620bd43394d03506c00174cf9f20728e4f8e0bdd34280b13d37d4' 'sha256-677730f7750ae982a69c8602a9209ea987622664008738755182f71fa65f3876' 'sha256-hsI2XKScePfqq9a84r1JImigfnKFnMJwt3JXol1INWU=' 'sha256-QpkAAoR2IL1DOU0DUGwAF0z58gco5PjgvdNCgLE9N9Q=' 'sha256-Z3cw93UK6YKmnIYCqSCeqYdiJmQAhzh1UYL3H6ZfOHY=' 'sha256-sPGq/oAjfsmBw0Nqmju6/7Fn6jAZZTO8490AQ3YIkjs=' https://app.termly.io https://cmp.gatekeeperconsent.com https://the.gatekeeperconsent.com https://privacy.gatekeeperconsent.com https://www.ezojs.com http://www.ezojs.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' https://app.termly.io https://cmp.gatekeeperconsent.com https://the.gatekeeperconsent.com https://privacy.gatekeeperconsent.com https://www.ezojs.com; frame-src 'self' https://app.termly.io; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'; require-trusted-types-for 'script'; upgrade-insecure-requests;
```

**Important**: The CSP includes `frame-ancestors 'self'` which prevents clickjacking attacks.

## Alternative: Use Cloudflare Workers

For more advanced control, you can use Cloudflare Workers:

1. Go to **Workers & Pages** → **Create Worker**
2. Use the following script:

```javascript
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const response = await fetch(request)
  
  // Clone response to modify headers
  const newResponse = new Response(response.body, response)
  
  // Add security headers
  newResponse.headers.set('X-Frame-Options', 'SAMEORIGIN')
  newResponse.headers.set('X-Content-Type-Options', 'nosniff')
  newResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  newResponse.headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=()')
  newResponse.headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups')
  newResponse.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload')
  
  // Add CSP (update with your full CSP from _headers file)
  newResponse.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' ...; frame-ancestors 'self'; ...")
  
  return newResponse
}
```

3. Route traffic through the worker: **Workers Routes** → Add route for `acepaste.xyz/*`

## Verification

After setup, verify headers are active:

```bash
curl -I https://acepaste.xyz
```

You should see:
- `X-Frame-Options: SAMEORIGIN`
- `Content-Security-Policy: ... frame-ancestors 'self' ...`

Or use online tools:
- [SecurityHeaders.com](https://securityheaders.com/?q=https://acepaste.xyz)
- [Mozilla Observatory](https://observatory.mozilla.org/analyze/acepaste.xyz)

## Expected Results

After Cloudflare setup:
- ✅ X-Frame-Options header active
- ✅ CSP frame-ancestors directive active
- ✅ Clickjacking protection enabled
- ✅ All security headers active
- ✅ Security scanner scores improve significantly

## Notes

- **Free Cloudflare plan** is sufficient for this setup
- Headers are applied at the edge (fast, no performance impact)
- Changes take effect immediately after configuration
- GitHub Pages continues to serve the content, Cloudflare adds headers



