# Caching Strategy for Optimal Performance

## Current Implementation

### Versioned Assets
All static assets (CSS, JS, images) now use query string versioning (`?v=1.0`) to enable long cache lifetimes while allowing cache busting on updates.

**Benefits:**
- Browsers can cache assets for 1 year (or longer)
- Updates automatically invalidate cache by changing version number
- Repeat visits load instantly from browser cache

### Cache Headers (CDN/Hosting Level)

For optimal caching, configure at your CDN or hosting provider:

#### Recommended Cache-Control Headers:

```
# Static assets (CSS, JS, images) - Cache for 1 year
/styles.css?v=* → Cache-Control: public, max-age=31536000, immutable
/app.js?v=* → Cache-Control: public, max-age=31536000, immutable
/*.jpg?v=* → Cache-Control: public, max-age=31536000, immutable
/*.png?v=* → Cache-Control: public, max-age=31536000, immutable
/*.webp?v=* → Cache-Control: public, max-age=31536000, immutable

# HTML files - Cache for 1 hour (shorter for content updates)
/*.html → Cache-Control: public, max-age=3600, must-revalidate
```

## Implementation Options

### Option 1: Cloudflare (Recommended)
If using Cloudflare in front of GitHub Pages:
1. Go to Cloudflare Dashboard → Rules → Page Rules
2. Add rule: `acepaste.xyz/*.css`, `acepaste.xyz/*.js`, `acepaste.xyz/*.jpg`
3. Set Cache Level: Cache Everything
4. Set Edge Cache TTL: 1 year

### Option 2: GitHub Pages + Service Worker
Implement a service worker to cache assets with long lifetimes:
- Cache static assets for 1 year
- Update on version change
- Works offline

### Option 3: Netlify/Vercel
If migrating to Netlify or Vercel:
- Use `_headers` file (Netlify) or `vercel.json` (Vercel)
- Configure cache headers as shown above

## Version Management

**To update assets and bust cache:**
1. Increment version number in HTML: `?v=1.0` → `?v=1.1`
2. Deploy changes
3. Users automatically get new version on next visit

## Expected Performance Impact

### First Visit
- Normal load time (no cache)

### Repeat Visits (with long cache)
- **CSS/JS**: Loaded from browser cache (~0ms)
- **Images**: Loaded from browser cache (~0ms)
- **HTML**: Fresh fetch (1 hour cache)
- **Total**: ~90% faster than first visit

### Metrics Improvement
- **Repeat Visit FCP**: < 500ms (vs ~2s first visit)
- **Repeat Visit LCP**: < 1s (vs ~2.5s first visit)
- **Bandwidth Saved**: ~400KB per repeat visit

## Best Practices

1. **Version on every deployment** - Update version string when assets change
2. **Use immutable cache** - For versioned assets, use `immutable` directive
3. **HTML shorter cache** - Keep HTML cache short (1 hour) for content updates
4. **Monitor cache hit rates** - Use analytics to track cache effectiveness

