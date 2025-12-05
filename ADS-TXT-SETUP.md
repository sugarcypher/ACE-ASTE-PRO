# ads.txt Setup Guide

## Overview

This guide explains how to set up ads.txt handling for `acepaste.xyz/ads.txt` using Cloudflare Workers (recommended for GitHub Pages).

## Why Cloudflare Worker?

GitHub Pages is a static hosting service and doesn't support:
- ❌ PHP files
- ❌ Apache .htaccess
- ❌ Server-side redirects
- ❌ Dynamic content

**Solution**: Use Cloudflare Worker to intercept `/ads.txt` requests and proxy to the upstream service.

## Setup Instructions

### Step 1: Deploy Cloudflare Worker

1. **Go to Cloudflare Dashboard**
   - Navigate to **Workers & Pages** → **Create Worker**

2. **Create New Worker**
   - Name: `ads-txt-handler` (or any name)
   - Click **Create**

3. **Paste Worker Code**
   - Copy the code from `cloudflare-worker-ads.txt.js`
   - Paste into the Worker editor
   - Click **Save and Deploy**

### Step 2: Configure Route

1. **Add Route**
   - Go to **Workers Routes** (or **Triggers** → **Routes**)
   - Click **Add Route**

2. **Set Route Pattern**
   - Route: `acepaste.xyz/ads.txt`
   - Worker: Select your worker (`ads-txt-handler`)
   - Click **Save**

### Step 3: Set Up KV Storage for Fallback

1. **Create KV Namespace**
   - Go to **Workers & Pages** → **KV**
   - Click **Create a namespace**
   - Name: `ADS_FALLBACK`
   - Click **Add**

2. **Bind KV to Worker**
   - Go to your Worker → **Settings** → **Variables**
   - Scroll to **KV Namespace Bindings**
   - Click **Add binding**
   - Variable name: `ADS_FALLBACK`
   - KV namespace: Select `ADS_FALLBACK`
   - Click **Save**

3. **Add Fallback Content to KV**
   - Go to **Workers & Pages** → **KV** → `ADS_FALLBACK`
   - Click **Add entry**
   - Key: `ads.txt`
   - Value: Your fallback ads.txt content (e.g., `EZOIC-ADS-TXT-FALLBACK` or actual ads.txt content)
   - Click **Save**

   **Or use Wrangler CLI**:
   ```bash
   wrangler kv:key put "ads.txt" --value="your fallback content" --binding=ADS_FALLBACK
   ```

### Step 4: Test

1. **Verify ads.txt is accessible**
   ```bash
   curl https://acepaste.xyz/ads.txt
   ```

2. **Check upstream is working**
   ```bash
   curl https://srv.adstxtmanager.com/19390/acepaste.xyz
   ```

3. **Test fallback** (temporarily break upstream URL in worker to test)

## Alternative: Static ads.txt File

If you don't want to use Cloudflare Workers, you can create a static `ads.txt` file:

1. **Create `ads.txt` in repository root**
   ```txt
   google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
   ```

2. **Commit and push**
   - GitHub Pages will serve it at `acepaste.xyz/ads.txt`

**Limitation**: This won't proxy to the upstream service - it's just a static file.

## Alternative: Redirect (Simple)

If you just want to redirect to the upstream service:

1. **Create `ads.txt` with redirect URL**
   - GitHub Pages doesn't support server-side redirects
   - You'd need to use a meta redirect (not ideal for ads.txt)

2. **Better**: Use Cloudflare Page Rules
   - Go to **Rules** → **Page Rules**
   - Create rule: `acepaste.xyz/ads.txt`
   - Setting: **Forwarding URL** (301 Permanent)
   - Destination: `https://srv.adstxtmanager.com/19390/acepaste.xyz`

## Configuration Details

### Upstream Service
- **URL**: `https://srv.adstxtmanager.com/19390/acepaste.xyz`
- **Purpose**: Centralized ads.txt management
- **Timeout**: 3 seconds (in worker)

### Fallback Behavior
- If upstream fails or times out → serve fallback content from KV storage
- Fallback content stored in KV namespace `ADS_FALLBACK` with key `ads.txt`
- Fallback can be updated via Cloudflare Dashboard or Wrangler CLI without redeploying worker
- Successful upstream responses cached by Cloudflare edge

### Caching
- **Upstream responses**: 1 hour (3600 seconds)
- **Fallback responses**: 5 minutes (300 seconds)
- **Cache-Control headers**: Set appropriately

## Verification

After setup, verify:

1. **Direct access**:
   ```bash
   curl -I https://acepaste.xyz/ads.txt
   ```
   Should return `200 OK` with `Content-Type: text/plain`

2. **Content check**:
   ```bash
   curl https://acepaste.xyz/ads.txt
   ```
   Should show ads.txt content

3. **Google Ads.txt Validator**:
   - Visit: https://adstxt.guru/acepaste.xyz
   - Should show your ads.txt content

## Troubleshooting

### Worker not triggering
- Check route is configured correctly
- Verify worker is deployed
- Check Cloudflare is active for your domain

### Upstream always failing
- Verify upstream URL is correct
- Check if upstream service is accessible
- Review Worker logs in Cloudflare dashboard

### Fallback not working
- Check fallback content in worker code
- Verify fallback is valid ads.txt format
- Test by temporarily breaking upstream URL

## Updating Fallback Content

### Automatic Refresh Script

Use the provided script to automatically fetch and update the fallback:

```bash
./refresh-ads-txt.sh
```

This script:
1. Fetches latest ads.txt from upstream
2. Saves to `ads-fallback.txt` locally
3. Uploads to Cloudflare KV automatically

**Prerequisites**:
- Wrangler CLI installed: `npm install -g wrangler`
- Logged in to Cloudflare: `npx wrangler login`
- KV namespace `ADS_FALLBACK` exists and is bound to your worker

### Manual Update

1. **Via Cloudflare Dashboard**:
   - Go to **Workers & Pages** → **KV** → `ADS_FALLBACK`
   - Edit the `ads.txt` entry
   - Update value with new content
   - Click **Save**

2. **Via Wrangler CLI**:
   ```bash
   npx wrangler kv:key put ads.txt --value="your content here" --binding=ADS_FALLBACK
   ```

### Scheduled Refresh (Optional)

Set up a cron job to automatically refresh the fallback:

```bash
# Add to crontab (runs daily at 2 AM)
0 2 * * * cd /path/to/ACE-ASTE-PRO && ./refresh-ads-txt.sh
```

Or use GitHub Actions to run it periodically (see `.github/workflows/` for examples).

## Notes

- **Free Cloudflare plan** supports Workers (100,000 requests/day)
- **Performance**: Worker adds ~10-50ms latency (negligible)
- **Reliability**: Fallback ensures ads.txt is always available
- **Caching**: Reduces load on upstream service
- **KV Updates**: Can be updated without redeploying worker

## Files

- `cloudflare-worker-ads.txt.js` - Worker code
- `refresh-ads-txt.sh` - Script to refresh fallback content
- `ads-fallback.txt` - Local fallback content (updated by refresh script)
- `ADS-TXT-SETUP.md` - This guide

