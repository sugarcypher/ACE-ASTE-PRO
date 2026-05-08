# Security Headers & Privacy Configuration

## Overview

This document explains the security headers configuration for acepaste.xyz and how to achieve 100% scores on Webbkoll and Mozilla Observatory.

## Current Status

### ✅ Implemented (Works on All Platforms)

- **Content Security Policy (CSP)**: Strict policy with `default-src 'none'`, explicit script hashes, no `unsafe-inline`
- **Referrer Policy**: `no-referrer` via meta tag
- **Trusted Types**: Enabled for DOM XSS prevention
- **Zero Cookies**: No cookies set by our code
- **Zero localStorage**: All preferences migrated to in-memory variables
- **SRI**: Subresource Integrity on all third-party scripts

### ⚠️ Platform-Dependent (Requires Custom Headers Support)

These headers are configured in `_headers` but **only work on platforms that support custom HTTP headers**:

- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `X-XSS-Protection: 0`
- `Strict-Transport-Security` (HSTS)
- `Permissions-Policy`
- `Cross-Origin-Opener-Policy`
- `Cross-Origin-Embedder-Policy`

## Platform Support

### ✅ Platforms That Support `_headers` File

1. **Cloudflare Pages**
   - Automatically reads `_headers` file
   - No additional configuration needed
   - ✅ **Recommended for 100% scores**

2. **Netlify**
   - Automatically reads `_headers` file
   - No additional configuration needed
   - ✅ **Recommended for 100% scores**

3. **Vercel**
   - Requires `vercel.json` configuration (see below)
   - Can also use `_headers` with Next.js
   - ✅ **Works with configuration**

### ❌ Platforms That Do NOT Support Custom Headers

1. **GitHub Pages**
   - Does NOT support custom HTTP headers
   - Headers must be set via:
     - Meta tags (limited support)
     - CDN/proxy layer (Cloudflare, etc.)
   - ⚠️ **Will show lower scores on Webbkoll/Observatory**

## Why Webbkoll Still Flags Missing Headers on GitHub Pages

Webbkoll and Mozilla Observatory scan **HTTP response headers**, not HTML meta tags. Even though we have a strong CSP in a `<meta>` tag, these tools cannot see it as an HTTP header.

They will flag:
- ❌ Missing `X-Content-Type-Options` header
- ❌ Missing `X-Frame-Options` header
- ❌ Missing `Strict-Transport-Security` header
- ❌ Missing `Referrer-Policy` header (as HTTP header)

**Note**: The CSP meta tag still works for browsers, but security scanners don't count it.

## How to Achieve 100% Scores

### Option 1: Deploy to Cloudflare Pages (Recommended)

1. Push code to GitHub
2. Connect repository to Cloudflare Pages
3. Deploy
4. `_headers` file is automatically applied
5. ✅ **100% score on Webbkoll/Observatory**

### Option 2: Deploy to Netlify

1. Push code to GitHub
2. Connect repository to Netlify
3. Deploy
4. `_headers` file is automatically applied
5. ✅ **100% score on Webbkoll/Observatory**

### Option 3: Deploy to Vercel

Create `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "0"
        },
        {
          "key": "Strict-Transport-Security",
          "value": "max-age=31556952; includeSubDomains; preload"
        },
        {
          "key": "Referrer-Policy",
          "value": "no-referrer"
        },
        {
          "key": "Content-Security-Policy",
          "value": "default-src 'none'; script-src 'self' 'sha256-...'; style-src 'self' 'sha256-...'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' https://eqoltjofjlznlirbalrb.supabase.co; frame-src 'self' https://www.youtube-nocookie.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; require-trusted-types-for 'script'; upgrade-insecure-requests"
        }
      ]
    }
  ]
}
```

### Option 4: GitHub Pages + Cloudflare Proxy

1. Keep site on GitHub Pages
2. Add domain to Cloudflare
3. Configure headers in Cloudflare Dashboard:
   - Rules → Transform Rules → Modify Response Header
   - Or use Cloudflare Workers
4. ✅ **100% score possible with Cloudflare configuration**

## CSP Hash Verification

All inline scripts in `index.html` have SHA-256 hashes in the CSP. To verify:

```bash
# Extract inline script
# Calculate hash
echo -n "SCRIPT_CONTENT" | openssl dgst -sha256 -binary | openssl base64
```

Current inline scripts:
1. Trusted Types policy
2. JSON-LD structured data
3. loadCSS polyfill
4. Dark mode initialization (empty now)

## Privacy Compliance

### ✅ Zero Tracking
- No cookies set by our code
- No localStorage usage
- No sessionStorage usage
- No third-party analytics (except consent management)

### ✅ Client-Side Processing
- All text processing happens in browser
- No data transmitted to servers
- No data stored on servers

### ✅ Consent Management
- No third-party consent platform required: site sets no tracking, analytics, or advertising cookies. The only browser storage is a sessionStorage entry for the optional account login (cleared on tab close) and `chrome.storage.local` inside the browser extension.
- All scripts are first-party. Subresource Integrity is no longer applicable because no cross-origin scripts are loaded.

## Testing

### Test on Webbkoll
1. Visit: https://webbkoll.dataskydd.net/
2. Enter: `https://acepaste.xyz`
3. Review security headers score

### Test on Mozilla Observatory
1. Visit: https://observatory.mozilla.org/
2. Enter: `https://acepaste.xyz`
3. Review security score

### Expected Scores

**On GitHub Pages:**
- CSP: ✅ (via meta tag, but not counted as HTTP header)
- Other headers: ❌ (not supported)
- **Score: ~60-70%**

**On Cloudflare Pages/Netlify/Vercel:**
- All headers: ✅
- **Score: 100%**

## Files

- `_headers`: Headers configuration for Cloudflare Pages/Netlify
- `index.html`: Contains CSP meta tag (works on all platforms)
- `SECURITY-COMPLIANCE-REPORT.md`: Detailed compliance report

## Maintenance

When adding new inline scripts:
1. Calculate SHA-256 hash
2. Add to CSP in `index.html` (meta tag)
3. Add to CSP in `_headers` (HTTP header)
4. Update this document

## References

- [Mozilla Observatory](https://observatory.mozilla.org/)
- [Webbkoll](https://webbkoll.dataskydd.net/)
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Security Headers](https://securityheaders.com/)

