# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**AcePaste Cleaner Pro** (acepaste.xyz) — a client-side text cleaning tool that strips markup, invisible characters, emojis, HTML, and formatting. Pure HTML/CSS/JS with no build step. All cleaning runs locally in the browser; no data leaves the client.

## Development

- **No build step.** Open `index.html` directly or serve with any static server.
- **Hosting:** GitHub Pages (primary), with `_headers`/`_redirects` files for Cloudflare Pages/Netlify if deployed there.
- **CNAME:** `acepaste.xyz`

## Deploy workflow

Every push to `main` deploys live to acepaste.xyz in ~18 seconds via `.github/workflows/deploy.yml`. There is no staging — reverting a change requires another commit.

## Architecture

- **`index.html`** — Main SPA page with inline Trusted Types policy, CSP meta tag, and structured data (JSON-LD).
- **`app-critical.js`** — Core application logic loaded immediately: text cleaning engine (`cleanText()`), clipboard operations, dark mode, GPC/privacy detection. All cleaning options (invisible chars, markdown, emoji, HTML, comments, custom regex, case transforms, punctuation) are processed here.
- **`app.js`** — Older/duplicate version of the app logic. Note: `index.html` loads `app-critical.js`, not `app.js`. Kept around for reference; not active.
- **`styles.css` / `styles.min.css`** — Hand-written CSS with dark mode support via `.dark-mode` class on `body`.
- **`public/`** — Alternate deployment directory with copies of core files. `public/index.html` is a separate version.

## Key Patterns

- **Trusted Types:** A default Trusted Types policy is defined inline in `index.html <head>` to sanitize HTML and validate script URLs against an allowlist. `app-critical.js` uses `setInnerHTML()` helper to go through this policy.
- **CSP:** Content Security Policy is set both via `<meta http-equiv>` in HTML and via `_headers` for platforms that support HTTP headers. Uses script hash allowlisting (no `unsafe-inline`).
- **No third-party consent script:** Site uses no cookies that require a banner. Termly / Gatekeeper-style consent platforms were removed; CSP no longer allowlists any third-party host for scripts or connections (only Supabase for auth + the YouTube no-cookie host for the demo iframe).
- **No ad platform is present, and the privacy claim depends on that staying true.** Ezoic was removed: as of 2026-09-15 there are zero `ezoic` references in `app-critical.js`, `index.html` or any shipped asset (an earlier version of this file documented an "Ezoic button contrast fix" that no longer existed — that line is gone). **Open item:** `ads.txt` is still tracked and deployed, declaring a Google AdSense publisher (`pub-4869006740630468`, DIRECT), along with `ADS-TXT-SETUP.md`, `refresh-ads-txt.sh`, `monitor-ads-txt.sh` and `nginx-ads.txt.conf`. `ads.txt` is an inert text declaration — it loads nothing and tracks nobody, so the "all cleaning runs locally, no data leaves the client" claim holds today — but it is a public statement that this domain sells ad inventory, on a site that serves no ads. Either remove it and the four helper files, or keep it deliberately and know it is inconsistent with how the site presents itself.
- **Reintroducing any ad or analytics script breaks three things at once** and must not be done casually: the site's stated privacy guarantee, the CSP (which allowlists by script hash with no `unsafe-inline`, so a new inline or remote script fails closed), and the Trusted Types `createScriptURL` origin allowlist. For a tool whose entire premise is stripping hidden material out of text that users paste in, a third-party script that can read that textarea is the single most damaging thing that could ship here. Treat it as a product-integrity constraint, not a preference.
- **DOM performance:** `getElement()` caches DOM lookups. DOM writes are batched in `requestAnimationFrame()` to avoid forced reflows.
- **Privacy:** GPC (Global Privacy Control) detection disables personalized ads. Dark mode preference stored in-memory only (not localStorage) in the critical path.
- **Custom rules:** Users can define find/replace with optional regex, stored client-side.

## Security Considerations

- Any change to inline `<script>` content in `index.html` will break the CSP — the corresponding `sha256-*` hash in both the `<meta>` CSP tag and `_headers` must be updated.
- The Trusted Types `createScriptURL` callback maintains an allowlist of trusted origins. New third-party scripts must be added there.
- HTML comment removal uses a loop (`do/while`) to handle nested comments — this was a CodeQL fix (see commit history).

## Other Pages

`about.html`, `faq.html`, `privacy.html`, `privacy-eu.html`, `privacy-ca.html`, `cookie-policy.html`, `security.html` — static legal/info pages sharing the same CSS and header structure.
