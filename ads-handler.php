<?php
/**
 * PHP handler for ads.txt
 * 
 * This script:
 * 1. Fetches ads.txt from upstream service
 * 2. Falls back to local file if upstream fails
 * 3. Serves as plain text
 * 
 * NOTE: GitHub Pages does NOT support PHP
 * This is for self-hosted Apache/PHP servers only
 * 
 * For GitHub Pages: Use Cloudflare Worker (see cloudflare-worker-ads.txt.js)
 */

$remote = "https://srv.adstxtmanager.com/81161/acepaste.xyz";
$fallback = __DIR__ . "/ads-fallback.txt";

// Try to fetch from upstream
$result = @file_get_contents($remote);

// Set content type
header("Content-Type: text/plain");

// Serve upstream content if valid, otherwise serve fallback
if ($result && strlen($result) > 20) {
    echo $result;
} else {
    // Serve fallback file
    if (file_exists($fallback)) {
        echo file_get_contents($fallback);
    } else {
        // Ultimate fallback if file doesn't exist
        echo "# ads.txt fallback\n# Upstream unavailable and fallback file not found";
    }
}

exit;
?>

