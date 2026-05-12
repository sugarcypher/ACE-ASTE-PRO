/**
 * auth.js — AcePaste Cleaner Pro shared auth + subscription layer
 *
 * Loaded by index.html and account.html. Also imported by the extension
 * indirectly via a REST API. Uses Supabase Auth (email/password) and a
 * `subscriptions` table to track active plans.
 *
 * Replace the two constants below with your actual Supabase project values.
 */

// ── Recovery-link fallback ────────────────────────────────────────────────
// If a Supabase recovery/signup link drops the user on any page other than
// /account.html (e.g. the Site URL falls back to the homepage), forward them
// to /account.html with the hash preserved so the set-new-password handler
// can run. Without this, the access_token in the URL hash is silently
// ignored and the user just sees the homepage.
(function() {
  try {
    if (typeof window === 'undefined' || !window.location.hash) return;
    var params = new URLSearchParams(window.location.hash.slice(1));
    var t = params.get('type');
    if ((t === 'recovery' || t === 'signup') && params.get('access_token')) {
      var path = window.location.pathname;
      if (path !== '/account.html' && path !== '/account') {
        window.location.replace('/account.html' + window.location.search + window.location.hash);
      }
    }
  } catch(e) {}
})();

// ── Config ────────────────────────────────────────────────────────────────
const ACEPASTE_SUPABASE_URL  = 'https://eqoltjofjlznlirbalrb.supabase.co';
const ACEPASTE_SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVxb2x0am9mamx6bmxpcmJhbHJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTI2NzAsImV4cCI6MjA5MzU4ODY3MH0.5L6MAZpnPDdlBqFDtHHH3-gKFXUOnsbWgrJfnusw-Zk';

// Plans the backend can return
const PLAN_FREE     = 'free';
const PLAN_TRIAL    = 'trial';    // 24-hour access
const PLAN_MONTHLY  = 'monthly';
const PLAN_YEARLY   = 'yearly';
const PLAN_LIFETIME = 'lifetime';

// ── Internal helpers ───────────────────────────────────────────────────────
function _headers(jwt) {
  const h = {
    'Content-Type': 'application/json',
    'apikey': ACEPASTE_SUPABASE_ANON,
  };
  if (jwt) h['Authorization'] = 'Bearer ' + jwt;
  return h;
}

async function _post(path, body, jwt) {
  const r = await fetch(ACEPASTE_SUPABASE_URL + path, {
    method: 'POST',
    headers: _headers(jwt),
    body: JSON.stringify(body),
  });
  return r.json();
}

async function _get(path, jwt) {
  const r = await fetch(ACEPASTE_SUPABASE_URL + path, {
    method: 'GET',
    headers: _headers(jwt),
  });
  return r.json();
}

// ── Session cache (sessionStorage only — no localStorage per privacy policy) ──
const SESSION_KEY = 'acepaste_sub';

function _saveSession(data) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(data)); } catch(e) {}
}

function _loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch(e) { return null; }
}

function _clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch(e) {}
}

// ── Cross-tab session relay (extension auth bridge) ────────────────────────
// BroadcastChannel is origin-scoped — only acepaste.xyz pages participate.
// It cannot be accessed cross-origin, so sharing the session this way is safe.
//
// Problem it solves: sessionStorage is tab-isolated. When the extension opens
// account.html?source=extension in a new tab, that tab has an empty
// sessionStorage even if the user is already signed in on another tab. Without
// this relay the user is forced to sign in a second time.
//
// All signed-in pages act as responders. The bridge tab is the sole requester.
const _sessionChannel = (function() {
  try {
    return typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('acepaste_session_v1')
      : null;
  } catch(e) { return null; }
})();

if (_sessionChannel) {
  _sessionChannel.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'ace:session_request') return;
    const s = _loadSession();
    if (!s || !s.jwt) return;                   // this tab has no session to share
    _sessionChannel.postMessage({
      type:    'ace:session_response',
      reqId:   e.data.reqId,
      session: s,
    });
  });
}

/**
 * Broadcast a session request and wait up to `timeoutMs` for the first peer reply.
 * Resolves with the session object or null. Only called by the bridge tab.
 */
function _requestPeerSession(timeoutMs) {
  return new Promise(function(resolve) {
    if (!_sessionChannel) return resolve(null);
    const reqId = Math.random().toString(36).slice(2, 10);
    let settled = false;
    const timer = setTimeout(function() {
      if (settled) return;
      settled = true;
      _sessionChannel.removeEventListener('message', onReply);
      resolve(null);
    }, timeoutMs || 1500);
    function onReply(e) {
      if (!e.data || e.data.type !== 'ace:session_response') return;
      if (e.data.reqId !== reqId || settled) return;
      settled = true;
      clearTimeout(timer);
      _sessionChannel.removeEventListener('message', onReply);
      resolve(e.data.session || null);
    }
    _sessionChannel.addEventListener('message', onReply);
    _sessionChannel.postMessage({ type: 'ace:session_request', reqId });
  });
}

// ── Silent JWT refresh ─────────────────────────────────────────────────────────
// Supabase JWTs expire after 1 hour. Before each server call we check if the
// token is within 5 minutes of expiry and silently refresh it. Prevents silent
// plan-downgrade mid-session when the JWT lapses.
async function _maybeRefreshJWT(session) {
  if (!session || !session.refreshToken) return session;
  const FIVE_MIN = 5 * 60; // seconds
  if ((Date.now() / 1000) < ((session.expiresAt || 0) - FIVE_MIN)) return session;
  try {
    const r = await fetch(ACEPASTE_SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const data = await r.json();
    if (!data.access_token) { _clearSession(); return null; }
    const refreshed = {
      ...session,
      jwt:          data.access_token,
      refreshToken: data.refresh_token || session.refreshToken,
      expiresAt:    data.expires_at,
    };
    _saveSession(refreshed);
    return refreshed;
  } catch(e) {
    return session; // network failure — use existing token optimistically
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sign in with email + password. Returns { ok, user, plan, error }.
 */
async function acePasteSignIn(email, password, captchaToken) {
  try {
    const body = { email, password };
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
    const data = await _post('/auth/v1/token?grant_type=password', body);
    if (!data.access_token) {
      // Supabase returns error_code: 'email_not_confirmed' when user hasn't verified
      const code = data.error_code || data.error || '';
      if (code === 'email_not_confirmed' || (data.error_description || '').toLowerCase().includes('not confirmed')) {
        return { ok: false, confirmPending: true, error: 'Please confirm your email before signing in — check your inbox.' };
      }
      return { ok: false, error: data.error_description || data.msg || 'Invalid credentials.' };
    }
    const jwt   = data.access_token;
    const user  = data.user;
    const plan  = await _fetchPlan(jwt, user.id);
    const session = {
      jwt,
      refreshToken: data.refresh_token || null,
      email:        user.email,
      userId:       user.id,
      plan,
      expiresAt:    data.expires_at,
    };
    _saveSession(session);
    // Dispatch the auth event so any listener (including the extension bridge)
    // knows sign-in succeeded without waiting for a separate acePasteRefreshPlan call.
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan, email: user.email } }));
    // Proactively push auth to the extension if it's installed in this browser.
    _tryPushToExtension(session);
    return { ok: true, user, plan };
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Sign up with email + password.
 * Returns { ok, confirmPending, error }.
 * confirmPending=true means the account was created but the user must verify
 * their email before they can sign in — do NOT auto-sign-in.
 */
async function acePasteSignUp(email, password, captchaToken) {
  try {
    const body = { email, password };
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
    const data = await _post('/auth/v1/signup', body);
    // Duplicate email: Supabase returns a fake-success user object (id present, identities=[])
    // to prevent user enumeration — treat empty identities as "already registered".
    if (data.id && Array.isArray(data.identities) && data.identities.length === 0) {
      return { ok: false, error: 'An account with this email already exists. Try signing in.' };
    }
    if (data.error || !data.id) {
      return { ok: false, error: data.msg || data.error || 'Sign-up failed. Please try again.' };
    }
    // If Supabase has auto-confirm enabled, email_confirmed_at is populated immediately.
    // In that case we can sign in right away; otherwise the user must verify first.
    if (data.email_confirmed_at) {
      return acePasteSignIn(email, password);
    }
    return { ok: true, confirmPending: true };
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Send a password recovery email.
 * Returns { ok, error }.
 */
async function acePasteSendRecovery(email, captchaToken) {
  try {
    const body = { email };
    if (captchaToken) body.gotrue_meta_security = { captcha_token: captchaToken };
    // Force the recovery email to land on /account.html, which has the
    // set-new-password handler. Without this, Supabase falls back to the
    // project's Site URL (currently the homepage), where the recovery hash
    // is silently ignored. Note: this URL must be on the Supabase
    // Redirect URLs allowlist or it's dropped server-side.
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin
      : 'https://acepaste.xyz';
    const redirectTo = origin + '/account.html';
    const r = await fetch(ACEPASTE_SUPABASE_URL + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), {
      method: 'POST',
      headers: _headers(),
      body: JSON.stringify(body),
    });
    // Supabase returns 200 with empty body on success (even for unknown emails,
    // to prevent user enumeration).
    return r.ok ? { ok: true } : { ok: false, error: 'Could not send recovery email. Try again.' };
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Set a new password using a recovery access token from the URL hash.
 * Call this when the page loads with #access_token=...&type=recovery in the URL.
 * Returns { ok, error }.
 */
async function acePasteSetNewPassword(accessToken, newPassword) {
  try {
    const r = await fetch(ACEPASTE_SUPABASE_URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { ..._headers(accessToken), 'Authorization': 'Bearer ' + accessToken },
      body: JSON.stringify({ password: newPassword }),
    });
    const data = await r.json();
    if (data.error) return { ok: false, error: data.error_description || data.error };
    return { ok: true };
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Parse a Supabase recovery/confirmation token from the URL hash.
 * Returns { accessToken, type } or null.
 */
function acePasteParseHashToken() {
  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return null;
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const type  = params.get('type');
    if (token && (type === 'recovery' || type === 'signup')) return { accessToken: token, type };
    return null;
  } catch(e) { return null; }
}

/**
 * Sign out — clears session.
 */
async function acePasteSignOut() {
  const session = _loadSession();
  if (session && session.jwt) {
    try { await _post('/auth/v1/logout', {}, session.jwt); } catch(e) {}
  }
  _clearSession();
  dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan: PLAN_FREE } }));
}

/**
 * Returns the current session's plan without a network call.
 * Falls back to PLAN_FREE.
 */
function acePasteCurrentPlan() {
  const s = _loadSession();
  if (!s) return PLAN_FREE;
  // Treat expired sessions as free
  if (s.expiresAt && Date.now() / 1000 > s.expiresAt) {
    _clearSession();
    return PLAN_FREE;
  }
  return s.plan || PLAN_FREE;
}

/**
 * Returns true if the user has any active paid plan.
 */
function acePasteIsPaid() {
  return acePasteCurrentPlan() !== PLAN_FREE;
}

/**
 * Refresh subscription status from the server. Call on page load.
 * Dispatches 'acepaste:auth' custom event with { plan }.
 */
async function acePasteRefreshPlan() {
  let s = _loadSession();
  if (!s || !s.jwt) {
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan: PLAN_FREE } }));
    return PLAN_FREE;
  }
  // Silently refresh the JWT if it's near expiry before hitting the server
  s = await _maybeRefreshJWT(s);
  if (!s) {
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan: PLAN_FREE } }));
    return PLAN_FREE;
  }
  try {
    const plan = await _fetchPlan(s.jwt, s.userId);
    const updated = { ...s, plan };
    _saveSession(updated);
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan, email: s.email } }));
    _tryPushToExtension(updated);
    return plan;
  } catch(e) {
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan: s.plan || PLAN_FREE } }));
    return s.plan || PLAN_FREE;
  }
}

/**
 * Returns session email, or null.
 */
function acePasteEmail() {
  const s = _loadSession();
  return s ? s.email : null;
}

// ── Internal ───────────────────────────────────────────────────────────────

/**
 * Fetches the user's active plan from the `subscriptions` table.
 * The Supabase Row-Level Security policy ensures users can only read their own row.
 */
async function _fetchPlan(jwt, userId) {
  try {
    const r = await fetch(
      ACEPASTE_SUPABASE_URL + '/functions/v1/subscription-check',
      { headers: _headers(jwt) }
    );
    const data = await r.json();
    return data.plan || PLAN_FREE;
  } catch(e) {
    return PLAN_FREE;
  }
}

// ── Extension auth bridge ──────────────────────────────────────────────────
// When account.html is opened with ?source=extension&ext_id=<id>, the page
// can post the JWT to the extension via chrome.runtime.sendMessage
// (externally_connectable). ext_id comes from chrome.runtime.id in popup.js —
// it's the actual installed extension ID, which may differ from TRUSTED_EXT_IDS
// for unpacked/dev builds.
//
// SECURITY: The real security boundary is sender.origin === 'https://acepaste.xyz'
// in background.js's onMessageExternal handler — that check is immutable from the
// extension side and cannot be bypassed via a crafted URL. We still validate that
// ext_id is a properly-formatted Chrome extension ID to prevent obviously malformed
// inputs. TRUSTED_EXT_IDS is kept for the proactive-push path (_tryPushToExtension
// on non-bridge pages) where we don't have the ext_id from the URL.

var TRUSTED_EXT_IDS = [
  'kgnnilelmfchdblcoefmokgcbpccbcci', // AcePaste Cleaner Pro (Chrome Web Store)
];

// Populated by acePasteExtensionBridge() when the page is opened by the extension.
// Allows _tryPushToExtension to target the actual installed extension ID even if it
// differs from the Web Store ID (e.g. an unpacked dev build has a browser-assigned ID).
var _bridgeExtId = null;

/**
 * Returns true if `id` is a valid Chrome extension ID format: exactly 32 chars, [a-p].
 * Chrome encodes extension IDs in base-16 using letters a–p instead of 0–9a–f.
 * This validates format without restricting to the Web Store — the real security
 * boundary is sender.origin in background.js's onMessageExternal handler.
 */
function _isValidExtId(id) {
  return typeof id === 'string' && /^[a-p]{32}$/.test(id);
}

/**
 * Proactively push auth state from any acepaste.xyz page to the installed extension.
 * Requires externally_connectable to be configured in the extension manifest (it is).
 * Fire-and-forget — safe to call when the extension is not installed; errors are swallowed.
 *
 * Targets:
 *   1. _bridgeExtId — the actual ID passed by popup.js via the bridge URL (set on bridge pages)
 *   2. TRUSTED_EXT_IDS — known published IDs (for non-bridge pages like acePasteSignIn)
 */
function _tryPushToExtension(session) {
  if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) return;
  if (!session || !session.jwt) return;
  var targets = _bridgeExtId ? [_bridgeExtId] : TRUSTED_EXT_IDS;
  var payload = {
    type:         'ACEPASTE_AUTH_TOKEN',
    jwt:          session.jwt,
    refreshToken: session.refreshToken || null,
    plan:         session.plan,
    email:        session.email,
    expiresAt:    session.expiresAt,
  };
  for (var i = 0; i < targets.length; i++) {
    (function(id) {
      try {
        chrome.runtime.sendMessage(id, payload, function(resp) {
          // Consume lastError to suppress Chrome's unchecked-error warning.
          void chrome.runtime.lastError;
        });
      } catch(e) { /* extension not installed or context unavailable — ignore */ }
    })(targets[i]);
  }
}

function acePasteExtensionBridge() {
  const params = new URLSearchParams(location.search);
  const source = params.get('source');
  const extId  = params.get('ext_id');
  if (source !== 'extension' || !extId) return;

  // Validate that extId is a properly-formatted Chrome extension ID (32 chars, [a-p]).
  // We intentionally do NOT restrict to TRUSTED_EXT_IDS here — that would silently
  // break unpacked/dev builds whose browser-assigned IDs aren't in the allowlist.
  // The real security boundary is sender.origin in background.js's onMessageExternal:
  // only messages from https://acepaste.xyz are accepted by the extension.
  if (!_isValidExtId(extId)) {
    console.warn('[AcePaste] Blocked bridge attempt — invalid ext_id format:', extId);
    return;
  }

  // Store the bridge ext_id so _tryPushToExtension targets the right extension.
  _bridgeExtId = extId;

  // Send token to extension and close the tab once auth is confirmed.
  function _sendToExtension(detail) {
    const s = _loadSession();
    if (!s || !s.jwt) return;
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(extId, {
          type:         'ACEPASTE_AUTH_TOKEN',
          jwt:          s.jwt,
          refreshToken: s.refreshToken || null,
          plan:         detail.plan,
          email:        s.email,
          expiresAt:    s.expiresAt,
        }, function(resp) {
          if (chrome.runtime.lastError) {
            console.warn('[AcePaste] Extension message failed:', chrome.runtime.lastError.message);
            // Don't close — leave the tab open so the user can see something went wrong.
            const notice = document.getElementById('extBridgeNotice');
            if (notice) {
              notice.textContent = 'Could not reach extension — try reloading it in chrome://extensions, then sign in again.';
              notice.style.display = 'block';
            }
            return;
          }
          setTimeout(function() { window.close(); }, 800);
        });
      } catch(err) {
        console.warn('[AcePaste] Could not reach extension:', err);
      }
    }
  }

  window.addEventListener('acepaste:auth', function(e) {
    _sendToExtension(e.detail);
  });

  // ── Silent single-sign-on via cross-tab session relay ──────────────────
  // If this tab already has a session (edge case: user signed in before the
  // bridge was triggered), fire immediately without any network round-trip.
  const existing = _loadSession();
  if (existing && existing.jwt) {
    acePasteRefreshPlan();
    return;
  }

  // No local session — ask other open acepaste.xyz tabs for theirs.
  // This is the fix for "already signed in on web but extension still asks
  // for login": sessionStorage is tab-isolated so the new bridge tab starts
  // empty even though the original tab has a valid session. We relay it here
  // via BroadcastChannel (origin-scoped, safe) so the user never has to
  // sign in twice.
  const notice = document.getElementById('extBridgeNotice');
  if (notice) {
    notice.textContent = 'Connecting to extension…';
    notice.style.display = 'block';
  }

  _requestPeerSession(1500).then(function(peerSession) {
    if (!peerSession || !peerSession.jwt) {
      // No peer session found — fall through to the normal login form.
      if (notice) notice.style.display = 'none';
      return;
    }
    // Inherit the session from the signed-in tab, then trigger the bridge.
    _saveSession(peerSession);
    acePasteRefreshPlan(); // fires acepaste:auth → _sendToExtension → tab closes
  });
}

// Auto-invoke bridge if query params are present
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', acePasteExtensionBridge);
}
