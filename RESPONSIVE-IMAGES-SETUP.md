# Responsive Images Setup Guide

## Current Implementation

Responsive image markup has been added using `<picture>` elements with:
- **WebP format** (modern, ~30% smaller than JPEG)
- **Multiple sizes** via `srcset`
- **JPEG fallback** for older browsers
- **Proper `sizes` attribute** for optimal selection

## Required Image Files

You need to generate the following optimized images from `brand.jpg`:

### Logo (Header) - 28px display
1. **brand.webp** - 56x56px (1x for standard displays)
2. **brand-2x.webp** - 112x112px (2x for retina displays)
3. **brand.jpg** - 56x56px (fallback, keep existing or resize)
4. **brand-2x.jpg** - 112x112px (fallback for retina)

### Hero Image - 320px display (max-width: 320px)
1. **brand.webp** - 320x320px (mobile, 1x)
2. **brand-640.webp** - 640x640px (mobile retina, tablet)
3. **brand-960.webp** - 960x960px (desktop, high-DPI)
4. **brand.jpg** - 320x320px (fallback)
5. **brand-640.jpg** - 640x640px (fallback)
6. **brand-960.jpg** - 960x960px (fallback)

## Image Generation Commands

### Using ImageMagick (if installed):
```bash
# WebP versions
convert brand.jpg -resize 56x56 -quality 85 brand.webp
convert brand.jpg -resize 112x112 -quality 85 brand-2x.webp
convert brand.jpg -resize 320x320 -quality 85 brand-320.webp
convert brand.jpg -resize 640x640 -quality 85 brand-640.webp
convert brand.jpg -resize 960x960 -quality 85 brand-960.webp

# JPEG fallbacks (optimized)
convert brand.jpg -resize 56x56 -quality 85 -strip brand-56.jpg
convert brand.jpg -resize 112x112 -quality 85 -strip brand-112.jpg
convert brand.jpg -resize 320x320 -quality 85 -strip brand-320.jpg
convert brand.jpg -resize 640x640 -quality 85 -strip brand-640.jpg
convert brand.jpg -resize 960x960 -quality 85 -strip brand-960.jpg
```

### Using cwebp (WebP encoder):
```bash
# Install: brew install webp (macOS) or apt-get install webp (Linux)

# Generate WebP versions
cwebp -q 85 -resize 56 56 brand.jpg -o brand.webp
cwebp -q 85 -resize 112 112 brand.jpg -o brand-2x.webp
cwebp -q 85 -resize 320 320 brand.jpg -o brand-320.webp
cwebp -q 85 -resize 640 640 brand.jpg -o brand-640.webp
cwebp -q 85 -resize 960 960 brand.jpg -o brand-960.webp
```

### Using Online Tools:
1. **Squoosh.app** (recommended):
   - Upload `brand.jpg`
   - Resize to each size (56, 112, 320, 640, 960)
   - Export as WebP (quality 85)
   - Export as JPEG (quality 85) for fallbacks

2. **TinyPNG**:
   - Upload and compress
   - Download optimized versions

## Expected File Sizes

After optimization, target sizes:
- **brand.webp** (56x56): ~2-3KB
- **brand-2x.webp** (112x112): ~5-8KB
- **brand-320.webp** (320x320): ~15-25KB
- **brand-640.webp** (640x640): ~40-60KB
- **brand-960.webp** (960x960): ~80-120KB

**Total**: ~150-220KB (vs 366KB original) = **40-60% reduction**

## Browser Support

- **Modern browsers**: Load WebP (smaller, faster)
- **Older browsers**: Fallback to JPEG automatically
- **No JavaScript required**: Native browser feature

## Performance Impact

### Before (366KB single image):
- Mobile: Downloads 366KB regardless of screen size
- Desktop: Downloads 366KB even if only 320px needed

### After (responsive images):
- Mobile (320px): Downloads ~15-25KB (WebP) or ~30-40KB (JPEG)
- Tablet (640px): Downloads ~40-60KB (WebP) or ~80-100KB (JPEG)
- Desktop (960px): Downloads ~80-120KB (WebP) or ~150-200KB (JPEG)

### Bandwidth Savings:
- **Mobile**: ~340KB saved (93% reduction)
- **Tablet**: ~300KB saved (82% reduction)
- **Desktop**: ~250KB saved (68% reduction)

## Implementation Status

✅ HTML markup updated with responsive image syntax
⏳ Image files need to be generated (see commands above)
⏳ Upload generated images to repository

## Next Steps

1. Generate all image sizes using commands above
2. Upload to repository root directory
3. Test on different devices/screen sizes
4. Verify WebP is loading in modern browsers
5. Verify JPEG fallback works in older browsers



