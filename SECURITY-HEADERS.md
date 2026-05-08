# Security Headers Configuration

This document describes the security headers implemented for acepaste.xyz to protect against XSS, clickjacking, and other attacks.

## Implemented Headers

### Content Security Policy (CSP)
**Status**: ✅ Implemented via meta tag and HTTP header (in `_headers`)

The CSP restricts which resources can be loaded and executed, significantly reducing XSS attack risk.

**Current Policy** (see `_headers` for the authoritative version):
```
default-src 'none';
script-src 'self' 'sha256-…' (one hash per inline script, no host allowlist);
style-src 'self' 'sha256-…' (hash for the inline ap-video block);
img-src 'self' data:;
font-src 'self' data:;
connect-src 'self' https://eqoltjofjlznlirbalrb.supabase.co;
frame-src 'self' https://www.youtube-nocookie.com;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'none';
require-trusted-types-for 'script';
upgrade-insecure-requests;
report-uri https://eqoltjofjlznlirbalrb.supabase.co/functions/v1/csp-report;
```

**Directives Explained**:
- `default-src 'none'`: Block everything by default; only the directives below allowlist anything.
- `script-src`:
  - `'self'`: scripts loaded from the same origin via `<script src=>`
  - `'sha256-…'`: per-inline-script hashes (no `'unsafe-inline'`)
  - **No third-party hosts.** External consent platforms / analytics are not allowed.
- `style-src`: same-origin stylesheets + a hash for the one inline `<style>` block on the homepage.
- `img-src`: same-origin and `data:` URIs only. No remote images, no third-party image hosts.
- `connect-src`: same-origin XHR/fetch + the Supabase project URL (auth + edge functions).
- `frame-src`: same-origin + `https://www.youtube-nocookie.com` (the demo-video facade after click — no-cookie variant only).
- `object-src 'none'`: blocks plugins (Flash, etc.)
- `frame-ancestors 'none'`: prevents the page from being embedded in any iframe (clickjacking protection). Must be set via HTTP header — meta-tag form is ignored by browsers.
- `require-trusted-types-for 'script'`: enforces the Trusted Types API on DOM XSS sinks.
- `report-uri`: violations stream to the `csp-report` Supabase Edge Function.

**Security Improvements**:
- ✅ Removed `'unsafe-inline'` from `script-src` - using SHA-256 hashes instead
- ✅ Added `'strict-dynamic'` to allow dynamically loaded scripts from trusted sources
- ✅ CSP defined in HTTP header (primary) and meta tag (fallback for GitHub Pages)
- ✅ Host allowlists replaced with hashes for inline scripts (more secure)

### X-Frame-Options
**Status**: ⚠️ Requires server/CDN configuration (not supported in meta tags)

Prevents clickjacking by controlling where the page can be embedded.

**Value**: `SAMEORIGIN` - Page can only be embedded in frames on the same origin.

**Implementation**: Configured in `_headers` file for CDN/proxy deployment.

**Note**: 
- X-Frame-Options cannot be set via `<meta>` tag - it must be set via HTTP header
- **GitHub Pages Limitation**: Headers in `_headers` are not served by GitHub Pages - requires CDN/proxy
- Alternative: `frame-ancestors 'self'` in CSP also provides clickjacking protection

### Cross-Origin-Opener-Policy (COOP)
**Status**: ✅ Implemented via meta tag + HTTP header (in `_headers`)

Isolates the top-level window from other documents (pop-ups, iframes) to prevent cross-origin attacks.

**Value**: `same-origin-allow-popups` - Allows same-origin popups while isolating from cross-origin windows.

**Implementation**: 
- Meta tag in `index.html` (works on GitHub Pages)
- HTTP header in `_headers` (requires CDN/proxy)

**Note**: **GitHub Pages Limitation**: HTTP header in `_headers` is not served by GitHub Pages - meta tag provides fallback protection.

### X-Content-Type-Options
**Status**: ⚠️ Requires server/CDN configuration

Prevents MIME type sniffing attacks.

**Value**: `nosniff` - Browser must respect declared Content-Type.

**Implementation**: Configure at CDN/proxy level (see `_headers` file).

### Referrer-Policy
**Status**: ⚠️ Requires server/CDN configuration

Controls how much referrer information is sent with requests.

**Value**: `strict-origin-when-cross-origin` - Send full URL for same-origin, origin only for HTTPS→HTTPS, nothing for HTTPS→HTTP.

**Implementation**: Configure at CDN/proxy level (see `_headers` file).

### Permissions-Policy (formerly Feature-Policy)
**Status**: ⚠️ Requires server/CDN configuration

Controls which browser features and APIs can be used.

**Value**: `geolocation=(), microphone=(), camera=()` - Disables geolocation, microphone, and camera (not needed for this site).

**Implementation**: Configure at CDN/proxy level (see `_headers` file).

### Strict-Transport-Security (HSTS)
**Status**: ⚠️ Requires server/CDN configuration

Forces browsers to use HTTPS connections, preventing downgrade attacks.

**Current Value** (in `_headers`): `max-age=31536000; includeSubDomains; preload` (1 year)

**Directives**:
- `max-age=31536000`: Browser must use HTTPS for 1 year
- `includeSubDomains`: Applies to all subdomains
- `preload`: Eligible for browser HSTS preload list (permanent - cannot be removed)

**Implementation Notes**:
1. ✅ `includeSubDomains` - Included for subdomain protection
2. ✅ `preload` - Included for maximum security (permanent commitment)
3. ⚠️ **WARNING**: `preload` is permanent - ensure site will always support HTTPS
4. Configure at CDN/proxy level (see `_headers` file)
5. **GitHub Pages Limitation**: Headers in `_headers` are not served by GitHub Pages - requires CDN/proxy

### Trusted Types
**Status**: ✅ Implemented

The `require-trusted-types-for` directive in CSP enforces Trusted Types API for DOM XSS sink functions, preventing DOM-based XSS attacks.

**CSP Directive**: `require-trusted-types-for 'script';`

**Implementation**:
- ✅ Added `require-trusted-types-for 'script'` to CSP (both HTTP header and meta tag)
- ✅ Created Trusted Types policy in `app-critical.js` for safe HTML sanitization
- ✅ Replaced all `innerHTML` usage with `setInnerHTML()` helper function
- ✅ Policy sanitizes HTML by removing script tags, event handlers, and javascript: URLs

**Trusted Types Policy**:
- Policy name: `'default'`
- Sanitization: Removes `<script>` tags, event handlers (`onclick`, `onerror`, etc.), and `javascript:` URLs
- Fallback: For browsers without Trusted Types support, falls back to direct `innerHTML` assignment

**Protected DOM APIs**:
- `innerHTML` - All usage now goes through Trusted Types policy
- `outerHTML` - Protected by Trusted Types
- `insertAdjacentHTML` - Protected by Trusted Types
- `eval()` - Already blocked by CSP
- `Function()` - Already blocked by CSP

**Security Benefit**: Prevents DOM-based XSS attacks by ensuring only sanitized HTML can be inserted into the DOM.

## Deployment

### GitHub Pages
GitHub Pages doesn't support custom HTTP headers. Security headers are implemented via:
- Meta tags in HTML (CSP, X-Frame-Options, COOP)
- `_headers` file for CDN/proxy configuration

### CDN/Proxy Configuration
When using a CDN (Cloudflare, Netlify, etc.), configure headers from `_headers` file:

1. **Cloudflare**: Use Page Rules or Transform Rules
2. **Netlify**: `_headers` file is automatically used
3. **CloudFront**: Use Lambda@Edge or CloudFront Functions
4. **nginx**: Add headers in server block
5. **Apache**: Use `.htaccess` or virtual host config

### Testing Headers
Use these tools to verify headers are working:
- [SecurityHeaders.com](https://securityheaders.com/)
- [Mozilla Observatory](https://observatory.mozilla.org/)
- Browser DevTools → Network tab → Response Headers

## Security Checklist

- [x] Content Security Policy (CSP) - HTTP header + meta tag (with SHA-256 hashes, no 'unsafe-inline')
- [x] X-Frame-Options - HTTP header (requires CDN/proxy)
- [x] Cross-Origin-Opener-Policy (COOP) - Meta tag + HTTP header
- [ ] X-Content-Type-Options - Requires CDN/proxy
- [ ] Referrer-Policy - Requires CDN/proxy
- [ ] Permissions-Policy - Requires CDN/proxy
- [ ] Strict-Transport-Security (HSTS) - Requires CDN/proxy (start with low max-age)
- [ ] Trusted Types - Future enhancement (requires code refactoring)

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [MDN: X-Frame-Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options)
- [MDN: Cross-Origin-Opener-Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Opener-Policy)
- [MDN: Strict-Transport-Security](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Strict-Transport-Security)
- [OWASP: Security Headers](https://owasp.org/www-project-secure-headers/)

