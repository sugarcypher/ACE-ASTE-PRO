/**
 * auth.js — Ace Paste Cleaner Pro shared auth + subscription layer
 *
 * Loaded by index.html and account.html. Also imported by the extension
 * indirectly via a REST API. Uses Supabase Auth (email/password) and a
 * `subscriptions` table to track active plans.
 *
 * Replace the two constants below with your actual Supabase project values.
 */

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

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Sign in with email + password. Returns { ok, user, plan, error }.
 */
async function acePasteSignIn(email, password) {
  try {
    const data = await _post('/auth/v1/token?grant_type=password', { email, password });
    if (!data.access_token) {
      return { ok: false, error: data.error_description || data.msg || 'Invalid credentials' };
    }
    const jwt   = data.access_token;
    const user  = data.user;
    const plan  = await _fetchPlan(jwt, user.id);
    const session = { jwt, email: user.email, userId: user.id, plan, expiresAt: data.expires_at };
    _saveSession(session);
    return { ok: true, user, plan };
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

/**
 * Sign up with email + password. Returns { ok, user, plan, error }.
 */
async function acePasteSignUp(email, password) {
  try {
    const data = await _post('/auth/v1/signup', { email, password });
    if (data.error || !data.id) {
      return { ok: false, error: data.msg || data.error || 'Sign-up failed' };
    }
    // Auto sign-in after successful signup
    return acePasteSignIn(email, password);
  } catch(e) {
    return { ok: false, error: 'Network error. Please try again.' };
  }
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
  const s = _loadSession();
  if (!s || !s.jwt) {
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan: PLAN_FREE } }));
    return PLAN_FREE;
  }
  try {
    const plan = await _fetchPlan(s.jwt, s.userId);
    _saveSession({ ...s, plan });
    dispatchEvent(new CustomEvent('acepaste:auth', { detail: { plan, email: s.email } }));
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
    // Call the edge function instead of querying the table directly
    // This keeps the plan logic server-side and avoids RLS complexity
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
// When loaded on the /auth/extension page, the page can post the JWT
// to the extension via chrome.runtime.sendMessage (externally_connectable).

function acePasteExtensionBridge() {
  const params = new URLSearchParams(location.search);
  const source = params.get('source');
  const extId  = params.get('ext_id');
  if (source !== 'extension' || !extId) return;

  // After auth, send token to extension and close the tab
  window.addEventListener('acepaste:auth', function(e) {
    const s = _loadSession();
    if (!s || !s.jwt) return;
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.sendMessage(extId, {
          type: 'ACEPASTE_AUTH_TOKEN',
          jwt: s.jwt,
          plan: e.detail.plan,
          email: s.email,
          expiresAt: s.expiresAt,
        }, function() {
          // Close this tab after a brief confirmation delay
          setTimeout(function() { window.close(); }, 800);
        });
      } catch(err) {
        console.warn('[AcePaste] Could not reach extension:', err);
      }
    }
  });
}

// Auto-invoke bridge if query params are present
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', acePasteExtensionBridge);
}
