#!/bin/bash
# Image optimization script for brand.jpg
# Generates optimized WebP and JPEG versions at different sizes

set -e

SOURCE="brand.jpg"
QUALITY=85

echo "🖼️  Optimizing brand.jpg images..."
echo ""

# Check if source exists
if [ ! -f "$SOURCE" ]; then
    echo "❌ Error: $SOURCE not found!"
    exit 1
fi

# Function to resize with sips (macOS built-in)
resize_sips() {
    local size=$1
    local output=$2
    echo "  Creating ${output} (${size}x${size})..."
    sips -z $size $size "$SOURCE" --out "$output" >/dev/null 2>&1
}

# Function to resize with ImageMagick
resize_imagemagick() {
    local size=$1
    local output=$2
    echo "  Creating ${output} (${size}x${size})..."
    convert "$SOURCE" -resize "${size}x${size}" -quality $QUALITY -strip "$output"
}

# Function to create WebP with cwebp
create_webp() {
    local input=$1
    local output=$2
    if command -v cwebp >/dev/null 2>&1; then
        echo "  Creating ${output}..."
        cwebp -q $QUALITY "$input" -o "$output" >/dev/null 2>&1
    else
        echo "  ⚠️  cwebp not found, skipping WebP creation"
        return 1
    fi
}

# Detect available tools
if command -v sips >/dev/null 2>&1; then
    RESIZE_CMD="sips"
elif command -v convert >/dev/null 2>&1; then
    RESIZE_CMD="imagemagick"
else
    echo "❌ Error: No image resizing tool found!"
    echo "   Install ImageMagick: brew install imagemagick"
    echo "   Or use macOS built-in sips (should be available)"
    exit 1
fi

# Create optimized JPEG versions
echo "📦 Creating optimized JPEG versions..."
if [ "$RESIZE_CMD" = "sips" ]; then
    resize_sips 56 "brand-56.jpg"
    resize_sips 112 "brand-112.jpg"
    resize_sips 320 "brand-320.jpg"
    resize_sips 640 "brand-640.jpg"
    resize_sips 960 "brand-960.jpg"
else
    resize_imagemagick 56 "brand-56.jpg"
    resize_imagemagick 112 "brand-112.jpg"
    resize_imagemagick 320 "brand-320.jpg"
    resize_imagemagick 640 "brand-640.jpg"
    resize_imagemagick 960 "brand-960.jpg"
fi

# Create WebP versions if cwebp is available
if command -v cwebp >/dev/null 2>&1; then
    echo ""
    echo "📦 Creating WebP versions..."
    create_webp "brand-56.jpg" "brand-56.webp"
    create_webp "brand-112.jpg" "brand-112.webp"
    create_webp "brand-320.jpg" "brand-320.webp"
    create_webp "brand-640.jpg" "brand-640.webp"
    create_webp "brand-960.jpg" "brand-960.webp"
else
    echo ""
    echo "⚠️  WebP creation skipped (install: brew install webp)"
fi

# Show file sizes
echo ""
echo "✅ Optimization complete! File sizes:"
echo ""
ls -lh brand-*.{jpg,webp} 2>/dev/null | awk '{print "  " $9 ": " $5}'
echo ""
echo "📊 Total size comparison:"
ORIGINAL_SIZE=$(stat -f%z "$SOURCE" 2>/dev/null || stat -c%s "$SOURCE" 2>/dev/null)
echo "  Original: $(numfmt --to=iec-i --suffix=B $ORIGINAL_SIZE 2>/dev/null || echo "${ORIGINAL_SIZE} bytes")"
echo ""
echo "💡 Next steps:"
echo "  1. Review the generated images"
echo "  2. Update HTML to use responsive images (see updated index.html)"
echo "  3. Commit and push the optimized images"



