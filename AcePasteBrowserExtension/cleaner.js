// Ace Paste Cleaner — pure cleaning engine.
// Same logic as the web app's cleanText() (app-critical.js), refactored to a pure
// function that takes (text, options) and returns { text, report, errors, ... }.
// Used by popup.js, background.js (context-menu cleaning), and node smoke tests.
//
// All regexes use \uXXXX escapes — literal control characters break parsers and
// silently corrupt source files.

// ── Dangerous / invisible character set ──────────────────────────────────────
// Default-on. Covers classic zero-width chars PLUS modern attack vectors:
//   • Trojan Source bidi overrides (U+202A–U+202E, U+2066–U+2069) — RTL/LTR
//     spoofing used to hide malicious code in plain sight.
//   • Tag characters (U+E0000–U+E007F) — used to steganographically embed
//     hidden ASCII inside any string; weaponised in LLM prompt-injection attacks.
//   • Variation selectors (U+FE00–U+FE0F, U+E0100–U+E01EF) — used to encode
//     hidden bits per visible glyph (Sneaky Bits).
//   • Mongolian vowel separator (U+180E), Hangul fillers (U+115F, U+1160,
//     U+3164, U+FFA0), Khmer inherent vowels (U+17B4, U+17B5), Braille blank
//     (U+2800), word joiners and format chars (U+2060–U+206F).
//   • Soft hyphen (U+00AD) — invisible mid-word.
//   • BOM / zero-width no-break space (U+FEFF), zero-width chars
//     (U+200B–U+200D), LRM/RLM (U+200E, U+200F), Arabic letter mark (U+061C),
//     combining grapheme joiner (U+034F).
const INVISIBLE_RE = new RegExp(
  '[' +
    '\\u00AD' +                    // SOFT HYPHEN
    '\\u034F' +                    // COMBINING GRAPHEME JOINER
    '\\u061C' +                    // ARABIC LETTER MARK
    '\\u115F\\u1160' +             // HANGUL FILLERS
    '\\u17B4\\u17B5' +             // KHMER INHERENT VOWELS
    '\\u180E' +                    // MONGOLIAN VOWEL SEPARATOR
    '\\u200B-\\u200F' +            // ZERO WIDTH SPACE/NJ/J + LRM/RLM
    '\\u202A-\\u202E' +            // BIDI EMBEDDINGS / OVERRIDES (Trojan Source)
    '\\u2060-\\u206F' +            // WORD JOINER + general format chars
    '\\u2800' +                    // BRAILLE PATTERN BLANK (looks like space)
    '\\u3164' +                    // HANGUL FILLER
    '\\uFE00-\\uFE0F' +            // VARIATION SELECTORS 1–16
    '\\uFEFF' +                    // ZERO WIDTH NO-BREAK SPACE / BOM
    '\\uFFA0' +                    // HALFWIDTH HANGUL FILLER
  ']',
  'g'
);
// Supplementary-plane invisibles (need /u flag, separate pattern).
const INVISIBLE_SUPPL_RE = /[\u{E0000}-\u{E007F}\u{E0100}-\u{E01EF}]/gu;

// ── Whitespace / formatting (separate from "invisible" — these affect layout) ─
const FORMATTING_RE  = /[\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g;
const NBSP_RE        = /\u00A0/g;

// ── Emoji / symbol blocks ────────────────────────────────────────────────────
const EMOJI_RE = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2300}-\u{23FF}]|[\u{24C2}-\u{1F251}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
const EMOJI_SEQ_RE = /[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{200D}]/gu;

const TITLE_SKIP = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of','with','by'
]);

// Reject regex patterns with nested quantifiers that can cause catastrophic backtracking.
function isSafeRegex(pattern) {
  try { new RegExp(pattern); } catch (e) { return false; }
  if (/(\([^)]*[+*][^)]*\))[+*{]/.test(pattern)) return false;
  if (/(\([^)]*\|[^)]*\))[+*{]/.test(pattern)) return false;
  return true;
}

function emptyReport() {
  return {
    invisible: 0,        // dangerous-invisible chars removed (count, not bytes)
    markdown: 0,
    aiMarkup: 0,
    emojis: 0,
    formatting: 0,
    spaces: 0,
    newlines: 0,
    html: 0,
    comments: 0,
    punctuation: 0,
    custom: 0,
    trimmedLines: 0
  };
}

/**
 * Clean text per the supplied options.
 * Booleans default to false except where the popup default is true; pass
 * explicit flags rather than relying on this function's defaults.
 *
 * @param {string} text
 * @param {object} opts
 * @returns {{ text: string, report: object, errors: string[],
 *            originalLength: number, finalLength: number }}
 */
function cleanText(text, opts) {
  opts = opts || {};
  const errors = [];
  const report = emptyReport();
  const originalLength = (text || '').length;
  if (!text) return { text: '', report, errors, originalLength: 0, finalLength: 0 };

  if (opts.removeInvisible) {
    const m1 = text.match(INVISIBLE_RE);
    const m2 = text.match(INVISIBLE_SUPPL_RE);
    report.invisible = (m1 ? m1.length : 0) + (m2 ? m2.length : 0);
    text = text.replace(INVISIBLE_RE, '').replace(INVISIBLE_SUPPL_RE, '');
  }

  if (opts.removeEmojis) {
    const before = text.length;
    text = text.replace(EMOJI_RE, '').replace(EMOJI_SEQ_RE, '');
    report.emojis = before - text.length;
  }

  if (opts.removeFormatting) {
    const before = text.length;
    text = text.replace(FORMATTING_RE, '');
    text = text.replace(NBSP_RE, ' ');
    report.formatting = before - text.length;
  }

  if (opts.removeMarkdown) {
    const before = text.length;
    text = text.replace(/(?:^|\s)(#{1,6})\s/gm, ' ');
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
    text = text.replace(/\*([^*\n]+?)\*/g, '$1');
    text = text.replace(/__([^_]+)__/g, '$1');
    text = text.replace(/_([^_\n\s]+?)_/g, '$1');
    text = text.replace(/```[\s\S]*?```/g, '');
    text = text.replace(/`([^`]+)`/g, '$1');
    text = text.replace(/~~([^~]+)~~/g, '$1');
    text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
    text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '');
    text = text.replace(/^>\s+/gm, '');
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
    report.markdown = before - text.length;
  }

  if (opts.removeAIMarkup) {
    const before = text.length;
    text = text.replace(/(\*{2,}|\*{3,}|#{2,}|\+{2,}|={2,}|-{2,}|_{2,})/g, '');
    report.aiMarkup = before - text.length;
  }

  // Whitespace + structural
  if (opts.collapseSpaces) {
    const before = text.length;
    text = text.replace(/[ \t]+/g, ' ');
    report.spaces = before - text.length;
  }
  if (opts.collapseNewlines) {
    const before = text.length;
    text = text.replace(/\n{3,}/g, '\n\n');
    report.newlines = before - text.length;
  }
  if (opts.trimPerLine) {
    const before = text;
    const lines = text.split('\n');
    let trimmed = 0;
    text = lines.map(l => {
      const t = l.trim();
      if (t !== l) trimmed++;
      return t;
    }).join('\n');
    report.trimmedLines = trimmed;
    void before;
  }
  if (opts.removeHtml) {
    const before = text.length;
    let _prev;
    do { _prev = text; text = text.replace(/<[^>]*>/g, ''); } while (text !== _prev);
    report.html = before - text.length;
  }
  if (opts.removeComments) {
    const before = text.length;
    text = text.replace(/^\s*#[^\n]*/gm, '');
    text = text.replace(/\/\/[^\n]*/g, '');
    text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    let prev;
    do { prev = text; text = text.replace(/<!--[\s\S]*?-->/g, ''); } while (text !== prev);
    report.comments = before - text.length;
  }

  switch (opts.caseTx) {
    case 'upper': text = text.toUpperCase(); break;
    case 'lower': text = text.toLowerCase(); break;
    case 'capitalize':
      text = text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
      break;
    case 'title':
      text = text.split(' ').map((w, i) => {
        const lower = w.toLowerCase();
        if (i === 0 || !TITLE_SKIP.has(lower)) {
          return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
        }
        return lower;
      }).join(' ');
      break;
  }

  if (Array.isArray(opts.punctuation) && opts.punctuation.length > 0) {
    const before = text.length;
    const escaped = opts.punctuation.map(p => p.replace(/[.*+?^${}()[\]\\|]/g, '\\$&'));
    text = text.replace(new RegExp('[' + escaped.join('') + ']', 'g'), '');
    report.punctuation = before - text.length;
  }

  if (opts.customFind) {
    const before = text.length;
    const replace = opts.customReplace || '';
    if (opts.customRegex) {
      if (!isSafeRegex(opts.customFind)) {
        errors.push('Regex rejected: pattern may cause excessive backtracking.');
      } else {
        try {
          text = text.replace(new RegExp(opts.customFind, 'g'), replace);
        } catch (e) {
          errors.push('Invalid regex: ' + e.message);
        }
      }
    } else {
      text = text.split(opts.customFind).join(replace);
    }
    report.custom = before - text.length;
  }

  return {
    text,
    report,
    errors,
    originalLength,
    finalLength: text.length
  };
}

// CommonJS export for node smoke tests; classic-script export for popup/background.
const _api = {
  cleanText,
  isSafeRegex,
  // Regex constants — exposed for the page scanner (scanner.js) so it can
  // count hostile invisibles without re-declaring the alphabet.
  INVISIBLE_RE,
  INVISIBLE_SUPPL_RE,
  INVISIBLE_RE_GLOBAL: INVISIBLE_RE,             // already /g
  INVISIBLE_SUPPL_RE_GLOBAL: INVISIBLE_SUPPL_RE, // already /gu
  INVISIBLE_RE_SOURCE: INVISIBLE_RE.source,
  INVISIBLE_SUPPL_RE_SOURCE: INVISIBLE_SUPPL_RE.source
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = _api;
} else if (typeof self !== 'undefined') {
  self.AcePasteCleaner = _api;
}
