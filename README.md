# AcePaste

Client-side paste cleaner. Strips markup, invisible characters, emojis, HTML, URLs, and cruft. Works on GitHub Pages.

## Use

1. Place these files in a repo. Enable GitHub Pages. Root or `/docs` both work.
2. Ensure `assets/logo.jpg` exists. This project includes one.
3. Open the Pages URL. Paste text in the top box. Click the logo or press Ctrl/⌘+Enter.

## Dev notes

- Pure HTML/CSS/JS. No build step.
- All cleaning done locally in the browser.
- Custom rules support regex. Stored in localStorage.

## Monetization ideas

- "Copy cleaner" bookmarklet upsell.
- Pro presets and bulk cleaning as downloadable pack.
- Donate link or small ad slot under metrics.
