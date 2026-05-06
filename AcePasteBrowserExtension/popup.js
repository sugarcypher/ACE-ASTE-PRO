// popup.js — wires popup.html UI to cleaner.js, persists settings via chrome.storage.local.
// Loaded as a classic script (manifest CSP forbids inline). cleaner.js is loaded first
// via <script src="cleaner.js"></script>… actually we inline-load it from popup.html
// using a single <script src="popup.js"> and import via importScripts substitute below.

// We use a tiny synchronous loader: in MV3 popup pages, scripts in the HTML run in order.
// popup.html loads cleaner.js then popup.js. Here we just consume self.AcePasteCleaner.

// ── Freemium gate (extension) ─────────────────────────────────────────────
const EXT_FREE_CHAR_LIMIT = 2000;

// Premium feature IDs locked on the free tier
const PREMIUM_FEATURE_IDS_EXT = [
  'removeAIMarkup','removeEmojis','removeFormatting',
  'removeHtml','removeComments',
  'customFind','customReplace','customRegex',
  'removePunctuation'
];
// Protection features locked on free tier
const PREMIUM_PROTECTION_IDS_EXT = [
  'quarantineCopy','quarantinePaste','quarantineFullPipeline','quarantineSilent',
  'scanEnabled','bannerEnabled'
];

let _extPlan = 'free';
let _extEmail = '';

function extIsPaid() { return _extPlan !== 'free'; }

/** Load auth state from chrome.storage.local, apply UI gates, return plan. */
async function loadExtAuth() {
  return new Promise(resolve => {
    chrome.storage.local.get(['ace_plan','ace_email','ace_expires_at'], (r) => {
      const expires = Number(r.ace_expires_at || 0);
      if (expires && Date.now() / 1000 > expires) {
        _extPlan = 'free'; _extEmail = '';
      } else {
        _extPlan  = r.ace_plan  || 'free';
        _extEmail = r.ace_email || '';
      }
      applyExtFreemiumUI();
      resolve(_extPlan);
    });
  });
}

/** Lock or unlock premium feature checkboxes in popup.html. */
function applyExtFreemiumUI() {
  const paid = extIsPaid();

  // Account status line
  const statusEl = document.getElementById('aceAccountStatus');
  if (statusEl) {
    if (_extEmail) {
      const PLAN_LABELS = { free:'Free', trial:'Trial', monthly:'Monthly', yearly:'Annual', lifetime:'Lifetime' };
      statusEl.textContent = _extEmail.split('@')[0] + ' · ' + (PLAN_LABELS[_extPlan] || _extPlan);
      statusEl.style.display = 'block';
    } else {
      statusEl.style.display = 'none';
    }
  }
  const signInBtn = document.getElementById('aceSignInBtn');
  const signOutBtn = document.getElementById('aceSignOutBtn');
  if (signInBtn)  signInBtn.style.display  = paid ? 'none'  : 'inline-block';
  if (signOutBtn) signOutBtn.style.display = paid ? 'inline-block' : 'none';

  // Show/hide upgrade nudge
  const nudge = document.getElementById('aceUpgradeNudge');
  if (nudge) nudge.style.display = paid ? 'none' : 'block';

  // Cleaning features
  for (const id of PREMIUM_FEATURE_IDS_EXT) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = !paid;
    if (!paid) el.checked = false;
    const lbl = el.closest('label') || el.parentElement;
    if (lbl) lbl.classList.toggle('ace-premium-locked', !paid);
  }

  // Case radios
  document.querySelectorAll('input[name="caseTx"]').forEach(r => {
    r.disabled = !paid;
    if (!paid) r.checked = false;
    const lbl = r.closest('label') || r.parentElement;
    if (lbl) lbl.classList.toggle('ace-premium-locked', !paid);
  });

  // Protection features
  for (const id of PREMIUM_PROTECTION_IDS_EXT) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.disabled = !paid;
    if (!paid) el.checked = false;
    const lbl = el.closest('label') || el.parentElement;
    if (lbl) lbl.classList.toggle('ace-premium-locked', !paid);
  }

  // Scanner buttons
  const scanBtn      = document.getElementById('scanNowBtn');
  const highlightBtn = document.getElementById('highlightBtn');
  if (scanBtn)      scanBtn.disabled      = !paid;
  if (highlightBtn) highlightBtn.disabled = !paid;
}

function openSignInPage() {
  const extId = chrome.runtime.id;
  const url   = 'https://acepaste.xyz/account.html?source=extension&ext_id=' + encodeURIComponent(extId);
  chrome.tabs.create({ url, active: true });
  window.close();
}

async function extSignOut() {
  chrome.runtime.sendMessage({ type: 'ace:sign-out' }, () => {
    _extPlan = 'free'; _extEmail = '';
    applyExtFreemiumUI();
    showNotice('Signed out.', 'info');
  });
}
// ── End freemium gate ─────────────────────────────────────────────────────

const els = {};
function $(id) { return els[id] || (els[id] = document.getElementById(id)); }

const OPTION_KEYS = [
  'removeInvisible','removeMarkdown','removeAIMarkup','removeEmojis','removeFormatting',
  'collapseSpaces','collapseNewlines','trimPerLine','removeHtml','removeComments',
  'customFind','customReplace','customRegex'
];
// Page-protection settings persisted to chrome.storage.local + read by scanner.js.
// Mix of checkboxes and a select (quarantineBypassKey).
const PROTECTION_BOOL_KEYS = [
  'scanEnabled','bannerEnabled',
  'quarantineCopy','quarantinePaste','quarantineFullPipeline','quarantineSilent'
];
const PROTECTION_SELECT_KEYS = ['quarantineBypassKey'];
const PROTECTION_KEYS = PROTECTION_BOOL_KEYS.concat(PROTECTION_SELECT_KEYS);
const DEFAULTS = {
  removeInvisible: true, removeMarkdown: true, removeAIMarkup: true,
  removeEmojis: false, removeFormatting: false,
  collapseSpaces: true, collapseNewlines: true, trimPerLine: true,
  removeHtml: false, removeComments: true,
  customFind: '', customReplace: '', customRegex: false,
  caseTx: '', punctuation: [], darkMode: false, advancedOpen: false,
  // Page protection — quarantine on by default; scan opt-in.
  scanEnabled: false,
  bannerEnabled: true,
  quarantineCopy: true,
  quarantinePaste: true,
  quarantineFullPipeline: false,
  quarantineSilent: false,
  quarantineBypassKey: 'shift'
};

function readOpts() {
  return {
    removeInvisible: $('removeInvisible').checked,
    removeMarkdown: $('removeMarkdown').checked,
    removeAIMarkup: $('removeAIMarkup').checked,
    removeEmojis: $('removeEmojis').checked,
    removeFormatting: $('removeFormatting').checked,
    collapseSpaces: $('collapseSpaces').checked,
    collapseNewlines: $('collapseNewlines').checked,
    trimPerLine: $('trimPerLine').checked,
    removeHtml: $('removeHtml').checked,
    removeComments: $('removeComments').checked,
    customFind: $('customFind').value,
    customReplace: $('customReplace').value,
    customRegex: $('customRegex').checked,
    caseTx: (document.querySelector('input[name="caseTx"]:checked') || {}).value || '',
    punctuation: Array.from($('removePunctuation').selectedOptions).map(o => o.value)
  };
}

function applyOpts(saved) {
  const merged = Object.assign({}, DEFAULTS, saved || {});
  for (const k of OPTION_KEYS.concat(PROTECTION_KEYS)) {
    const el = $(k);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!merged[k];
    else el.value = merged[k] || '';
  }
  // Radios
  const caseRadio = document.querySelector(`input[name="caseTx"][value="${cssEscape(merged.caseTx || '')}"]`);
  if (caseRadio) caseRadio.checked = true;
  // Multi-select
  const punctEl = $('removePunctuation');
  if (punctEl && Array.isArray(merged.punctuation)) {
    for (const opt of punctEl.options) opt.selected = merged.punctuation.includes(opt.value);
  }
  // Dark mode
  if (merged.darkMode) {
    document.body.classList.add('dark-mode');
    $('darkModeToggle').textContent = '☀️';
  }
  // Advanced panel
  if (merged.advancedOpen) {
    $('advanced').classList.remove('hidden');
    $('moreOptions').textContent = 'Advanced ▴';
  }
}

function cssEscape(s) { return String(s).replace(/[^\w-]/g, '\\$&'); }

function persist(partial) {
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set(partial);
  }
}

function persistOpts() {
  persist(Object.assign(readOpts(), {
    caseTx: (document.querySelector('input[name="caseTx"]:checked') || {}).value || '',
    punctuation: Array.from($('removePunctuation').selectedOptions).map(o => o.value)
  }));
}

function showNotice(msg, kind) {
  const el = $('aceNotice');
  el.textContent = msg;
  el.className = 'ace-notice ace-notice--' + (kind || 'info');
  setTimeout(() => { el.className = 'ace-notice hidden'; }, 4000);
}

function renderReport(result) {
  const div = $('cleaningReport');
  const { report, originalLength, finalLength } = result;
  const totalRemoved = originalLength - finalLength;
  const items = [
    [report.zeroWidth, 'Invisible characters removed'],
    [report.emojis, 'Emojis removed (chars)'],
    [report.formatting, 'Formatting characters removed (chars)'],
    [report.markdown, 'Markdown removed (chars)'],
    [report.aiMarkup, 'AI markup removed (chars)'],
    [report.spaces, 'Extra spaces collapsed (chars)'],
    [report.newlines, 'Extra newlines collapsed (chars)'],
    [report.html, 'HTML tags removed (chars)'],
    [report.comments, 'Comments removed (chars)'],
    [report.punctuation, 'Punctuation removed (chars)'],
    [report.custom, 'Custom replacements (chars)']
  ].filter(([n]) => n > 0);

  // Build DOM (avoid innerHTML — we don't want to depend on Trusted Types).
  div.textContent = '';
  const h3 = document.createElement('h3');
  h3.textContent = 'Cleaning report';
  div.appendChild(h3);

  const ul = document.createElement('ul');
  if (items.length === 0) {
    const li = document.createElement('li');
    li.className = 'report-item';
    const lbl = document.createElement('span');
    lbl.className = 'report-label';
    lbl.textContent = 'No changes detected';
    li.appendChild(lbl);
    ul.appendChild(li);
  } else {
    for (const [n, label] of items) {
      const li = document.createElement('li');
      li.className = 'report-item';
      const lbl = document.createElement('span'); lbl.className = 'report-label'; lbl.textContent = label;
      const cnt = document.createElement('span'); cnt.className = 'report-count'; cnt.textContent = String(n);
      li.appendChild(lbl); li.appendChild(cnt);
      ul.appendChild(li);
    }
  }
  div.appendChild(ul);

  const total = document.createElement('div');
  total.className = 'report-total';
  if (totalRemoved !== 0 || originalLength !== finalLength) {
    const pct = originalLength > 0 ? ((totalRemoved / originalLength) * 100).toFixed(1) : '0.0';
    total.textContent = `Total: ${originalLength} → ${finalLength} chars (${totalRemoved > 0 ? totalRemoved + ' removed' : 'no change'}, ${pct}%)`;
  } else {
    total.textContent = `Total: ${originalLength} chars (no changes)`;
  }
  div.appendChild(total);
  div.classList.remove('hidden');
}

function doClean() {
  try {
    let text = $('paste').value;
    if (!text) {
      $('cleaned').value = '';
      $('cleaningReport').classList.add('hidden');
      return;
    }
    // Freemium char limit
    if (!extIsPaid() && text.length > EXT_FREE_CHAR_LIMIT) {
      showNotice('Free plan: text truncated at 2,000 chars. Upgrade at acepaste.xyz/pricing', 'warn');
      text = text.slice(0, EXT_FREE_CHAR_LIMIT);
      $('paste').value = text;
    }
    // Free tier: force only invisible + markdown
    const opts = extIsPaid() ? readOpts() : Object.assign(readOpts(), {
      removeAIMarkup: false, removeEmojis: false, removeFormatting: false,
      removeHtml: false, removeComments: false,
      customFind: '', customRegex: false, caseTx: '', punctuation: []
    });
    const result = self.AcePasteCleaner.cleanText(text, opts);
    $('cleaned').value = result.text;
    renderReport(result);
    for (const err of result.errors) showNotice(err, 'error');
    persistOpts();
  } catch (e) {
    showNotice('An error occurred while cleaning. ' + (e && e.message ? e.message : ''), 'error');
  }
}

async function pasteFromClipboard() {
  try {
    const text = await navigator.clipboard.readText();
    $('paste').value = text;
    $('paste').focus();
    // Auto-clean on paste — small QoL for an extension popup.
    doClean();
  } catch {
    $('paste').focus();
    showNotice('Clipboard read denied. Paste manually with Cmd/Ctrl+V.', 'error');
  }
}

function clearFields() {
  $('paste').value = '';
  $('cleaned').value = '';
  $('cleaningReport').classList.add('hidden');
  $('cleaningReport').textContent = '';
  $('paste').focus();
}

async function copyToClipboard() {
  const text = $('cleaned').value;
  const btn = $('copyBtn');
  if (!text) { showNotice('Nothing to copy. Clean some text first.', 'error'); return; }
  try {
    await navigator.clipboard.writeText(text);
    const original = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.background = 'linear-gradient(var(--good-2), var(--good))';
    btn.style.color = '#fff';
    setTimeout(() => {
      btn.textContent = original;
      btn.style.background = '';
      btn.style.color = '';
    }, 1500);
  } catch {
    showNotice('Copy failed. Select the text and copy manually.', 'error');
  }
}

function toggleDark() {
  const isDark = document.body.classList.toggle('dark-mode');
  $('darkModeToggle').textContent = isDark ? '☀️' : '🌙';
  persist({ darkMode: isDark });
}

// --- Page protection helpers ---------------------------------------------

async function getActiveTabId() {
  return new Promise(resolve => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs[0] ? tabs[0].id : null);
    });
  });
}

function setScanStatus(text, kind) {
  const el = $('scanStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('has-hits', 'clean');
  if (kind) el.classList.add(kind);
}

async function refreshScanStatus() {
  const tabId = await getActiveTabId();
  if (tabId == null) { setScanStatus('No active tab.'); return; }
  // Ask background.js for the cached scan result for this tab.
  chrome.runtime.sendMessage({ type: 'ace:get-scan', tabId }, (res) => {
    if (chrome.runtime.lastError || !res) {
      setScanStatus($('scanEnabled').checked
        ? 'Scanner enabled — scan not yet run on this tab.'
        : 'Scanner inactive on this tab.');
      return;
    }
    if (res.count > 0) {
      setScanStatus(`⚠ ${res.count} hostile invisible char${res.count === 1 ? '' : 's'} found across ${res.nodeCount} text node${res.nodeCount === 1 ? '' : 's'}.`, 'has-hits');
    } else if ($('scanEnabled').checked || res.scanned) {
      setScanStatus('✓ Page is clean — no hostile invisibles detected.', 'clean');
    } else {
      setScanStatus('Scanner inactive on this tab.');
    }
  });
}

async function requestScanOfActiveTab() {
  const tabId = await getActiveTabId();
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: 'ace:request-scan' }, (res) => {
    if (chrome.runtime.lastError) {
      setScanStatus('Cannot scan this page (restricted URL).', 'has-hits');
      return;
    }
    if (!res) return;
    if (res.count > 0) {
      setScanStatus(`⚠ ${res.count} hostile invisible char${res.count === 1 ? '' : 's'} found across ${res.nodeCount} text node${res.nodeCount === 1 ? '' : 's'}.`, 'has-hits');
    } else {
      setScanStatus('✓ Page is clean — no hostile invisibles detected.', 'clean');
    }
  });
}

async function requestHighlightOnActiveTab() {
  const tabId = await getActiveTabId();
  if (tabId == null) return;
  chrome.tabs.sendMessage(tabId, { type: 'ace:highlight' }, (res) => {
    if (chrome.runtime.lastError) {
      setScanStatus('Cannot highlight on this page (restricted URL).', 'has-hits');
      return;
    }
    if (res && res.highlighted >= 0) {
      setScanStatus(`Outlined ${res.highlighted} contaminated text node${res.highlighted === 1 ? '' : 's'}.`, res.highlighted > 0 ? 'has-hits' : 'clean');
    }
  });
}

function toggleAdvanced() {
  const adv = $('advanced');
  const open = adv.classList.toggle('hidden') === false;
  $('moreOptions').textContent = open ? 'Advanced ▴' : 'Advanced ▾';
  persist({ advancedOpen: open });
}

document.addEventListener('DOMContentLoaded', async () => {
  // Restore saved settings.
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(null, (saved) => applyOpts(saved));
  } else {
    applyOpts({});
  }

  // Load auth state and apply freemium UI before anything else
  await loadExtAuth();

  $('cleanBtn').addEventListener('click', doClean);
  $('pasteBtn').addEventListener('click', pasteFromClipboard);
  $('clearBtn').addEventListener('click', clearFields);
  $('copyBtn').addEventListener('click', copyToClipboard);
  $('darkModeToggle').addEventListener('click', toggleDark);
  $('moreOptions').addEventListener('click', toggleAdvanced);

  // Auth buttons
  const signInBtn  = document.getElementById('aceSignInBtn');
  const signOutBtn = document.getElementById('aceSignOutBtn');
  const upgradeBtn = document.getElementById('aceUpgradeBtn');
  if (signInBtn)  signInBtn.addEventListener('click',  openSignInPage);
  if (signOutBtn) signOutBtn.addEventListener('click', extSignOut);
  if (upgradeBtn) upgradeBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://acepaste.xyz/pricing.html', active: true });
    window.close();
  });

  // Persist on change.
  for (const id of OPTION_KEYS) {
    const el = $(id);
    if (el) el.addEventListener('change', persistOpts);
  }
  document.querySelectorAll('input[name="caseTx"]').forEach(r => r.addEventListener('change', persistOpts));
  $('removePunctuation').addEventListener('change', persistOpts);

  // --- Page protection (passive scanner + quarantine) wiring --------------
  for (const id of PROTECTION_BOOL_KEYS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      persist({ [id]: el.checked });
      refreshScanStatus();
    });
  }
  for (const id of PROTECTION_SELECT_KEYS) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('change', () => {
      persist({ [id]: el.value });
    });
  }
  $('scanNowBtn').addEventListener('click', requestScanOfActiveTab);
  $('highlightBtn').addEventListener('click', requestHighlightOnActiveTab);
  refreshScanStatus();

  // Cmd/Ctrl+Enter to clean.
  $('paste').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); doClean(); }
  });

  // If background sent us text via storage (context-menu path), prefill.
  if (chrome && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['__pendingText'], (r) => {
      if (r && r.__pendingText) {
        $('paste').value = r.__pendingText;
        chrome.storage.local.remove('__pendingText');
        doClean();
      }
    });
  }
});
