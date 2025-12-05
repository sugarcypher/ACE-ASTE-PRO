#!/bin/bash
# Script to refresh ads.txt fallback in Cloudflare KV
# This script fetches the latest ads.txt from upstream and updates the KV storage

set -e

URL="https://srv.adstxtmanager.com/81161/acepaste.xyz"
LOCAL="ads-fallback.txt"

echo "🔄 Refreshing ads.txt fallback..."

# Fetch from upstream
echo "📥 Fetching from upstream: $URL"
if curl -sL "$URL" -o "$LOCAL"; then
    echo "✅ Downloaded to $LOCAL"
    
    # Check if file has content
    if [ -s "$LOCAL" ]; then
        echo "📊 File size: $(wc -c < "$LOCAL") bytes"
        
        # Upload to Cloudflare KV
        echo "☁️  Uploading to Cloudflare KV..."
        if npx wrangler kv:key put ads.txt "`cat $LOCAL`" --binding=ADS_FALLBACK; then
            echo "✅ Successfully updated Cloudflare KV!"
            echo "   The fallback will be used if upstream fails."
        else
            echo "❌ Failed to upload to Cloudflare KV"
            echo "   Make sure you're logged in: npx wrangler login"
            echo "   And that the KV namespace is bound to your worker"
            exit 1
        fi
    else
        echo "❌ Downloaded file is empty"
        exit 1
    fi
else
    echo "❌ Failed to fetch from upstream"
    exit 1
fi

echo ""
echo "✨ Done! Fallback content updated in Cloudflare KV."

