#!/bin/bash
# Monitoring script to detect ads.txt mismatches between upstream and fallback
# 
# This script:
# 1. Fetches ads.txt from upstream
# 2. Compares hash with local fallback file
# 3. Alerts if they differ (indicating fallback needs update)
#
# Usage:
#   ./monitor-ads-txt.sh
#   Or add to crontab for periodic checks

set -e

UPSTREAM_URL="https://srv.adstxtmanager.com/19390/acepaste.xyz"
FALLBACK_FILE="ads-fallback.txt"

echo "🔍 Checking ads.txt sync status..."
echo ""

# Fetch upstream content and calculate hash
echo "📥 Fetching upstream: $UPSTREAM_URL"
UPSTREAM_CONTENT=$(curl -sL "$UPSTREAM_URL" || echo "")
if [ -z "$UPSTREAM_CONTENT" ]; then
    echo "❌ Failed to fetch upstream content"
    exit 1
fi

UPSTREAM_HASH=$(echo -n "$UPSTREAM_CONTENT" | sha256sum | cut -d' ' -f1)
echo "   Upstream hash: $UPSTREAM_HASH"

# Calculate fallback hash
if [ ! -f "$FALLBACK_FILE" ]; then
    echo "❌ Fallback file not found: $FALLBACK_FILE"
    exit 1
fi

FALLBACK_HASH=$(sha256sum "$FALLBACK_FILE" | cut -d' ' -f1)
echo "   Fallback hash: $FALLBACK_HASH"
echo ""

# Compare hashes
if [ "$UPSTREAM_HASH" != "$FALLBACK_HASH" ]; then
    echo "⚠️  [WARNING] ads.txt mismatch detected at $(date)"
    echo ""
    echo "   Upstream and fallback files differ!"
    echo "   Consider running: ./refresh-ads-txt.sh"
    echo ""
    
    # Optional: Send notification
    # Uncomment and configure one of these:
    
    # Email notification (requires mail command)
    # echo "ads.txt mismatch detected. Run refresh-ads-txt.sh to update fallback." | mail -s "ads.txt Alert" admin@example.com
    
    # Slack webhook (replace with your webhook URL)
    # curl -X POST -H 'Content-type: application/json' \
    #   --data "{\"text\":\"⚠️ ads.txt mismatch detected. Run refresh-ads-txt.sh to update fallback.\"}" \
    #   https://hooks.slack.com/services/YOUR/WEBHOOK/URL
    
    # Log to file
    echo "[$(date)] WARNING: ads.txt mismatch - upstream hash: $UPSTREAM_HASH, fallback hash: $FALLBACK_HASH" >> ads-txt-monitor.log
    
    exit 1
else
    echo "✅ ads.txt files are in sync"
    echo "[$(date)] OK: ads.txt files are in sync (hash: $UPSTREAM_HASH)" >> ads-txt-monitor.log
    exit 0
fi

