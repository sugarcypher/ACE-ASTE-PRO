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

### Step 3: Update Fallback Content

1. **Edit Worker Code**
   - In the Worker editor, find the `fallback` variable
   - Replace placeholder content with your actual ads.txt content
   - Example:
   ```javascript
   const fallback = `google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0
example.com, pub-1111111111111111, RESELLER`;
   ```

2. **Or Use KV Storage (Advanced)**
   - Create a KV namespace: **Workers & Pages** → **KV**
   - Bind it to your worker
   - Store fallback content in KV
   - Update worker to read from KV

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
- If upstream fails or times out → serve fallback content
- Fallback is cached for 5 minutes
- Successful upstream responses cached for 1 hour

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

## Notes

- **Free Cloudflare plan** supports Workers (100,000 requests/day)
- **Performance**: Worker adds ~10-50ms latency (negligible)
- **Reliability**: Fallback ensures ads.txt is always available
- **Caching**: Reduces load on upstream service

## Files

- `cloudflare-worker-ads.txt.js` - Worker code
- `ads-fallback.txt` - Fallback content (reference only, not used by worker)
- `ADS-TXT-SETUP.md` - This guide

