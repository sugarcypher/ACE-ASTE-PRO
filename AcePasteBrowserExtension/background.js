// background.js — MV3 service worker.
// Provides:
//   - Right-click "Clean selected text" context menu.
//   - Right-click "Clean & copy selected text" context menu.
//   - Keyboard command "clean-selection" (Alt+Shift+C).
// Cleans using the SAME engine as the popup (cleaner.js, imported via importScripts).

importScripts('cleaner.js');

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
    title: 'Ace Paste: clean & replace selection',
    contexts: ['selection', 'editable']
  });
  chrome.contextMenus.create({
    id: CONTEXT_CLEAN_COPY,
    title: 'Ace Paste: clean selection → copy',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: CONTEXT_OPEN_POPUP,
    title: 'Ace Paste: open cleaner with selection…',
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
// We persist the JWT + plan so popup.js can gate premium features.
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'ACEPASTE_AUTH_TOKEN') return;
  if (sender.url && !sender.url.startsWith('https://acepaste.xyz/')) {
    sendResponse({ ok: false, reason: 'untrusted origin' });
    return;
  }
  chrome.storage.local.set({
    ace_jwt:        msg.jwt        || '',
    ace_plan:       msg.plan       || 'free',
    ace_email:      msg.email      || '',
    ace_expires_at: msg.expiresAt  || 0
  }, () => {
    sendResponse({ ok: true });
    chrome.action.setTitle({ title: 'Ace Paste Cleaner Pro — Pro active ✓' });
  });
  return true;
});

// Called when user signs out from the popup.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'ace:sign-out') {
    chrome.storage.local.remove(['ace_jwt','ace_plan','ace_email','ace_expires_at'], () => {
      sendResponse({ ok: true });
    });
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
        title: `Ace Paste — ⚠ ${msg.count} hostile invisible character${msg.count === 1 ? '' : 's'} on this page. Click to clean.`
      });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
      chrome.action.setTitle({ tabId, title: 'Ace Paste Cleaner Pro — page is clean' });
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
