# Security Headers Configuration

This document describes the security headers implemented for acepaste.xyz to protect against XSS, clickjacking, and other attacks.

## Implemented Headers

### Content Security Policy (CSP)
**Status**: ✅ Implemented via meta tag

The CSP restricts which resources can be loaded and executed, significantly reducing XSS attack risk.

**Current Policy**:
```
default-src 'self';
script-src 'self' 'unsafe-inline' https://app.termly.io https://pagead2.googlesyndication.com;
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
- `script-src`: Allows inline scripts (for dark mode init, loadCSS) and external scripts from Termly and AdSense
- `style-src`: Allows inline styles (critical CSS) and stylesheets from same origin
- `img-src`: Allows images from same origin, data URIs, and HTTPS sources
- `frame-src`: Allows embedding Termly consent UI and AdSense iframes
- `object-src 'none'`: Blocks plugins (Flash, etc.)
- `frame-ancestors 'self'`: Prevents clickjacking (only allows embedding on same origin)

**Future Enhancement**: Consider using nonces for inline scripts to remove `'unsafe-inline'` from script-src.

### X-Frame-Options
**Status**: ✅ Implemented via meta tag

Prevents clickjacking by controlling where the page can be embedded.

**Value**: `SAMEORIGIN` - Page can only be embedded in frames on the same origin.

### Cross-Origin-Opener-Policy (COOP)
**Status**: ✅ Implemented via meta tag

Isolates the top-level window from other documents (pop-ups, iframes) to prevent cross-origin attacks.

**Value**: `same-origin-allow-popups` - Allows same-origin popups while isolating from cross-origin windows.

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

**Current Value** (in `_headers`): `max-age=86400; includeSubDomains` (1 day - for testing)

**Recommended Production Value**: `max-age=31536000; includeSubDomains; preload` (1 year)

**Implementation Notes**:
1. Start with low max-age (1 day) for testing
2. Gradually increase to 1 week, then 1 month, then 1 year
3. Only add `preload` after confirming everything works (preload is permanent)
4. Configure at CDN/proxy level (see `_headers` file)

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

- [x] Content Security Policy (CSP) - Meta tag
- [x] X-Frame-Options - Meta tag
- [x] Cross-Origin-Opener-Policy (COOP) - Meta tag
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

