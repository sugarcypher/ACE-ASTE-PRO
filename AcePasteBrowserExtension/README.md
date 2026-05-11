# AcePaste Cleaner — Browser Extension

Manifest V3 Chrome / Edge / Brave extension port of [acepaste.xyz](https://acepaste.xyz). Strips markup, invisible characters, emojis, HTML, comments, and AI debris (`##`, `***`, `+++`) from text. 100% local; nothing leaves the browser.

## Features

- **Toolbar popup** — full cleaner UI with all options (markdown, AI markup, emojis, formatting, HTML, comments, case transforms, punctuation strip, custom find/replace with safe-regex guard) plus a per-clean **report** showing exactly what was removed and how many of each.
- **Hardened invisible-character set, default ON.** Strips:
  - Zero-width chars (U+200B–U+200D), BOM (U+FEFF), LRM/RLM
  - **Trojan Source bidi overrides** (U+202A–U+202E, U+2066–U+2069) — used to hide malicious code in plain sight
  - **Tag characters** (U+E0000–U+E007F) — modern LLM prompt-injection steganography vector
  - **Variation selectors** (U+FE00–U+FE0F, U+E0100–U+E01EF) — Sneaky Bits hidden-data encoding
  - Soft hyphen (U+00AD), Mongolian vowel separator (U+180E), Hangul fillers, Braille blank, word joiner & format chars (U+2060–U+206F)
- **Passive page scanner (opt-in).** Walks every loaded page's text nodes on `document_idle`, counts hostile invisible characters, and surfaces:
  - **Red toolbar badge** with the hit count — instant "this page is contaminated" signal
  - **On-page warning banner** ("⚠ N hostile invisible characters on this page — click to highlight")
  - **Per-node highlighting** — click the banner (or the popup's *Highlight contaminated text* button) to outline every text node containing them
- **Quarantine mode (default ON).** Six independent settings, all in the popup:
  - *Auto-clean text on **copy*** — when you copy from any page, the clipboard receives the cleaned version (default ON)
  - *Auto-clean text on **paste*** — when you paste into any page editable, the inserted text is cleaned first (catches contaminated text from other apps) (default ON)
  - *Apply the **full** cleaner (not just invisibles)* — false: strip only dangerous invisibles, leave everything else; true: apply your full saved cleaner preset (markdown/emoji/HTML/etc.) on every clipboard event (default OFF)
  - *Silent mode* — suppress the on-page "🧼 Sanitized N chars" toast (default OFF)
  - *Bypass key* — hold Shift / Alt / Ctrl / Cmd while copying or pasting to skip cleaning for that single action (default Shift)
  - All hooks are attached unconditionally on every page; toggling settings takes effect instantly without re-attaching
- **Right-click context menu** — three actions on any selection:
  - *Clean & replace selection* (works in `<textarea>`, `<input>`, contentEditable, generic selection)
  - *Clean selection → copy*
  - *Open cleaner with selection*
- **Keyboard shortcuts**
  - `Alt+Shift+V` — open popup
  - `Alt+Shift+C` — clean active selection in place
  - `Cmd/Ctrl+Enter` inside popup paste field — clean
- **Persistence** — option choices, dark mode, advanced-panel state, scanner toggles stored in `chrome.storage.local` (no remote sync, no telemetry).
- **Dark mode** toggle.

## Architecture

```
manifest.json       MV3 manifest (action popup, service worker, content scripts,
                    context menu, commands).
cleaner.js          Pure cleaning engine — single source of truth for the
                    invisible-char alphabet. Exports cleanText(text, opts) →
                    { text, report, errors, … } plus regex constants for the
                    scanner. Loaded by popup.html (classic script), background.js
                    (importScripts), and as a content script (so scanner.js can
                    use it). CommonJS-exported for node smoke tests.
popup.html/.css/.js Toolbar UI: cleaner controls + page-protection toggles
                    (scan / quarantine-on-copy / banner). popup.js wires DOM →
                    cleaner → storage and queries background for per-tab scan
                    counts.
background.js       Service worker. Registers context menu items + keyboard
                    command, runs the cleaner, injects in-page replace/copy via
                    chrome.scripting.executeScript, caches per-tab scan results
                    from scanner.js, drives the toolbar badge.
scanner.js          Content script (runs at document_idle on every page). Walks
                    all text nodes, counts hostile invisibles using the same
                    regex set as cleaner.js, sends the count to background.js,
                    optionally renders an on-page warning banner, optionally
                    hooks the `copy` event to substitute sanitised clipboard
                    text.
icons/              16/32/48/128 PNG icons.
```

The popup never uses `innerHTML` for user-derived content — the report DOM is built node-by-node, so no Trusted Types or DOMPurify dependency is required inside the extension.

## What was changed vs. the web version

Stripped (not relevant in an extension):
- Global Privacy Control detection (no analytics or tracking either way)
- Trusted Types web-script allowlist policy
- Ezoic / ads.txt / Cloudflare worker / nginx configs
- Hero illustration, marketing prose, FAQ/About/Privacy/Security pages

Added:
- MV3 service worker, context menus, keyboard commands
- `chrome.storage.local` for option persistence
- Selection-aware in-page replacement helper
- Compact 420 px-wide popup layout

Kept (verbatim):
- Cleaning regex set (zero-width chars, emojis, markdown, AI markup, HTML, comments)
- Safe-regex guard for user-supplied patterns (`isSafeRegex`)
- Nested-comment removal loop (CodeQL fix from the web repo)

## Install (load unpacked)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Toggle **Developer mode** on.
3. Click **Load unpacked** → select this `AcePasteBrowserExtension/` folder.
4. Pin the toolbar icon if you want one-click access.

## Pack for distribution

Use Chrome's built-in packer:

```
chrome --pack-extension=./AcePasteBrowserExtension
```

Or zip the folder for the Chrome Web Store dashboard:

```
cd AcePasteBrowserExtension
zip -r ../ace-paste-extension.zip . -x ".git/*"
```

## Develop

No build step. Edit any file → click the reload icon on `chrome://extensions`. The cleaner engine is plain ES2020; no transpilation.

Smoke-test the cleaner under node:

```
node -e "const {cleanText} = require('./cleaner.js'); console.log(cleanText('**hi** ​ world', {removeMarkdown:true, removeInvisible:true}))"
```

## Permissions

- `storage` — persist option preferences and scanner toggles
- `contextMenus` — right-click integration
- `scripting` + `activeTab` + `<all_urls>` — inject the in-page replace/copy helper into the active tab on demand AND run the passive page scanner content script. The scanner is **opt-in** via the popup toggle; until enabled it loads but does nothing beyond attaching a no-op copy listener.
- `clipboardWrite` — context-menu "clean & copy" path

No network permissions are requested. The service worker has no `fetch` calls. No telemetry, no remote storage, no analytics.

## License

Same as upstream [ACE-ASTE-PRO](https://github.com/sugarcypher/ACE-ASTE-PRO) — see `../LICENSE`.

## Attribution

Ported from the [AcePaste Cleaner Pro](https://acepaste.xyz) web app by ThinkWell Labs.
