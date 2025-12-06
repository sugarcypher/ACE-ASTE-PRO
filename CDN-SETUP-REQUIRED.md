# CDN/Proxy Setup Required for Security Headers

## Important Notice

**GitHub Pages does not support custom HTTP headers.** The security headers defined in `_headers` will only be active when the site is served through a CDN or proxy that supports custom headers.

## Current Status

The following security headers are configured in `_headers` but **will not be active on GitHub Pages**:

- ✅ X-Frame-Options: SAMEORIGIN
- ✅ Cross-Origin-Opener-Policy: same-origin-allow-popups
- ✅ Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
- ✅ Content-Security-Policy (with frame-ancestors)
- ✅ X-Content-Type-Options: nosniff
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Permissions-Policy

## Why Security Scanners Show Missing Headers

Security scanners (like SecurityHeaders.com, Mozilla Observatory) check the **live site** at `https://acepaste.xyz`. Since GitHub Pages doesn't serve custom headers, these scanners will report missing headers until a CDN/proxy is configured.

## Solutions

### Option 1: Cloudflare (Recommended)

1. Add your domain to Cloudflare
2. Configure DNS to point to GitHub Pages
3. Enable "Transform Rules" or "Page Rules"
4. Add headers from `_headers` file via Cloudflare dashboard

**Cloudflare Transform Rules Example**:
```
Header name: X-Frame-Options
Value: SAMEORIGIN
```

### Option 2: Netlify

1. Deploy to Netlify instead of GitHub Pages
2. Netlify automatically reads `_headers` file
3. Headers will be active immediately

### Option 3: CloudFront (AWS)

1. Set up CloudFront distribution
2. Use Lambda@Edge or CloudFront Functions
3. Add headers programmatically

### Option 4: nginx/Apache (Self-hosted)

1. Configure web server to read `_headers` file
2. Or manually add headers in server configuration

## Verification

After configuring CDN/proxy, verify headers are active:

1. **Browser DevTools**:
   - Open Network tab
   - Reload page
   - Click on document request
   - Check "Response Headers"

2. **Online Tools**:
   - [SecurityHeaders.com](https://securityheaders.com/?q=https://acepaste.xyz)
   - [Mozilla Observatory](https://observatory.mozilla.org/analyze/acepaste.xyz)

3. **Command Line**:
   ```bash
   curl -I https://acepaste.xyz
   ```

## Current Headers Configuration

All headers are defined in `_headers` file and ready for CDN/proxy deployment:

```
/*
  X-Frame-Options: SAMEORIGIN
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: geolocation=(), microphone=(), camera=()
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Cross-Origin-Embedder-Policy: require-corp
  Content-Security-Policy: [see _headers file for full policy]
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

## Meta Tag Fallbacks

Some headers are also set via meta tags in `index.html` as fallbacks:
- Content-Security-Policy (meta tag)
- Cross-Origin-Opener-Policy (meta tag)

**Note**: X-Frame-Options and HSTS **cannot** be set via meta tags - they require HTTP headers.



