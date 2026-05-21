// background.js — MV3 service worker.
// Provides:
//   - Right-click "Clean selected text" context menu.
//   - Right-click "Clean & copy selected text" context menu.
//   - Keyboard command "clean-selection" (Alt+Shift+C).
// Cleans using the SAME engine as the popup (cleaner.js, imported via importScripts).

importScripts('cleaner.js');

// ── Auth constants (used for server-side logout and silent JWT refresh) ───────
// These match the values in auth.js on the web side.
const ACE_SUPABASE_URL  = 'https://eqoltjofjlznlirbalrb.supabase.co';
const ACE_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxb2x0am9mamx6bmxpcmJhbHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTI2NzAsImV4cCI6MjA5MzU4ODY3MH0.5L6MAZpnPDdlBqFDtHHH3-gKFXUOnsbWgrJfnusw-Zk';

/**
 * Silently refresh the Supabase JWT stored in chrome.storage.local when it is
 * within 5 minutes of expiry. Returns the current (possibly refreshed) JWT,
 * or null if no token is available.
 *
 * Called before any plan-gating decision and on popup open via 'ace:refresh-jwt'.
 */
async function refreshExtJWT() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['ace_jwt', 'ace_refresh_token', 'ace_expires_at'], async (stored) => {
      const FIVE_MIN = 5 * 60;
      const now      = Date.now() / 1000;
      // Not near expiry — return current token unchanged.
      if ((stored.ace_expires_at || 0) > now + FIVE_MIN) {
        resolve(stored.ace_jwt || null);
        return;
      }
      // Near expiry or expired — attempt silent refresh.
      if (!stored.ace_refresh_token) {
        resolve(stored.ace_jwt || null); // no refresh token — can't renew
        return;
      }
      try {
        const r = await fetch(`${ACE_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': ACE_SUPABASE_ANON,
          },
          body: JSON.stringify({ refresh_token: stored.ace_refresh_token }),
        });
        const data = await r.json();
        if (data.access_token) {
          await new Promise(res => chrome.storage.local.set({
            ace_jwt:           data.access_token,
            ace_refresh_token: data.refresh_token || stored.ace_refresh_token,
            ace_expires_at:    data.expires_at    || 0,
          }, res));
          resolve(data.access_token);
        } else {
          // Refresh rejected (token revoked/expired) — return stale JWT optimistically.
          resolve(stored.ace_jwt || null);
        }
      } catch {
        resolve(stored.ace_jwt || null); // network failure — optimistic fallback
      }
    });
  });
}

const CONTEXT_CLEAN_REPLACE = 'ace-clean-replace';
const CONTEXT_CLEAN_COPY = 'ace-clean-copy';
const CONTEXT_OPEN_POPUP = 'ace-open-popup';

const FALLBACK_OPTS = {
  removeInvisible: true, removeMarkdown: true, removeAIMarkup: true,
  removeEmojis: false, removeFormatting: false,
  collapseSpaces: true, collapseNewlines: true, trimPerLine: true,
  removeHtml: false, removeComments: true,
  customFind: '', customReplace: '', customRegex: false,
  caseTx: '', punctuation: []
};

async function getOpts() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (saved) => {
      const merged = Object.assign({}, FALLBACK_OPTS, saved || {});
      resolve(merged);
    });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_CLEAN_REPLACE,
    title: 'AcePaste: clean & replace selection',
    contexts: ['selection', 'editable']
  });
  chrome.contextMenus.create({
    id: CONTEXT_CLEAN_COPY,
    title: 'AcePaste: clean selection → copy',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: CONTEXT_OPEN_POPUP,
    title: 'AcePaste: open cleaner with selection…',
    contexts: ['selection']
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || tab.id == null) return;
  const selectionText = info.selectionText || '';
  if (!selectionText) return;

  const opts = await getOpts();
  const result = self.AcePasteCleaner.cleanText(selectionText, opts);
  const cleaned = result.text;

  if (info.menuItemId === CONTEXT_CLEAN_REPLACE) {
    // Inject into the page to replace the active selection.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: info.frameId != null ? [info.frameId] : undefined },
      func: replaceSelectionInPage,
      args: [cleaned]
    });
    notify('Selection cleaned & replaced', tab.id);
  } else if (info.menuItemId === CONTEXT_CLEAN_COPY) {
    // Service workers can't access navigator.clipboard.writeText reliably; do it in-page.
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: info.frameId != null ? [info.frameId] : undefined },
      func: copyToPageClipboard,
      args: [cleaned]
    });
    notify('Cleaned text copied', tab.id);
  } else if (info.menuItemId === CONTEXT_OPEN_POPUP) {
    // Stash text so popup.js can pick it up on open.
    chrome.storage.local.set({ __pendingText: selectionText }, () => {
      chrome.action.openPopup ? chrome.action.openPopup() : null;
    });
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'clean-selection') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id == null) return;

  // Pull current selection from the active tab.
  const [{ result: selection } = { result: '' }] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => String(window.getSelection ? window.getSelection().toString() : '')
  });
  if (!selection) { notify('No text selected', tab.id); return; }

  const opts = await getOpts();
  const cleaned = self.AcePasteCleaner.cleanText(selection, opts).text;
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: replaceSelectionInPage,
    args: [cleaned]
  });
  notify('Selection cleaned & replaced', tab.id);
});

// --- in-page helpers (serialized into the active tab via executeScript) ---

function replaceSelectionInPage(cleaned) {
  const active = document.activeElement;
  // Editable inputs / textareas: use selectionStart/End.
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    const start = active.selectionStart;
    const end = active.selectionEnd;
    if (start != null && end != null) {
      const v = active.value;
      active.value = v.slice(0, start) + cleaned + v.slice(end);
      active.selectionStart = active.selectionEnd = start + cleaned.length;
      active.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
  }
  // contentEditable / generic selection.
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(cleaned));
    sel.removeAllRanges();
    return true;
  }
  // Last resort: copy to clipboard so user can paste manually.
  navigator.clipboard && navigator.clipboard.writeText(cleaned);
  return false;
}

function copyToPageClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallback());
  } else {
    fallback();
  }
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch {}
    document.body.removeChild(ta);
  }
}

function notify(msg, tabId) {
  // Lightweight badge notice (avoids notifications permission).
  chrome.action.setBadgeBackgroundColor({ color: '#2a7be4' });
  chrome.action.setBadgeText({ text: '✓', tabId });
  setTimeout(() => chrome.action.setBadgeText({ text: '', tabId }), 1200);
  void msg;
}

// --- Auth bridge (externally_connectable from acepaste.xyz) -----------------
// When the user signs in at acepaste.xyz/account?source=extension&ext_id=...,
// auth.js calls chrome.runtime.sendMessage with type ACEPASTE_AUTH_TOKEN.
// We persist the JWT + refresh_token so the extension stays signed in and
// background.js can silently renew the JWT before it expires.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'ACEPASTE_AUTH_TOKEN') return;
  // SECURITY: use sender.origin (immutable, set by Chrome from the page's actual
  // security origin) instead of sender.url (which includes path/query and is
  // easier to spoof via URL manipulation in crafted phishing pages).
  if (!sender.origin || sender.origin !== 'https://acepaste.xyz') {
    sendResponse({ ok: false, reason: 'untrusted origin' });
    return;
  }
  chrome.storage.local.set({
    ace_jwt:           msg.jwt          || '',
    ace_refresh_token: msg.refreshToken || '', // enables silent refresh in refreshExtJWT()
    ace_plan:          msg.plan         || 'free',
    ace_email:         msg.email        || '',
    ace_expires_at:    msg.expiresAt    || 0,
  }, () => {
    sendResponse({ ok: true });
    chrome.action.setTitle({ title: 'AcePaste Cleaner Pro — Pro active ✓' });
  });
  return true;
});

// Called when user signs out from the popup. Also handles jwt refresh requests.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ace:sign-out') {
    // SECURITY: invalidate the JWT server-side before clearing local storage.
    // Without this, the JWT would remain valid for up to 1 hour after sign-out —
    // a stolen JWT could still authenticate during that window.
    chrome.storage.local.get(['ace_jwt'], async (stored) => {
      if (stored.ace_jwt) {
        try {
          await fetch(`${ACE_SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': ACE_SUPABASE_ANON,
              'Authorization': 'Bearer ' + stored.ace_jwt,
            },
            body: JSON.stringify({}),
          });
        } catch { /* fire-and-forget: local clear happens regardless */ }
      }
      chrome.storage.local.remove(
        ['ace_jwt', 'ace_refresh_token', 'ace_plan', 'ace_email', 'ace_expires_at'],
        () => { sendResponse({ ok: true }); }
      );
    });
    return true;
  }

  // Called by popup.js on open to silently refresh an expiring JWT.
  if (msg && msg.type === 'ace:refresh-jwt') {
    refreshExtJWT().then(jwt => sendResponse({ jwt }));
    return true;
  }
});

// --- Page-scanner integration -----------------------------------------------
// Cache per-tab scan results. scanner.js sends 'ace:scan-result' on every page
// scan; popup.js queries via 'ace:get-scan'. Badge turns red with the count
// when hostile invisibles are detected on the current tab.
const scanCache = new Map(); // tabId -> { count, nodeCount, url, scanned: true }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'ace:scan-result') {
    const tabId = sender.tab && sender.tab.id;
    if (tabId == null) return;
    scanCache.set(tabId, {
      count: msg.count || 0,
      nodeCount: msg.nodeCount || 0,
      url: msg.url || '',
      scanned: true
    });
    if (msg.count > 0) {
      // Red badge = quarantine warning. Count is shown directly so the user
      // sees urgency without opening the popup.
      chrome.action.setBadgeBackgroundColor({ color: '#b8261c', tabId });
      chrome.action.setBadgeText({ text: String(Math.min(msg.count, 999)), tabId });
      chrome.action.setTitle({
        tabId,
        title: `AcePaste — ⚠ ${msg.count} hostile invisible character${msg.count === 1 ? '' : 's'} on this page. Click to clean.`
      });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
      chrome.action.setTitle({ tabId, title: 'AcePaste Cleaner Pro — page is clean' });
    }
    return;
  }

  if (msg.type === 'ace:get-scan') {
    const tabId = (msg.tabId != null) ? msg.tabId : (sender.tab && sender.tab.id);
    sendResponse(scanCache.get(tabId) || null);
    return true;
  }
});

// Clean cache entries when tabs close. (scanner.js overwrites the entry on
// every fresh navigation since the content script re-runs at document_idle.)
chrome.tabs.onRemoved.addListener((tabId) => scanCache.delete(tabId));
