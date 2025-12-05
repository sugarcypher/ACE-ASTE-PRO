# Security Headers Configuration

This document describes the security headers implemented for acepaste.xyz to protect against XSS, clickjacking, and other attacks.

## Implemented Headers

### Content Security Policy (CSP)
**Status**: ✅ Implemented via meta tag and HTTP header (in `_headers`)

The CSP restricts which resources can be loaded and executed, significantly reducing XSS attack risk.

**Current Policy**:
```
default-src 'self';
script-src 'self' 'sha256-712bfa754fe3855d3d08005957bf0fddfe3ec7d3614533ee83580505b56092ce' 'sha256-42990002847620bd43394d03506c00174cf9f20728e4f8e0bdd34280b13d37d4' https://app.termly.io https://pagead2.googlesyndication.com 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://app.termly.io https://pagead2.googlesyndication.com;
frame-src 'self' https://app.termly.io https://googleads.g.doubleclick.net;
object-src 'none';
base-uri 'self';
form-action 'self';
frame-ancestors 'self';
upgrade-insecure-requests;
```

**Directives Explained**:
- `default-src 'self'`: Only allow resources from same origin by default
- `script-src`: 
  - `'self'`: Allows scripts from same origin
  - `'sha256-...'`: SHA-256 hashes for inline scripts (loadCSS polyfill and dark mode init)
  - `https://app.termly.io https://pagead2.googlesyndication.com`: External scripts from Termly and AdSense
  - `'strict-dynamic'`: Allows scripts loaded by trusted scripts (e.g., AdSense inline scripts created dynamically)
  - **No `'unsafe-inline'`**: Removed for better security - using hashes instead
- `style-src`: Allows inline styles (critical CSS) and stylesheets from same origin
- `img-src`: Allows images from same origin, data URIs, and HTTPS sources
- `frame-src`: Allows embedding Termly consent UI and AdSense iframes
- `object-src 'none'`: Blocks plugins (Flash, etc.)
- `frame-ancestors`: Not supported in meta tags - must be set via HTTP header (see `_headers` file)

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
**Status**: 📋 Future Enhancement

The `require-trusted-types-for` directive in CSP would enforce Trusted Types API for DOM XSS sink functions.

**Implementation**: This requires refactoring JavaScript to use Trusted Types API:
- Replace `innerHTML` with `textContent` or Trusted Types
- Use `DOMPurify` or similar for HTML sanitization
- Create Trusted Types policies for dynamic content

**Example CSP Addition**:
```
require-trusted-types-for 'script';
```

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

