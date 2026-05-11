// scanner.js — content script.
// Runs in the page's isolated world. Walks all text nodes, counts hostile
// invisible characters using the SAME regex set as cleaner.js, and:
//   1. Reports the count + breakdown to background.js (which sets the toolbar
//      badge — red number = quarantine warning).
//   2. Optionally injects a floating banner ("⚠ N hostile invisible chars
//      detected on this page — click to highlight / quarantine").
//   3. Optionally hooks the `copy` event to substitute cleaned text into the
//      clipboard automatically (the quarantine-on-copy path).
//   4. Optionally hooks the `paste` event to clean text coming INTO the page
//      from any source — including other apps copied to the OS clipboard
//      (the quarantine-on-paste path).
//
// All behaviour is configurable via popup settings (chrome.storage.local).
// cleaner.js is loaded as a sibling content script (see manifest.json) so
// AcePasteCleaner is available on `self`.

(() => {
  'use strict';

  // --- Defaults --------------------------------------------------------------
  // Cleaner-pipeline option keys that the popup persists; mirrored here so we
  // can apply the user's full preset on copy/paste in "full pipeline" mode.
  const CLEAN_OPTION_KEYS = [
    'removeInvisible','removeMarkdown','removeAIMarkup','removeEmojis',
    'removeFormatting','collapseSpaces','collapseNewlines','trimPerLine',
    'removeHtml','removeComments','customFind','customReplace','customRegex',
    'caseTx','punctuation'
  ];

  const SETTINGS_DEFAULTS = {
    // Page scan
    scanEnabled: false,           // walk page text on load (badge + banner)
    bannerEnabled: true,          // show floating banner when hits found
    highlightOnClick: true,       // outline contaminated nodes when banner clicked
    // Quarantine
    quarantineCopy: true,         // intercept copy events, sanitise clipboard
    quarantinePaste: true,        // intercept paste events, sanitise injected text
    quarantineFullPipeline: false,// false = strip invisibles only; true = full clean
    quarantineSilent: false,      // false = show toast on sanitise; true = no toast
    quarantineBypassKey: 'shift', // 'none' | 'shift' | 'alt' | 'ctrl' | 'meta'
    // Per-cleaner defaults (mirrored from popup so full-pipeline mode works
    // even if the user has never opened the popup yet).
    removeInvisible: true,
    removeMarkdown: true,
    removeAIMarkup: true,
    removeEmojis: false,
    removeFormatting: false,
    collapseSpaces: true,
    collapseNewlines: true,
    trimPerLine: true,
    removeHtml: false,
    removeComments: true,
    customFind: '',
    customReplace: '',
    customRegex: false,
    caseTx: '',
    punctuation: []
  };

  const SKIP_TAGS = new Set([
    'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'OBJECT', 'EMBED'
  ]);
  const ATTR_MARK = 'data-ace-paste-flagged';

  let settings = SETTINGS_DEFAULTS;
  let bannerEl = null;
  let flaggedNodes = []; // [{ node: Text, count: number }]

  // Modifier state — tracked via capture-phase key listeners since
  // ClipboardEvent does not expose modifier flags directly.
  const mods = { shift: false, alt: false, ctrl: false, meta: false };

  // --- Settings → cleaner-options projection ---------------------------------
  function fullCleanOpts() {
    const o = {};
    for (const k of CLEAN_OPTION_KEYS) o[k] = settings[k];
    return o;
  }
  function invisibleOnlyOpts() {
    return { removeInvisible: true };
  }
  function pickCleanOpts() {
    return settings.quarantineFullPipeline ? fullCleanOpts() : invisibleOnlyOpts();
  }

  function bypassActive() {
    const key = settings.quarantineBypassKey;
    if (!key || key === 'none') return false;
    return !!mods[key];
  }

  // --- Page scan -------------------------------------------------------------
  function countHostile(str) {
    if (!str || !self.AcePasteCleaner) return 0;
    const m1 = str.match(self.AcePasteCleaner.INVISIBLE_RE_GLOBAL);
    const m2 = str.match(self.AcePasteCleaner.INVISIBLE_SUPPL_RE_GLOBAL);
    return (m1 ? m1.length : 0) + (m2 ? m2.length : 0);
  }

  function walkAndScan(root) {
    flaggedNodes = [];
    if (!self.AcePasteCleaner) return 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    let total = 0, n;
    while ((n = walker.nextNode())) {
      const c = countHostile(n.nodeValue);
      if (c > 0) { total += c; flaggedNodes.push({ node: n, count: c }); }
    }
    return total;
  }

  function reportToBackground(count) {
    try {
      chrome.runtime.sendMessage({
        type: 'ace:scan-result',
        url: location.href,
        count,
        nodeCount: flaggedNodes.length
      });
    } catch { /* extension reloaded */ }
  }

  function showBanner(count) {
    if (!settings.bannerEnabled || count <= 0) return;
    if (bannerEl) bannerEl.remove();
    bannerEl = document.createElement('div');
    bannerEl.id = '__ace-paste-banner';
    bannerEl.setAttribute('role', 'alert');
    // Anchor LEFT EDGE, vertically centered slightly below midline — clear of
    // the toolbar popup (top-right) and the on-page toast (bottom-left), and
    // sits at natural reading height regardless of viewport size.
    Object.assign(bannerEl.style, {
      position: 'fixed', left: '12px', top: '60%', transform: 'translateY(-50%)',
      zIndex: '2147483647',
      background: '#b8261c', color: '#fff',
      font: '600 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      padding: '10px 12px', borderRadius: '8px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
      maxWidth: '320px', cursor: 'pointer', userSelect: 'none'
    });
    const title = document.createElement('div');
    title.textContent = `⚠ ${count} hostile invisible character${count === 1 ? '' : 's'} on this page`;
    const sub = document.createElement('div');
    sub.style.font = '400 11px/1.3 inherit';
    sub.style.marginTop = '4px';
    sub.style.opacity = '0.9';
    const states = [];
    if (settings.quarantineCopy)  states.push('copy');
    if (settings.quarantinePaste) states.push('paste');
    sub.textContent = states.length
      ? `Auto-sanitize on ${states.join(' & ')} is ON. Click to highlight contaminated text.`
      : 'Click to highlight contaminated text. Open Ace Paste to sanitize.';
    bannerEl.appendChild(title);
    bannerEl.appendChild(sub);

    const close = document.createElement('span');
    close.textContent = '×';
    Object.assign(close.style, {
      position: 'absolute', top: '4px', right: '8px', fontSize: '16px',
      lineHeight: '1', cursor: 'pointer', opacity: '0.7'
    });
    close.addEventListener('click', (e) => { e.stopPropagation(); bannerEl.remove(); bannerEl = null; });
    bannerEl.appendChild(close);
    bannerEl.addEventListener('click', () => {
      if (settings.highlightOnClick) highlightFlagged();
    });
    (document.body || document.documentElement).appendChild(bannerEl);
  }

  function highlightFlagged() {
    for (const { node } of flaggedNodes) {
      const p = node.parentElement;
      if (!p || p.hasAttribute(ATTR_MARK)) continue;
      p.setAttribute(ATTR_MARK, 'true');
      p.style.outline = '2px solid #b8261c';
      p.style.outlineOffset = '2px';
      p.style.background = 'rgba(184, 38, 28, 0.08)';
      p.title = 'Contains hostile invisible characters (Ace Paste flag)';
    }
  }

  // --- Toast (success / sanitised-N notice) ----------------------------------
  function toast(msg, color) {
    if (settings.quarantineSilent) return;
    const t = document.createElement('div');
    t.textContent = msg;
    // Toast lives bottom-LEFT (matching the banner's left alignment, and far
    // from the toolbar popup zone).
    Object.assign(t.style, {
      position: 'fixed', bottom: '16px', left: '16px', zIndex: '2147483647',
      background: color || '#1f6b3a', color: '#fff',
      font: '600 12px -apple-system, BlinkMacSystemFont, sans-serif',
      padding: '8px 12px', borderRadius: '6px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
      transition: 'opacity 0.3s'
    });
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; }, 1600);
    setTimeout(() => { t.remove(); }, 2000);
  }

  // --- Quarantine: COPY hook --------------------------------------------------
  function onCopy(e) {
    if (!settings.quarantineCopy) return;
    if (!self.AcePasteCleaner) return;
    if (bypassActive()) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const original = sel.toString();
    if (!original) return;
    const result = self.AcePasteCleaner.cleanText(original, pickCleanOpts());
    const cleaned = result.text;
    if (cleaned === original) return;            // nothing to do
    if (!e.clipboardData) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', cleaned);
    const removed = original.length - cleaned.length;
    const invisibles = result.report.invisible || 0;
    let msg;
    if (settings.quarantineFullPipeline) {
      msg = `🧼 Cleaned copy (-${removed} chars${invisibles ? `, ${invisibles} hostile` : ''})`;
    } else {
      msg = `🧼 Sanitized ${invisibles} hostile char${invisibles === 1 ? '' : 's'} from copy`;
    }
    toast(msg);
  }

  // --- Quarantine: PASTE hook -------------------------------------------------
  function onPaste(e) {
    if (!settings.quarantinePaste) return;
    if (!self.AcePasteCleaner) return;
    if (bypassActive()) return;
    if (!e.clipboardData) return;
    const original = e.clipboardData.getData('text/plain');
    if (!original) return;                       // ignore image-only / file pastes
    const result = self.AcePasteCleaner.cleanText(original, pickCleanOpts());
    const cleaned = result.text;
    if (cleaned === original) return;
    e.preventDefault();
    insertTextAtSelection(e.target, cleaned);
    const removed = original.length - cleaned.length;
    const invisibles = result.report.invisible || 0;
    const msg = settings.quarantineFullPipeline
      ? `🧼 Cleaned paste (-${removed} chars${invisibles ? `, ${invisibles} hostile` : ''})`
      : `🧼 Sanitized ${invisibles} hostile char${invisibles === 1 ? '' : 's'} from paste`;
    toast(msg);
  }

  // Insert text at the current selection in either an <input>/<textarea> or
  // contentEditable element. Preserves undo via execCommand for editables.
  function insertTextAtSelection(target, text) {
    if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
      const start = target.selectionStart;
      const end = target.selectionEnd;
      if (start != null && end != null) {
        const v = target.value;
        target.value = v.slice(0, start) + text + v.slice(end);
        target.selectionStart = target.selectionEnd = start + text.length;
        target.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
    }
    // contentEditable / generic: use execCommand for undo-stack integration.
    try {
      if (document.execCommand('insertText', false, text)) return;
    } catch { /* fall through */ }
    // Fallback: range insertion (no undo entry).
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const node = document.createTextNode(text);
      range.insertNode(node);
      range.setStartAfter(node);
      range.setEndAfter(node);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // --- Modifier-key tracker ---------------------------------------------------
  function trackKey(e, down) {
    mods.shift = e.shiftKey;
    mods.alt   = e.altKey;
    mods.ctrl  = e.ctrlKey;
    mods.meta  = e.metaKey;
    void down;
  }
  window.addEventListener('keydown', (e) => trackKey(e, true), true);
  window.addEventListener('keyup',   (e) => trackKey(e, false), true);
  // Reset modifiers when window loses focus (key-up may not fire).
  window.addEventListener('blur', () => {
    mods.shift = mods.alt = mods.ctrl = mods.meta = false;
  });

  // --- Lifecycle --------------------------------------------------------------
  function loadSettingsAndRun() {
    if (!chrome || !chrome.storage || !chrome.storage.local) return;
    chrome.storage.local.get(SETTINGS_DEFAULTS, (saved) => {
      settings = Object.assign({}, SETTINGS_DEFAULTS, saved);
      // Always attach hooks; they self-gate on settings.* internally so
      // toggles take effect immediately without needing a re-attach.
      document.addEventListener('copy',  onCopy,  true);
      document.addEventListener('paste', onPaste, true);
      if (settings.scanEnabled) runScan();
    });
  }

  function runScan() {
    const count = walkAndScan(document.body || document.documentElement);
    reportToBackground(count);
    if (count > 0) showBanner(count);
  }

  if (chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      let needRescan = false;
      for (const key of Object.keys(changes)) {
        if (key in SETTINGS_DEFAULTS) {
          settings[key] = changes[key].newValue;
          if (key === 'scanEnabled') needRescan = true;
        }
      }
      if (needRescan && settings.scanEnabled) runScan();
      if (!settings.scanEnabled && bannerEl) { bannerEl.remove(); bannerEl = null; }
    });
  }

  if (chrome && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === 'ace:request-scan') {
        const count = walkAndScan(document.body || document.documentElement);
        if (count > 0) showBanner(count);
        sendResponse({ count, nodeCount: flaggedNodes.length });
        return true;
      }
      if (msg && msg.type === 'ace:highlight') {
        highlightFlagged();
        sendResponse({ highlighted: flaggedNodes.length });
        return true;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadSettingsAndRun, { once: true });
  } else {
    loadSettingsAndRun();
  }
})();
