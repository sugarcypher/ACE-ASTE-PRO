// Lazy-loaded Termly consent handler - only loads when user clicks consent preferences
window.handleTermlyPreferences = function() {
  const tryOpenPreferences = () => {
    if (window.termly) {
      if (typeof window.termly.openPreferences === 'function') {
        window.termly.openPreferences();
        return true;
      } else if (typeof window.termly.showPreferences === 'function') {
        window.termly.showPreferences();
        return true;
      } else if (typeof window.termly.displayPreferences === 'function') {
        window.termly.displayPreferences();
        return true;
      }
    }
    
    const termlyPrefsBtn = document.querySelector('[data-termly-preferences]') || 
                           document.querySelector('.termly-preferences-button') ||
                           document.querySelector('[class*="termly"][class*="preference"]') ||
                           document.querySelector('button[onclick*="termly"]') ||
                           document.querySelector('a[onclick*="termly"]');
    if (termlyPrefsBtn) {
      termlyPrefsBtn.click();
      return true;
    }
    return false;
  };
  
  if (tryOpenPreferences()) {
    return;
  }
  
  let attempts = 0;
  const maxAttempts = 10;
  const checkInterval = setInterval(() => {
    attempts++;
    if (tryOpenPreferences() || attempts >= maxAttempts) {
      clearInterval(checkInterval);
      if (attempts >= maxAttempts && !tryOpenPreferences()) {
        if (window.location.pathname !== '/') {
          window.location.href = '/';
        } else {
          if (typeof showNotice === 'function') {
            showNotice('Cookie preferences are loading. Please wait a moment and try again, or use the cookie consent banner.', 'error');
          }
        }
      }
    }
  }, 200);
};

