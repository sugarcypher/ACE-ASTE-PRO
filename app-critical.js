// Critical JavaScript - loads immediately
// Dark mode toggle (dark mode class already applied via inline script for FOUC prevention)
// Cache DOM elements to reduce repeated queries
let elements = {};

// =============================================================================
// CORE PROMISE: INVISIBLE CHARACTER REMOVAL
// =============================================================================
// This is the *primary* reason this tool exists. It must NEVER be weakened,
// gated behind a checkbox, gated behind a tier, made optional, or skipped.
// Always run. Always remove. Add new ranges, never subtract.
//
// Adding a character to this regex is good. Removing one is wrong.
// If you find new invisible/zero-width/non-printing chars in the wild, ADD them.
// =============================================================================
// Uses Unicode property escapes to match EVERY character in the Unicode "Format"
// general category (\p{Cf}) — that's 161+ characters across every script in the
// Unicode standard, automatically updated as Unicode grows. Plus variation
// selectors (which are technically Mn, not Cf) and a handful of other invisible
// chars that aren't in any standard category.
//
// What this catches without needing a manual list:
//  - Soft hyphen, combining grapheme joiner
//  - Arabic letter mark, Syriac abbreviation mark, Arabic disputed end of ayah
//  - Hangul/Khmer/Mongolian fillers and inherent vowels
//  - All zero-width chars: ZWSP, ZWNJ, ZWJ, LRM, RLM
//  - All bidi formatting (LRE, RLE, PDF, LRO, RLO, LRI, RLI, FSI, PDI)
//  - Word joiner, invisible operators, deprecated bidi
//  - BOM, halfwidth Hangul filler, interlinear annotation chars
//  - Egyptian hieroglyph format controls
//  - Shorthand format controls
//  - Musical notation format characters
//  - Tag characters (U+E0000-E007F) — used for prompt injection
//  - All variation selectors (U+180B-180D, U+FE00-FE0F, U+E0100-E01EF)
// \p{Cf} catches all "Format" category chars — but several invisible chars
// are misclassified by Unicode as other categories and need explicit listing.
//
// Lo (Letter, other) — invisible "letter" characters:
//   U+115F  Hangul Choseong Filler
//   U+1160  Hangul Jungseong Filler
//   U+17B4  Khmer Vowel Inherent Aq
//   U+17B5  Khmer Vowel Inherent Aa
//   U+3164  Hangul Filler  ← commonly used as invisible "letter"
//   U+FFA0  Halfwidth Hangul Filler
//
// Mn (Mark, nonspacing) — invisible combining marks and variation selectors:
//   U+034F        Combining Grapheme Joiner
//   U+180B-180D   Mongolian Free Variation Selectors 1-3
//   U+FE00-FE0F   Variation Selectors 1-16
//   U+E0100-E01EF Variation Selectors Supplement (17-256)
const INVISIBLE_CHAR_REGEX = /\p{Cf}|[\u0085\u034F\u115F\u1160\u17B4\u17B5\u2028\u2029\u3164\uFFA0]|[\u180B-\u180D\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu;
// \u0085 \u2014 NEL / NEXT LINE (C1 control, Cc \u2014 not Cf, used as hidden line break)
// \u2028 \u2014 LINE SEPARATOR (Zl \u2014 not Cf, can break JS strings, used in injection)
// \u2029 \u2014 PARAGRAPH SEPARATOR (Zp \u2014 not Cf, same risk as \u2028)

// Classify an invisible/format codepoint by attack-surface severity.
// CRITICAL: real attack surface — tag-character prompt-injection payloads,
//   bidirectional override attacks (Trojan Source style).
// HIGH:     stealth / steganography vectors — zero-width, soft hyphen,
//   Hangul fillers, combining grapheme joiner. Almost always intentional.
// MEDIUM:   sometimes legit but abusable — variation selectors (emoji
//   skin-tone is fine; data-hiding is not), Unicode whitespace, line/para
//   separators, NEL.
function classifyInvisibleCodepoint(cp) {
  if (cp >= 0xE0000 && cp <= 0xE007F)
    return { key:'tag',         severity:'critical', label:'Unicode tag character (prompt-injection payload)' };
  if ((cp >= 0x202A && cp <= 0x202E) || (cp >= 0x2066 && cp <= 0x2069) || cp === 0x061C)
    return { key:'bidi',        severity:'critical', label:'Bidi override (visual-reorder attack vector)' };
  if (cp === 0x200B || cp === 0x200C || cp === 0x200D || cp === 0x2060 || cp === 0xFEFF)
    return { key:'zerowidth',   severity:'high',     label:'Zero-width / word-joiner' };
  if (cp === 0x00AD)
    return { key:'softhyphen',  severity:'high',     label:'Soft hyphen' };
  if (cp >= 0x180B && cp <= 0x180F)
    return { key:'mongolian',   severity:'high',     label:'Mongolian variation/free selector' };
  if (cp === 0x1160 || cp === 0x3164 || cp === 0xFFA0)
    return { key:'hangul',      severity:'high',     label:'Hangul filler (visual-spoof vector)' };
  if (cp === 0x034F)
    return { key:'cgj',         severity:'high',     label:'Combining grapheme joiner' };
  if (cp === 0x070F)
    return { key:'syriac',      severity:'high',     label:'Syriac abbreviation mark' };
  if (cp >= 0xFFF9 && cp <= 0xFFFB)
    return { key:'interlinear', severity:'high',     label:'Interlinear annotation marker' };
  if (cp >= 0xFE00 && cp <= 0xFE0F)
    return { key:'variation',   severity:'medium',   label:'Variation selector' };
  if (cp >= 0xE0100 && cp <= 0xE01EF)
    return { key:'variation',   severity:'medium',   label:'Variation selector supplement' };
  if (cp >= 0x2000 && cp <= 0x200A)
    return { key:'unispace',    severity:'medium',   label:'Unicode whitespace (non-breaking, em/en, etc.)' };
  if (cp === 0x2028 || cp === 0x2029)
    return { key:'lineparasep', severity:'medium',   label:'Line / paragraph separator' };
  if (cp === 0x0085)
    return { key:'nel',         severity:'medium',   label:'Next-line control character' };
  return   { key:'other',       severity:'medium',   label:'Other invisible / format character' };
}

function stripInvisibleChars(text) {
  let count = 0;
  const byCategory = Object.create(null); // key -> { count, severity, label, codepoints: {U+xxxx -> count} }
  const out = text.replace(INVISIBLE_CHAR_REGEX, (ch) => {
    count++;
    const cp = ch.codePointAt(0);
    const cls = classifyInvisibleCodepoint(cp);
    const cpKey = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    let bucket = byCategory[cls.key];
    if (!bucket) {
      bucket = { count: 0, severity: cls.severity, label: cls.label, codepoints: Object.create(null) };
      byCategory[cls.key] = bucket;
    }
    bucket.count++;
    bucket.codepoints[cpKey] = (bucket.codepoints[cpKey] || 0) + 1;
    return '';
  });
  if (count > 0 && typeof console !== 'undefined') {
    console.log('[ACEPASTE] stripped', count, 'invisible char(s) across', Object.keys(byCategory).length, 'categor(ies)');
  }
  return { text: out, count, byCategory };
}

// =============================================================================
// SMART PUNCTUATION NORMALIZATION
// =============================================================================
// Maps "smart" / typographic / Unicode punctuation to plain ASCII equivalents.
// Useful for code, terminals, and any context that doesn't render Unicode well.
// Add to this map freely — every entry is a one-way mapping to ASCII.
// =============================================================================
const SMART_PUNCT_MAP = {
  // Smart double quotes
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"',
  '\u00AB': '"', '\u00BB': '"', '\u2033': '"', '\u2036': '"',
  // Smart single quotes / apostrophes
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u201B': "'",
  '\u2039': "'", '\u203A': "'", '\u2032': "'", '\u2035': "'",
  // Dashes and hyphens
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2013': '-',
  '\u2014': '-', '\u2015': '-', '\u2212': '-',
  // Ellipsis
  '\u2026': '...',
  // Bullets / middle dots
  '\u2022': '*', '\u00B7': '*', '\u2027': '*', '\u2043': '-',
  // Spaces (normalize to regular space)
  '\u00A0': ' ', '\u2000': ' ', '\u2001': ' ', '\u2002': ' ',
  '\u2003': ' ', '\u2004': ' ', '\u2005': ' ', '\u2006': ' ',
  '\u2007': ' ', '\u2008': ' ', '\u2009': ' ', '\u200A': ' ',
  '\u202F': ' ', '\u205F': ' ', '\u3000': ' ',
  // Math operators commonly substituted
  '\u00D7': 'x', '\u00F7': '/', '\u2212': '-',
  // Fraction slash
  '\u2044': '/',
  // Primes and similar
  '\u2034': "'''", '\u2037': "'''",
  // Brackets / quotes uncommon
  '\u300C': '"', '\u300D': '"', '\u300E': '"', '\u300F': '"',
  '\u3008': '<', '\u3009': '>', '\u300A': '<<', '\u300B': '>>',
  // Currency that has ASCII fallback (only the obvious ones)
  // (left intentionally minimal — most currency symbols have no ASCII equivalent)
};

const SMART_PUNCT_REGEX = new RegExp(
  '[' + Object.keys(SMART_PUNCT_MAP).join('') + ']',
  'g'
);

function normalizeSmartPunctuation(text) {
  let count = 0;
  const replacements = Object.create(null); // U+xxxx -> { from, to, count }
  const out = text.replace(SMART_PUNCT_REGEX, ch => {
    count++;
    const to = SMART_PUNCT_MAP[ch] || ch;
    const cpKey = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    let bucket = replacements[cpKey];
    if (!bucket) {
      bucket = { from: ch, to: to, count: 0 };
      replacements[cpKey] = bucket;
    }
    bucket.count++;
    return to;
  });
  return { text: out, count, replacements };
}

// Self-test on load: verify invisible removal still works for many scripts.
// Catches regression if the regex ever gets weakened.
(function selfTestInvisible() {
  // 12 invisible chars from many languages/categories
  const sample = 'a\u200Bb\u00ADc\u202Ed\u2060e\uFEFFf\uFE0Fg\u061Ch\u3164i\u070Fj\u034Fk\u180El\uFFFAm\u2028n\u2029o\u0085p';
  const expected = 'abcdefghijklmnop';
  const result = stripInvisibleChars(sample);
  if (result.text !== expected) {
    console.error('[ACEPASTE] CRITICAL: invisible character self-test FAILED. Got:', JSON.stringify(result.text), 'expected:', JSON.stringify(expected));
  }
})();

// Trusted Types policy is created inline in the head before third-party scripts load
// This ensures the policy exists before any third-party scripts load
// We just need to get a reference to the policy for our own use
let trustedTypesPolicy = null;
if (window.trustedTypes && window.trustedTypes.defaultPolicy) {
  trustedTypesPolicy = window.trustedTypes.defaultPolicy;
}

// ── Freemium gate ─────────────────────────────────────────────────────────
// Plan is set by auth.js via sessionStorage. Falls back to 'free' silently.
const FREE_CHAR_LIMIT = 2000;

// Demo gates EVERYTHING except the always-on invisible-character removal.
// removeInvisible is intentionally NOT in this list — it's the one cleaning
// option Demo users get. Every other checkbox is locked + force-unchecked
// when the user is on the Demo (free) plan.
const PREMIUM_FEATURE_IDS = [
  'removeMarkdown','removeAIMarkup','removeEmojis','removeFormatting',
  'normalizeSmartPunct','privacyMode',
  'collapseSpaces','collapseNewlines','trimPerLine',
  'removeHtml','removeNumerals','removeDates','removeSymbolPairs',
  'removeComments',
  'customFind','customReplace','customRegex',
  'removePunctuation'
];
const PREMIUM_CASE_RADIOS = true; // all caseTx radios are premium

function _getAcePlan() {
  try {
    const s = JSON.parse(sessionStorage.getItem('acepaste_sub') || 'null');
    if (!s) return 'free';
    if (s.expiresAt && Date.now() / 1000 > s.expiresAt) return 'free';
    return s.plan || 'free';
  } catch(e) { return 'free'; }
}

function acePasteIsPaidWeb() {
  return _getAcePlan() !== 'free';
}

/** Lock or unlock premium features in the UI based on current plan. */
function applyFreemiumUI() {
  const paid = acePasteIsPaidWeb();

  // Lock/unlock checkboxes + inputs
  for (const id of PREMIUM_FEATURE_IDS) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (paid) {
      el.disabled = false;
      const lbl = el.closest('label') || el.parentElement;
      if (lbl) lbl.classList.remove('ace-premium-locked');
    } else {
      el.disabled = true;
      el.checked  = false;
      const lbl = el.closest('label') || el.parentElement;
      if (lbl) lbl.classList.add('ace-premium-locked');
    }
  }

  // Lock/unlock case-transform radios
  if (PREMIUM_CASE_RADIOS) {
    document.querySelectorAll('input[name="caseTx"]').forEach(r => {
      if (r.value === 'none') return;
      if (paid) {
        r.disabled = false;
        const lbl = r.closest('label') || r.parentElement;
        if (lbl) lbl.classList.remove('ace-premium-locked');
      } else {
        r.disabled = true;
        if (r.checked) { r.checked = false; document.getElementById('caseTxNone') && (document.getElementById('caseTxNone').checked = true); }
        const lbl = r.closest('label') || r.parentElement;
        if (lbl) lbl.classList.add('ace-premium-locked');
      }
    });
  }

  // Show/hide upgrade nudge
  const nudge = document.getElementById('upgradeNudge');
  if (nudge) nudge.style.display = paid ? 'none' : '';
}

// Helper function to safely set innerHTML using Trusted Types
function setInnerHTML(element, html) {
  if (trustedTypesPolicy) {
    element.innerHTML = trustedTypesPolicy.createHTML(html);
  } else {
    // Fallback for browsers without Trusted Types support
    element.innerHTML = html;
  }
}

function getElement(id) {
  if (!elements[id]) {
    elements[id] = document.getElementById(id);
  }
  return elements[id];
}

// In-memory dark mode preference (no localStorage for privacy)
let darkModePreference = null;

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  darkModePreference = isDark; // Store in memory only
  updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
  const toggle = getElement('darkModeToggle');
  if (toggle) {
    toggle.textContent = isDark ? '☀️' : '🌙';
  }
}


// Lazy load third-party scripts after page load to reduce initial bundle size
function loadTermlyScript() {
  if (window.termlyLoaded) return;
  window.termlyLoaded = true;
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://app.termly.io/resource-blocker/da56ec80-6621-4889-a102-bf6598ab88ae?autoBlock=on';
  // SRI cannot be pinned: Termly updates this resource server-side.
  // Integrity is enforced via the Trusted Types createScriptURL allowlist instead.
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

// Basic event listeners - load on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Update dark mode icon on load (dark mode class applied by default in HTML)
  updateDarkModeIcon(true);

  // Lazy load Termly resource blocker and handler only when consent link is clicked
  const consentLinks = document.querySelectorAll('.termly-display-preferences');
  consentLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      // Load Termly resource blocker script first (if not already loaded)
      loadTermlyScript();
      // Load Termly handler script only when needed
      if (!window.termlyHandlerLoaded) {
        const script = document.createElement('script');
        script.src = '/app-termly.js?v=1.0';
        script.integrity = 'sha384-osftMLwri1ylK62yKFnxFqz9fg9T5jq1E3aAo/o1umwrUPRl5CtO6nc4Vkm3UUwk';
        script.crossOrigin = 'anonymous';
        script.onload = () => {
          if (window.handleTermlyPreferences) {
            window.handleTermlyPreferences();
          }
        };
        document.head.appendChild(script);
        window.termlyHandlerLoaded = true;
      } else if (window.handleTermlyPreferences) {
        window.handleTermlyPreferences();
      }
    });
  });

  // TOS acceptance check
  if (!localStorage.getItem('tosAccepted')) {
    const tosModal = getElement('tosModal');
    if (tosModal) { tosModal.classList.remove('hidden'); tosModal.style.display = ''; }
  }
  const tosAcceptBtn = getElement('tosAccept');
  if (tosAcceptBtn) {
    tosAcceptBtn.addEventListener('click', () => {
      localStorage.setItem('tosAccepted', '1');
      const tosModal = getElement('tosModal');
      if (tosModal) { tosModal.classList.add('hidden'); tosModal.style.display = 'none'; }
    });
  }
  const tosDeclineBtn = getElement('tosDecline');
  if (tosDeclineBtn) {
    tosDeclineBtn.addEventListener('click', () => {
      window.location.href = 'https://www.google.com';
    });
  }
  
  // Dark mode toggle
  const darkModeToggle = getElement('darkModeToggle');
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }
  
  // Initialize Global Privacy Control (GPC) - lightweight
  initGlobalPrivacyControl();

  // ── Auth + freemium gate ──────────────────────────────────────────────────
  // Apply UI immediately from cached session (sync, no flash).
  if (typeof applyFreemiumUI === 'function') applyFreemiumUI();

  // Update header account link to reflect sign-in state.
  function updateAccountLink(plan, email) {
    const link = document.getElementById('hdrAccountLink');
    if (!link) return;
    if (email) {
      link.textContent = plan && plan !== 'free' ? '✓ Account' : 'Account';
      link.title = email;
    }
  }
  if (typeof acePasteEmail === 'function') {
    updateAccountLink(
      typeof acePasteCurrentPlan === 'function' ? acePasteCurrentPlan() : 'free',
      acePasteEmail()
    );
  }

  // Listen for async plan resolution (after network call).
  window.addEventListener('acepaste:auth', function(e) {
    if (typeof applyFreemiumUI === 'function') applyFreemiumUI();
    updateAccountLink(e.detail && e.detail.plan, e.detail && e.detail.email);
  });

  // Kick off server-side plan refresh (dispatches acepaste:auth when done).
  if (typeof acePasteRefreshPlan === 'function') acePasteRefreshPlan();

  // Core button handlers - cache elements
  const cleanBtn = getElement('cleanBtn');
  const pasteBtn = getElement('pasteBtn');
  const clearBtn = getElement('clearBtn');
  const clearInputBtn = getElement('clearInputBtn');
  const copyBtn = getElement('copyBtn');
  const moreOptions = getElement('moreOptions');
  const optionsToggle = getElement('optionsToggle');

  if (cleanBtn) cleanBtn.addEventListener('click', cleanText);
  if (pasteBtn) pasteBtn.addEventListener('click', pasteFromClipboard);
  if (clearBtn) clearBtn.addEventListener('click', clearFields);
  if (clearInputBtn) clearInputBtn.addEventListener('click', clearInputOnly);
  if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
  if (optionsToggle) {
    optionsToggle.addEventListener('click', () => {
      const panel = optionsToggle.closest('.options-panel');
      const body = getElement('optionsBody');
      if (!panel || !body) return;
      const isCollapsed = panel.classList.contains('options-collapsed');
      if (isCollapsed) {
        panel.classList.remove('options-collapsed');
        body.hidden = false;
        optionsToggle.setAttribute('aria-expanded', 'true');
      } else {
        panel.classList.add('options-collapsed');
        body.hidden = true;
        optionsToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }
  if (moreOptions) {
    moreOptions.addEventListener('click', () => {
      const adv = getElement('advanced');
      const btn = getElement('moreOptions');
      // Read state BEFORE modifying DOM to avoid forced reflow
      const isHidden = adv.classList.contains('hidden');
      // Batch DOM writes together
      if (isHidden) {
        adv.classList.remove('hidden');
        btn.textContent = 'Advanced options ▴';
      } else {
        adv.classList.add('hidden');
        btn.textContent = 'Advanced options ▾';
      }
    });
  }
  
  // Batch find/replace row management
  const addBatchRow = getElement('addBatchRow');
  if (addBatchRow) {
    addBatchRow.addEventListener('click', () => {
      const container = document.getElementById('batchFindReplace');
      const rows = container.querySelectorAll('.batch-row');
      if (rows.length >= 25) {
        alert('Maximum of 25 find/replace pairs reached.');
        return;
      }
      const rowIndex = rows.length;
      const row = document.createElement('div');
      row.className = 'batch-row';
      row.setAttribute('data-row', rowIndex);
      setInnerHTML(row, '<input class="input-small batch-find" placeholder="Find text or /regex/"><input class="input-small batch-replace" placeholder="Replace with (empty to remove)"><button type="button" class="batch-remove" aria-label="Remove row" title="Remove row">&times;</button>');
      container.appendChild(row);
    });
  }

  // Delegate click for batch row remove buttons
  const batchContainer = document.getElementById('batchFindReplace');
  if (batchContainer) {
    batchContainer.addEventListener('click', (e) => {
      if (e.target.classList.contains('batch-remove')) {
        const rows = batchContainer.querySelectorAll('.batch-row');
        if (rows.length > 1) {
          e.target.closest('.batch-row').remove();
        }
      }
    });
  }

});

// In-memory GPC preference (no localStorage for privacy)
let gpcOptOut = false;

function initGlobalPrivacyControl() {
  const gpcEnabled = navigator.globalPrivacyControl === true || 
                     navigator.doNotTrack === '1' ||
                     (typeof navigator.globalPrivacyControl !== 'undefined' && navigator.globalPrivacyControl);
  
  gpcOptOut = gpcEnabled; // Store in memory only
}


async function pasteFromClipboard() {
  const pasteField = getElement('paste');
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      pasteField.value = text;
      pasteField.focus();
      return;
    } catch (err) {
      // Clipboard API failed - fallback to manual paste
    }
  }
  pasteField.focus();
  pasteField.select();
}

function clearFields() {
  const pasteField = getElement('paste');
  const cleanedField = getElement('cleaned');
  const reportDiv = getElement('cleaningReport');
  // Batch all DOM writes together
  pasteField.value = '';
  cleanedField.value = '';
  if (reportDiv) {
    reportDiv.classList.add('hidden');
    setInnerHTML(reportDiv, '');
  }
  pasteField.focus();
}

function clearInputOnly() {
  const pasteField = getElement('paste');
  if (!pasteField) return;
  pasteField.value = '';
  pasteField.focus();
}

async function copyToClipboard() {
  const cleanedField = getElement('cleaned');
  const copyBtn = getElement('copyBtn');
  const text = cleanedField.value;
  if (!text) {
    alert('Nothing to copy. Clean some text first!');
    return;
  }
  // Read textContent BEFORE any DOM writes to avoid forced reflow
  const originalText = copyBtn.textContent;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      // Batch style changes together
      requestAnimationFrame(() => {
        copyBtn.textContent = 'Copied!';
        copyBtn.style.background = 'linear-gradient(#2fd163, #28b856)';
      });
      setTimeout(() => {
        requestAnimationFrame(() => {
          copyBtn.textContent = originalText;
          copyBtn.style.background = '';
        });
      }, 2000);
      return;
    }
    cleanedField.select();
    cleanedField.setSelectionRange(0, 99999);
    document.execCommand('copy');
    // Batch style changes together
    requestAnimationFrame(() => {
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = 'linear-gradient(#2fd163, #28b856)';
    });
    setTimeout(() => {
      requestAnimationFrame(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      });
    }, 2000);
  } catch (err) {
    alert('Failed to copy to clipboard. Please select and copy manually.');
  }
}

function cleanText() {
  try {
    const pasteField = getElement('paste');
    const cleanedField = getElement('cleaned');
    let text = pasteField.value;
    if (!text) {
      cleanedField.value = '';
      const reportDiv = getElement('cleaningReport');
      if (reportDiv) {
        reportDiv.classList.add('hidden');
        setInnerHTML(reportDiv, '');
      }
      return;
    }
  
  const originalLength = text.length;
  const report = {
    zeroWidth: 0,
    markdown: 0,
    aiMarkup: 0,
    emojis: 0,
    formatting: 0,
    spaces: 0,
    newlines: 0,
    html: 0,
    comments: 0,
    punctuation: 0,
    numerals: 0,
    dates: 0,
    symbolPairs: 0,
    smartPunct: 0,
    custom: 0,
    // Detail breakdowns populated by stripInvisibleChars / normalizeSmartPunctuation
    invisibleByCategory: null,
    smartPunctReplacements: null
  };
  
  // DIAGNOSTIC: log all non-ASCII characters present in the input so we can
  // see exactly what's there. Helps debug "but I know there are invisible
  // characters in it" situations. Visible in browser console (F12).
  if (typeof console !== 'undefined') {
    const nonAsciiMap = {};
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if (cp > 127) {
        const key = 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
        nonAsciiMap[key] = (nonAsciiMap[key] || 0) + 1;
      }
    }
    const total = Object.values(nonAsciiMap).reduce((a, b) => a + b, 0);
    if (total > 0) {
      console.log('[ACEPASTE] input has', total, 'non-ASCII char(s):', nonAsciiMap);
    }
  }

  // CORE PROMISE: invisible character removal. ALWAYS runs, no opt-out.
  // The checkbox in the UI is informational — even if a future bug unchecks
  // it, this still runs. This is the reason this tool exists.
  {
    const stripped = stripInvisibleChars(text);
    text = stripped.text;
    report.zeroWidth = stripped.count;
    report.invisibleByCategory = stripped.byCategory;
  }

  // Smart punctuation normalization (curly quotes, em dash, ellipsis, etc.)
  if (getElement('normalizeSmartPunct') && getElement('normalizeSmartPunct').checked) {
    const normalized = normalizeSmartPunctuation(text);
    text = normalized.text;
    report.smartPunct = normalized.count;
    report.smartPunctReplacements = normalized.replacements;
  }
  
  if (getElement('removeEmojis').checked) {
    const beforeEmojis = text.length;
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2300}-\u{23FF}]|[\u{24C2}-\u{1F251}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    const emojiSequenceRegex = /[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{200D}]/gu;
    text = text.replace(emojiRegex, '').replace(emojiSequenceRegex, '');
    report.emojis = beforeEmojis - text.length;
  }
  
  if (getElement('removeFormatting').checked) {
    const beforeFormatting = text.length;
    text = text.replace(/[\u00AD\u2000-\u200B\u2028-\u2029\uFEFF]/g, '');
    text = text.replace(/\u00A0/g, ' ');
    report.formatting = beforeFormatting - text.length;
  }
  
  if (getElement('removeMarkdown').checked) {
    const beforeMarkdown = text.length;
    text = text.replace(/(?:^|\s)(#{1,6})\s/gm, ' ');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*\n]+?)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_\n\s]+?)_/g, '$1');
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
    text = text.replace(/^>\s+/gm, '');
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
    report.markdown = beforeMarkdown - text.length;
  }
  
  if (getElement('removeAIMarkup').checked) {
    const beforeAI = text.length;
    text = text.replace(/(\*{2,}|\*{3,}|#{2,}|\+{2,}|={2,}|-{2,}|_{2,})/g, '');
    report.aiMarkup = beforeAI - text.length;
  }
  
  // Advanced options always run when their checkbox is checked,
  // regardless of whether the Advanced panel is expanded in the UI.
  {
    if (getElement('collapseSpaces').checked) {
      const beforeSpaces = text.length;
      text = text.replace(/[ \t]+/g, ' ');
      report.spaces = beforeSpaces - text.length;
    }
    
    if (getElement('collapseNewlines').checked) {
      const beforeNewlines = text.length;
      text = text.replace(/\n{3,}/g, '\n\n');
      report.newlines = beforeNewlines - text.length;
    }
    
    if (getElement('trimPerLine').checked) {
      text = text.split('\n').map(l => l.trim()).join('\n');
    }
    
    if (getElement('removeHtml').checked) {
      const beforeHTML = text.length;
      text = text.replace(/<|>/g, '');
      report.html = beforeHTML - text.length;
    }
    
    if (getElement('removeComments').checked) {
      const beforeComments = text.length;
      text = text.replace(/#\s*(italic|bold|comment)[^\n]*/gi, '');
      text = text.replace(/\/\/[^\n]*/g, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');
      let prevText;
      do {
        prevText = text;
        text = text.replace(/<!--[\s\S]*?-->/g, '');
      } while (text !== prevText);
      report.comments = beforeComments - text.length;
    }
    
    const caseTxRadio = document.querySelector('input[name="caseTx"]:checked');
    if (caseTxRadio) {
      const caseTx = caseTxRadio.value;
      if (caseTx === 'upper') text = text.toUpperCase();
      else if (caseTx === 'lower') text = text.toLowerCase();
      else if (caseTx === 'capitalize') {
        text = text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      } else if (caseTx === 'title') {
        const skip = ['a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
        text = text.split(' ').map((w, i) => {
          const lower = w.toLowerCase();
          if (i === 0 || !skip.includes(lower)) {
            return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
          }
          return lower;
        }).join(' ');
      }
    }
    
    const punctuationSelect = getElement('removePunctuation');
    if (punctuationSelect) {
      const selectedPunctuation = Array.from(punctuationSelect.selectedOptions).map(opt => opt.value);
      if (selectedPunctuation.length > 0) {
        const beforePunctuation = text.length;
        const escaped = selectedPunctuation.map(p => p.replace(/[.*+?^${}()[\]\\|]/g, '\\$&'));
        const punctuationRegex = new RegExp('[' + escaped.join('') + ']', 'g');
        text = text.replace(punctuationRegex, '');
        report.punctuation = beforePunctuation - text.length;
      }
    }
    
    // Remove numerals
    if (getElement('removeNumerals') && getElement('removeNumerals').checked) {
      const beforeNumerals = text.length;
      text = text.replace(/[0-9]/g, '');
      report.numerals = beforeNumerals - text.length;
    }

    // Remove dates (all common formats)
    if (getElement('removeDates') && getElement('removeDates').checked) {
      const beforeDates = text.length;
      const months = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
      // ISO: 2025-01-31, 2025/01/31
      text = text.replace(/\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/g, '');
      // US/EU: 01/31/2025, 31-01-2025, 01.31.2025
      text = text.replace(/\b\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}\b/g, '');
      // Month DD, YYYY or Month DD YYYY
      const monthDayYear = new RegExp(months + '\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s*\\d{2,4}', 'gi');
      text = text.replace(monthDayYear, '');
      // DD Month YYYY
      const dayMonthYear = new RegExp('\\b\\d{1,2}(?:st|nd|rd|th)?\\s+' + months + ',?\\s*\\d{2,4}', 'gi');
      text = text.replace(dayMonthYear, '');
      // Month DD (no year)
      const monthDay = new RegExp(months + '\\s+\\d{1,2}(?:st|nd|rd|th)?\\b', 'gi');
      text = text.replace(monthDay, '');
      report.dates = beforeDates - text.length;
    }

    // Remove symbol+word pairs — user-defined
    if (getElement('removeSymbolPairs') && getElement('removeSymbolPairs').checked) {
      const beforeSymbol = text.length;

      // 1. Exact-match removal: remove specific strings the user listed
      const listEl = getElement('symbolPairsList');
      if (listEl && listEl.value.trim()) {
        const entries = listEl.value.split('\n').map(s => s.trim()).filter(Boolean);
        entries.forEach(entry => {
          // Escape for regex, then replace all occurrences
          const escaped = entry.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          text = text.replace(new RegExp(escaped, 'g'), '');
        });
      }

      // 2. Smart mode: remove any token containing user-specified symbol chars
      const smartMode = getElement('symbolPairsSmartMode');
      const symbolCharsEl = getElement('symbolChars');
      if (smartMode && smartMode.checked && symbolCharsEl && symbolCharsEl.value.trim()) {
        const symbols = symbolCharsEl.value.trim().split(/\s+/).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        if (symbols.length > 0) {
          const symbolClass = '[' + symbols.join('') + ']';
          // Symbol-prefixed tokens: $100, #tag, @user
          const prefixRe = new RegExp(symbolClass + '[^\\s]+', 'g');
          text = text.replace(prefixRe, '');
          // Symbol-suffixed tokens: user:, 100%
          const suffixRe = new RegExp('[^\\s]+' + symbolClass + '(?=\\s|$)', 'g');
          text = text.replace(suffixRe, '');
        }
      }

      report.symbolPairs = beforeSymbol - text.length;
    }

    // Batch find/replace
    const batchContainer = document.getElementById('batchFindReplace');
    const useRegex = getElement('batchRegex') && getElement('batchRegex').checked;
    if (batchContainer) {
      const rows = batchContainer.querySelectorAll('.batch-row');
      let totalCustom = 0;
      rows.forEach(row => {
        const findInput = row.querySelector('.batch-find');
        const replaceInput = row.querySelector('.batch-replace');
        if (findInput && findInput.value) {
          try {
            const beforeCustom = text.length;
            if (useRegex) {
              const regex = new RegExp(findInput.value, 'g');
              text = text.replace(regex, replaceInput ? replaceInput.value : '');
            } else {
              text = text.split(findInput.value).join(replaceInput ? replaceInput.value : '');
            }
            totalCustom += Math.abs(beforeCustom - text.length);
          } catch (e) {
            // Regex error - skip this row
          }
        }
      });
      report.custom = totalCustom;
    }
  }
  
  const finalLength = text.length;
  const totalRemoved = originalLength - finalLength;
  displayCleaningReport(report, originalLength, finalLength, totalRemoved);
  getElement('cleaned').value = text;
  } catch (error) {
    alert('An error occurred while cleaning the text. Please try again.');
  }
}

function displayCleaningReport(report, originalLength, finalLength, totalRemoved) {
  const reportDiv = getElement('cleaningReport');
  if (!reportDiv) return;

  // tiny escaper — DOMPurify also runs via Trusted Types, but defence in depth
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  // Format a {U+xxxx: count} dict into "U+200B ×3, U+E0061 ×1" (cap at 8 distinct codepoints)
  const fmtCps = (cps) => {
    const entries = Object.entries(cps).sort((a, b) => b[1] - a[1]);
    const head = entries.slice(0, 8).map(([k, n]) => esc(k) + (n > 1 ? ' ×' + n : '')).join(', ');
    const more = entries.length - 8;
    return head + (more > 0 ? `, +${more} more` : '');
  };

  // Visible glyph for a smart-punct mapping: show the literal char in a
  // mono-spaced block. The chars in SMART_PUNCT_MAP are all printable.
  const fmtSamples = (reps) => {
    const entries = Object.entries(reps).sort((a, b) => b[1].count - a[1].count);
    const head = entries.slice(0, 6).map(([cp, b]) =>
      `<code class="rep-cp">${esc(cp)}</code> <code class="rep-glyph">${esc(b.from)}</code> &rarr; <code class="rep-glyph">${esc(b.to)}</code> &times;${b.count}`
    ).join(' &middot; ');
    const more = entries.length - 6;
    return head + (more > 0 ? ` <span class="rep-more">+${more} more</span>` : '');
  };

  // Build items list, each {severity, title, count, action, detailHtml?}
  const items = [];

  // ─── Invisible characters, broken down by category ──────────────────────
  const inv = report.invisibleByCategory || {};
  for (const key of Object.keys(inv)) {
    const b = inv[key];
    items.push({
      severity: b.severity,
      title: b.label,
      count: b.count,
      action: b.severity === 'critical' ? 'Stripped (security)' : 'Removed',
      detailHtml: `<span class="report-codepoints">${fmtCps(b.codepoints)}</span>`
    });
  }

  // ─── Smart punctuation normalization (in-place substitutions) ───────────
  if (report.smartPunct > 0 && report.smartPunctReplacements) {
    items.push({
      severity: 'low',
      title: 'Smart punctuation normalized to ASCII',
      count: report.smartPunct,
      action: 'Replaced in place',
      detailHtml: `<span class="report-samples">${fmtSamples(report.smartPunctReplacements)}</span>`
    });
  }

  // ─── Bulk-removal categories with no codepoint detail ───────────────────
  const bulk = [
    { key: 'html',        sev: 'medium', label: 'HTML tags',                         action: 'Removed' },
    { key: 'comments',    sev: 'medium', label: 'Code / HTML comments',              action: 'Removed' },
    { key: 'aiMarkup',    sev: 'medium', label: 'AI markup runs (##, ***, +++)',     action: 'Removed' },
    { key: 'emojis',      sev: 'low',    label: 'Emoji characters',                  action: 'Removed' },
    { key: 'formatting',  sev: 'low',    label: 'Format / soft-break characters',    action: 'Removed' },
    { key: 'markdown',    sev: 'low',    label: 'Markdown formatting',               action: 'Stripped' },
    { key: 'spaces',      sev: 'low',    label: 'Extra spaces',                      action: 'Collapsed' },
    { key: 'newlines',    sev: 'low',    label: 'Extra newlines',                    action: 'Collapsed' },
    { key: 'punctuation', sev: 'low',    label: 'Punctuation',                       action: 'Removed' },
    { key: 'numerals',    sev: 'low',    label: 'Numeric digits',                    action: 'Removed' },
    { key: 'dates',       sev: 'low',    label: 'Date strings',                      action: 'Removed' },
    { key: 'symbolPairs', sev: 'low',    label: 'Symbol+word tokens',                action: 'Removed' },
    { key: 'custom',      sev: 'low',    label: 'Custom find/replace rules',         action: 'Replaced' }
  ];
  for (const b of bulk) {
    const n = report[b.key];
    if (n && n > 0) {
      items.push({ severity: b.sev, title: b.label, count: n, action: b.action, detailHtml: '' });
    }
  }

  // Sort by severity (critical first), then by count desc within same severity.
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  items.sort((a, b) => (sevOrder[a.severity] - sevOrder[b.severity]) || (b.count - a.count));

  // ─── Build HTML ────────────────────────────────────────────────────────
  let html = '<h3>Cleaning report</h3>';

  if (items.length === 0) {
    html += `
      <div class="report-section severity-info">
        <div class="severity-badge">CLEAN</div>
        <div class="report-title">Nothing suspicious found.</div>
        <div class="report-detail"><span class="report-action">No invisible characters, no markup, no formatting changes.</span></div>
      </div>`;
  } else {
    // Highest-severity present drives a small banner
    const highest = items[0].severity;
    if (highest === 'critical') {
      html += `<div class="report-banner severity-critical">⚠ <strong>Critical:</strong> a known prompt-injection / visual-spoof vector was present in your text. Removed.</div>`;
    } else if (highest === 'high') {
      html += `<div class="report-banner severity-high">▲ <strong>Heads up:</strong> stealth / steganography characters were present. Removed.</div>`;
    }
    for (const it of items) {
      html += `
        <div class="report-section severity-${esc(it.severity)}">
          <div class="severity-badge">${esc(it.severity)}</div>
          <div class="report-title">${esc(it.title)}</div>
          <div class="report-detail">
            <span class="report-count">${it.count} ${it.count === 1 ? 'char' : 'chars'}</span>
            <span class="report-action">${esc(it.action)}</span>
            ${it.detailHtml || ''}
          </div>
        </div>`;
    }
  }

  // Total summary line — same logic as before, three cases.
  const inPlaceChanges = report.smartPunct || 0;
  let summary;
  if (totalRemoved !== 0) {
    const pct = originalLength > 0 ? ((totalRemoved / originalLength) * 100).toFixed(1) : '0.0';
    summary = `${originalLength} → ${finalLength} chars (${totalRemoved} removed, ${pct}%`;
    if (inPlaceChanges > 0) summary += `; ${inPlaceChanges} normalized in place`;
    summary += ')';
  } else if (inPlaceChanges > 0) {
    summary = `${originalLength} chars (${inPlaceChanges} normalized in place — length unchanged)`;
  } else {
    summary = `${originalLength} chars (no changes)`;
  }
  html += `<div class="report-total">${esc(summary)}</div>`;

  setInnerHTML(reportDiv, html);
  reportDiv.classList.remove('hidden');
}

