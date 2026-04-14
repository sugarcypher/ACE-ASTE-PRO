// Ace Paste Cleaner Pro - Firebase Auth & Tier Management
// Requires Firebase SDK loaded via CDN in index.html

// ============================================================
// CONFIGURATION - Replace with your Firebase project config
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID'
};

// Email link sign-in settings
const ACTION_CODE_SETTINGS = {
  url: window.location.origin,
  handleCodeInApp: true
};

// ============================================================
// TIER SYSTEM
// ============================================================
const TIERS = {
  GUEST: 'guest',
  FREE: 'free',
  PAID: 'paid',
  PRO: 'pro'
};

// Feature-to-tier mapping (all free for now — change values to gate features later)
const FEATURE_TIERS = {
  removeInvisible: TIERS.FREE,
  removeMarkdown: TIERS.FREE,
  removeAIMarkup: TIERS.FREE,
  removeEmojis: TIERS.FREE,
  removeFormatting: TIERS.FREE,
  collapseSpaces: TIERS.FREE,
  collapseNewlines: TIERS.FREE,
  trimPerLine: TIERS.FREE,
  removeHtml: TIERS.FREE,
  removeNumerals: TIERS.FREE,
  removeDates: TIERS.FREE,
  removeSymbolPairs: TIERS.FREE,
  removeComments: TIERS.FREE,
  batchFindReplace: TIERS.FREE,
  removePunctuation: TIERS.FREE
};

const TIER_RANK = { guest: 0, free: 1, paid: 2, pro: 3 };

let currentUser = null;
let currentTier = TIERS.GUEST;

function getUserTier() {
  return currentTier;
}

function isFeatureAvailable(featureName) {
  const requiredTier = FEATURE_TIERS[featureName] || TIERS.FREE;
  return TIER_RANK[currentTier] >= TIER_RANK[requiredTier];
}

function updateFeatureGating() {
  // Apply tier-locked class to features above the user's tier
  Object.keys(FEATURE_TIERS).forEach(featureId => {
    const el = document.getElementById(featureId);
    if (!el) return;
    const label = el.closest('label');
    if (!label) return;
    if (isFeatureAvailable(featureId)) {
      label.classList.remove('tier-locked');
      el.disabled = false;
    } else {
      label.classList.add('tier-locked');
      el.disabled = true;
      el.checked = false;
    }
  });
  // Batch find/replace container
  const batchContainer = document.getElementById('batchFindReplace');
  if (batchContainer) {
    if (!isFeatureAvailable('batchFindReplace')) {
      batchContainer.classList.add('tier-locked');
    } else {
      batchContainer.classList.remove('tier-locked');
    }
  }
}

// ============================================================
// AUTH UI
// ============================================================
function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) { modal.classList.remove('hidden'); modal.style.display = ''; }
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) { modal.classList.add('hidden'); modal.style.display = 'none'; }
}

function updateHeaderAuth(user) {
  const authArea = document.getElementById('headerAuth');
  if (!authArea) return;

  if (user) {
    const displayName = user.displayName || user.email || 'User';
    authArea.innerHTML = '';
    const span = document.createElement('span');
    span.className = 'auth-user';
    span.textContent = displayName;
    const btn = document.createElement('button');
    btn.className = 'btn-ghost auth-signout';
    btn.textContent = 'Sign out';
    btn.addEventListener('click', signOut);
    authArea.appendChild(span);
    authArea.appendChild(btn);
  } else {
    authArea.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-ghost auth-signin';
    btn.textContent = 'Sign in';
    btn.addEventListener('click', showAuthModal);
    authArea.appendChild(btn);
  }
}

// ============================================================
// FIREBASE AUTH LOGIC
// ============================================================
let firebaseApp = null;
let firebaseAuth = null;

function initFirebaseAuth() {
  // Check if Firebase SDK is loaded
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded - auth disabled');
    return;
  }

  try {
    firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();

    // Check for email link sign-in completion
    if (firebase.auth().isSignInWithEmailLink(window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt('Please provide your email for confirmation');
      }
      if (email) {
        firebase.auth().signInWithEmailLink(email, window.location.href)
          .then(result => {
            window.localStorage.removeItem('emailForSignIn');
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname);
          })
          .catch(err => {
            console.error('Email link sign-in error:', err);
            alert('Sign-in failed. Please try again.');
          });
      }
    }

    // Auth state observer
    firebase.auth().onAuthStateChanged(user => {
      currentUser = user;
      if (user) {
        currentTier = TIERS.FREE; // Default tier for logged-in users
        // Check custom claims for paid/pro tier
        user.getIdTokenResult().then(tokenResult => {
          if (tokenResult.claims.tier) {
            currentTier = tokenResult.claims.tier;
          }
          updateFeatureGating();
          updateHeaderAuth(user);
          hideAuthModal();
        });
      } else {
        currentTier = TIERS.GUEST;
        updateFeatureGating();
        updateHeaderAuth(null);
      }
    });
  } catch (err) {
    console.warn('Firebase init error:', err);
  }
}

function sendEmailLink() {
  const emailInput = document.getElementById('authEmail');
  if (!emailInput || !emailInput.value) {
    alert('Please enter your email address.');
    return;
  }
  const email = emailInput.value.trim();

  if (!firebaseAuth) {
    alert('Authentication is not configured yet. Please try again later.');
    return;
  }

  firebaseAuth.sendSignInLinkToEmail(email, ACTION_CODE_SETTINGS)
    .then(() => {
      window.localStorage.setItem('emailForSignIn', email);
      const statusEl = document.getElementById('authStatus');
      if (statusEl) {
        statusEl.textContent = 'Check your email for a sign-in link!';
        statusEl.classList.remove('hidden');
      }
    })
    .catch(err => {
      console.error('Send email link error:', err);
      alert('Failed to send sign-in link. Please check your email and try again.');
    });
}

function signInWithGoogle() {
  if (!firebaseAuth) {
    alert('Authentication is not configured yet. Please try again later.');
    return;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  firebaseAuth.signInWithPopup(provider)
    .catch(err => {
      console.error('Google sign-in error:', err);
      alert('Google sign-in failed. Please try again.');
    });
}

function signOut() {
  if (firebaseAuth) {
    firebaseAuth.signOut();
  }
  currentUser = null;
  currentTier = TIERS.GUEST;
  updateFeatureGating();
  updateHeaderAuth(null);
}

function continueAsGuest() {
  hideAuthModal();
  currentTier = TIERS.GUEST;
  updateFeatureGating();
  updateHeaderAuth(null);
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Wire up auth modal buttons
  const sendLinkBtn = document.getElementById('authSendLink');
  if (sendLinkBtn) sendLinkBtn.addEventListener('click', sendEmailLink);

  const googleBtn = document.getElementById('authGoogle');
  if (googleBtn) googleBtn.addEventListener('click', signInWithGoogle);

  const guestBtn = document.getElementById('authGuest');
  if (guestBtn) guestBtn.addEventListener('click', continueAsGuest);

  // Allow Enter key on email input
  const emailInput = document.getElementById('authEmail');
  if (emailInput) {
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendEmailLink();
      }
    });
  }

  // Initialize Firebase Auth
  initFirebaseAuth();
});
