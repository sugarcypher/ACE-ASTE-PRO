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
const INVISIBLE_CHAR_REGEX = /\p{Cf}|[\u034F\u115F\u1160\u17B4\u17B5\u3164\uFFA0]|[\u180B-\u180D\uFE00-\uFE0F]|[\u{E0100}-\u{E01EF}]/gu;

function stripInvisibleChars(text) {
  let count = 0;
  const removedHex = [];
  const out = text.replace(INVISIBLE_CHAR_REGEX, (ch) => {
    count++;
    if (removedHex.length < 50) {
      removedHex.push('U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
    }
    return '';
  });
  if (count > 0 && typeof console !== 'undefined') {
    console.log('[ACEPASTE] stripped', count, 'invisible char(s):', removedHex.join(' '));
  }
  return { text: out, count };
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
  const out = text.replace(SMART_PUNCT_REGEX, ch => {
    count++;
    return SMART_PUNCT_MAP[ch] || ch;
  });
  return { text: out, count };
}

// Self-test on load: verify invisible removal still works for many scripts.
// Catches regression if the regex ever gets weakened.
(function selfTestInvisible() {
  // 12 invisible chars from many languages/categories
  const sample = 'a\u200Bb\u00ADc\u202Ed\u2060e\uFEFFf\uFE0Fg\u061Ch\u3164i\u070Fj\u034Fk\u180El\uFFFAm';
  const expected = 'abcdefghijklm';
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


// Basic event listeners - load on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // Update dark mode icon on load (dark mode class applied by default in HTML)
  updateDarkModeIcon(true);

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
  
  // Core button handlers - cache elements
  const cleanBtn = getElement('cleanBtn');
  const pasteBtn = getElement('pasteBtn');
  const clearBtn = getElement('clearBtn');
  const copyBtn = getElement('copyBtn');
  const moreOptions = getElement('moreOptions');
  
  if (cleanBtn) cleanBtn.addEventListener('click', cleanText);
  if (pasteBtn) pasteBtn.addEventListener('click', pasteFromClipboard);
  if (clearBtn) clearBtn.addEventListener('click', clearFields);
  if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
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
    // Batch class and innerHTML changes together
    requestAnimationFrame(() => {
      reportDiv.classList.add('hidden');
      setInnerHTML(reportDiv, '');
    });
  }
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
        // Batch DOM writes together
        requestAnimationFrame(() => {
          reportDiv.classList.add('hidden');
          setInnerHTML(reportDiv, '');
        });
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
    custom: 0
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
  }

  // Smart punctuation normalization (curly quotes, em dash, ellipsis, etc.)
  if (getElement('normalizeSmartPunct') && getElement('normalizeSmartPunct').checked) {
    const normalized = normalizeSmartPunctuation(text);
    text = normalized.text;
    report.smartPunct = normalized.count;
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

    // Remove symbol+word pairs
    if (getElement('removeSymbolPairs') && getElement('removeSymbolPairs').checked) {
      const beforeSymbol = text.length;
      // Match tokens where a symbol char is directly adjacent to alphanumeric chars
      // e.g. $4.43, user:, #tag, @mention, 100%, C++
      // Symbol prefix: $100, #tag, @user
      text = text.replace(/[^\w\s][^\s]*[a-zA-Z0-9][^\s]*/g, function(match) {
        // Only remove if there's at least one symbol and one alphanumeric
        if (/[^\w\s]/.test(match) && /[a-zA-Z0-9]/.test(match)) return '';
        return match;
      });
      // Alphanumeric prefix with symbol suffix: user:, 100%, C++
      text = text.replace(/[a-zA-Z0-9][^\s]*[^\w\s]+/g, function(match) {
        if (/[^\w\s]/.test(match) && /[a-zA-Z0-9]/.test(match)) return '';
        return match;
      });
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
  // Build HTML first, then batch DOM writes together to avoid forced reflows
  let html = '<h3>Cleaning Report</h3><ul>';
  let hasItems = false;
  if (report.zeroWidth > 0) {
    html += `<li class="report-item"><span class="report-label">Invisible characters removed</span><span class="report-count">${report.zeroWidth}</span></li>`;
    hasItems = true;
  }
  if (report.emojis > 0) {
    html += `<li class="report-item"><span class="report-label">Emojis removed</span><span class="report-count">${report.emojis} chars</span></li>`;
    hasItems = true;
  }
  if (report.formatting > 0) {
    html += `<li class="report-item"><span class="report-label">Formatting characters removed</span><span class="report-count">${report.formatting} chars</span></li>`;
    hasItems = true;
  }
  if (report.markdown > 0) {
    html += `<li class="report-item"><span class="report-label">Markdown formatting removed</span><span class="report-count">${report.markdown} chars</span></li>`;
    hasItems = true;
  }
  if (report.aiMarkup > 0) {
    html += `<li class="report-item"><span class="report-label">AI markup removed</span><span class="report-count">${report.aiMarkup} chars</span></li>`;
    hasItems = true;
  }
  if (report.spaces > 0) {
    html += `<li class="report-item"><span class="report-label">Extra spaces collapsed</span><span class="report-count">${report.spaces} chars</span></li>`;
    hasItems = true;
  }
  if (report.newlines > 0) {
    html += `<li class="report-item"><span class="report-label">Extra newlines collapsed</span><span class="report-count">${report.newlines} chars</span></li>`;
    hasItems = true;
  }
  if (report.html > 0) {
    html += `<li class="report-item"><span class="report-label">HTML tags removed</span><span class="report-count">${report.html} chars</span></li>`;
    hasItems = true;
  }
  if (report.comments > 0) {
    html += `<li class="report-item"><span class="report-label">Comments removed</span><span class="report-count">${report.comments} chars</span></li>`;
    hasItems = true;
  }
  if (report.punctuation > 0) {
    html += `<li class="report-item"><span class="report-label">Punctuation removed</span><span class="report-count">${report.punctuation} chars</span></li>`;
    hasItems = true;
  }
  if (report.numerals > 0) {
    html += `<li class="report-item"><span class="report-label">Numerals removed</span><span class="report-count">${report.numerals} chars</span></li>`;
    hasItems = true;
  }
  if (report.dates > 0) {
    html += `<li class="report-item"><span class="report-label">Dates removed</span><span class="report-count">${report.dates} chars</span></li>`;
    hasItems = true;
  }
  if (report.symbolPairs > 0) {
    html += `<li class="report-item"><span class="report-label">Symbol+word pairs removed</span><span class="report-count">${report.symbolPairs} chars</span></li>`;
    hasItems = true;
  }
  if (report.smartPunct > 0) {
    html += `<li class="report-item"><span class="report-label">Smart punctuation normalized</span><span class="report-count">${report.smartPunct} chars</span></li>`;
    hasItems = true;
  }
  if (report.custom > 0) {
    html += `<li class="report-item"><span class="report-label">Custom replacements</span><span class="report-count">${report.custom} chars</span></li>`;
    hasItems = true;
  }
  if (!hasItems) {
    html += '<li class="report-item"><span class="report-label">No changes detected</span></li>';
  }
  html += '</ul>';

  // Total line. Three cases:
  //  1. Length changed (chars removed): show "X → Y chars (N removed, P%)"
  //  2. Length unchanged but in-place modifications happened (smart punct, case
  //     transforms, normalization): show "X chars (N normalized in place)"
  //  3. Nothing happened: show "X chars (no changes)"
  const inPlaceChanges = (report.smartPunct || 0);
  if (totalRemoved !== 0) {
    const percentage = originalLength > 0 ? ((totalRemoved/originalLength)*100).toFixed(1) : '0.0';
    let summary = `Total: ${originalLength} → ${finalLength} characters (${totalRemoved} removed, ${percentage}%`;
    if (inPlaceChanges > 0) summary += `; ${inPlaceChanges} normalized in place`;
    summary += ')';
    html += `<div class="report-total">${summary}</div>`;
  } else if (inPlaceChanges > 0 || hasItems) {
    html += `<div class="report-total">Total: ${originalLength} characters (${inPlaceChanges} normalized in place — length unchanged)</div>`;
  } else {
    html += `<div class="report-total">Total: ${originalLength} characters (no changes)</div>`;
  }
  // Batch DOM writes: remove hidden class and set innerHTML together
  // Use requestAnimationFrame to ensure these happen in the same frame
  requestAnimationFrame(() => {
    reportDiv.classList.remove('hidden');
    setInnerHTML(reportDiv, html);
  });
}

