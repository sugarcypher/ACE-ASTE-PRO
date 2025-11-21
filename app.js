// Ace Paste Cleaner Pro - Client-side text cleaning
document.addEventListener('DOMContentLoaded', () => {
  // Initialize dark mode
  initDarkMode();
  
  // Initialize Global Privacy Control (GPC)
  initGlobalPrivacyControl();
  
  // Event listeners
  const cleanBtn = document.getElementById('cleanBtn');
  const pasteBtn = document.getElementById('pasteBtn');
  const clearBtn = document.getElementById('clearBtn');
  const moreOptions = document.getElementById('moreOptions');
  const darkModeToggle = document.getElementById('darkModeToggle');
  
  if (cleanBtn) cleanBtn.addEventListener('click', cleanText);
  if (pasteBtn) pasteBtn.addEventListener('click', pasteFromClipboard);
  if (clearBtn) clearBtn.addEventListener('click', clearFields);
  if (moreOptions) {
    moreOptions.addEventListener('click', () => {
      const adv = document.getElementById('advanced');
      const btn = document.getElementById('moreOptions');
      adv.classList.toggle('hidden');
      btn.textContent = adv.classList.contains('hidden') ? 'Advanced options ▾' : 'Advanced options ▴';
    });
  }
  if (darkModeToggle) {
    darkModeToggle.addEventListener('click', toggleDarkMode);
  }
  
  // Termly consent preferences link handler
  const consentLinks = document.querySelectorAll('.termly-display-preferences');
  consentLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Wait for Termly to be ready, then try to open preferences
      const tryOpenPreferences = () => {
        // Try various Termly API methods
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
        
        // Try to find and trigger Termly's preferences button
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
      
      // Try immediately
      if (tryOpenPreferences()) {
        return;
      }
      
      // If Termly isn't ready, wait a bit and try again
      let attempts = 0;
      const maxAttempts = 10;
      const checkInterval = setInterval(() => {
        attempts++;
        if (tryOpenPreferences() || attempts >= maxAttempts) {
          clearInterval(checkInterval);
          if (attempts >= maxAttempts && !tryOpenPreferences()) {
            // Fallback: redirect to main page
            if (window.location.pathname !== '/') {
              window.location.href = '/';
            } else {
              alert('Cookie preferences are loading. Please wait a moment and try again, or use the cookie consent banner.');
            }
          }
        }
      }, 200);
    });
  });
});

function initGlobalPrivacyControl() {
  // Check for Global Privacy Control (GPC) signal
  // GPC is required by CCPA/CPRA to honor user opt-out requests
  const gpcEnabled = navigator.globalPrivacyControl === true || 
                     navigator.doNotTrack === '1' ||
                     (typeof navigator.globalPrivacyControl !== 'undefined' && navigator.globalPrivacyControl);
  
  if (gpcEnabled) {
    // Store GPC preference
    localStorage.setItem('gpcOptOut', 'true');
    
    // Disable personalized advertising by setting Google AdSense to non-personalized
    // This is done by setting the google_adsense_opt_out cookie or using non-personalized ads
    try {
      // Set a flag that can be used to request non-personalized ads
      document.cookie = 'google_adsense_opt_out=true; path=/; max-age=31536000; SameSite=Lax';
      
      // Log GPC detection for compliance purposes
      console.log('Global Privacy Control (GPC) detected - personalized advertising disabled');
    } catch (e) {
      console.warn('Could not set GPC opt-out cookie:', e);
    }
  } else {
    // Clear GPC opt-out if not enabled
    localStorage.removeItem('gpcOptOut');
  }
}

function initDarkMode() {
  const isDark = localStorage.getItem('darkMode') === 'true';
  if (isDark) {
    document.body.classList.add('dark-mode');
    updateDarkModeIcon(true);
  }
}

function toggleDarkMode() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('darkMode', isDark);
  updateDarkModeIcon(isDark);
}

function updateDarkModeIcon(isDark) {
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) {
    toggle.textContent = isDark ? '☀️' : '🌙';
  }
}

async function pasteFromClipboard() {
  const pasteField = document.getElementById('paste');
  
  // Try modern Clipboard API first
  if (navigator.clipboard && navigator.clipboard.readText) {
    try {
      const text = await navigator.clipboard.readText();
      pasteField.value = text;
      pasteField.focus();
      return;
    } catch (err) {
      console.warn('Clipboard API failed, trying fallback:', err);
    }
  }
  
  // Fallback: Focus the field and prompt user to paste manually
  pasteField.focus();
  pasteField.select();
  
  // Try to trigger paste event
  try {
    const pasteEvent = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer()
    });
    document.execCommand('paste');
  } catch (e) {
    // If that fails, show helpful message
    const currentValue = pasteField.value;
    pasteField.placeholder = 'Click here and press Ctrl+V (Cmd+V on Mac) to paste';
    pasteField.focus();
    
    setTimeout(() => {
      if (pasteField.value === currentValue) {
        pasteField.placeholder = 'Paste here…';
      }
    }, 2000);
  }
}

function clearFields() {
  document.getElementById('paste').value = '';
  document.getElementById('cleaned').value = '';
  document.getElementById('paste').focus();
}

function cleanText() {
  try {
    let text = document.getElementById('paste').value;
    if (!text) {
      document.getElementById('cleaned').value = '';
      return;
    }
  
  // Always remove zero-width characters (core function)
  const zwRe = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
  text = text.replace(zwRe, '');
  
  // Remove markdown
  if (document.getElementById('removeMarkdown').checked) {
    // Remove markdown headers
    text = text.replace(/(?:^|\s)(#{1,6})\s/gm, ' ');
    // Remove markdown bold/italic (only when used as markdown, not regular punctuation)
    text = text.replace(/\*\*([^*]+)\*\*/g, '$1'); // Bold: **text**
    text = text.replace(/\*([^*\n]+?)\*/g, '$1'); // Italic: *text* (but not if it's just a single asterisk)
    text = text.replace(/__([^_]+)__/g, '$1'); // Bold: __text__
    text = text.replace(/_([^_\n\s]+?)_/g, '$1'); // Italic: _text_ (but not underscores in words)
    // Remove code blocks and inline code
    text = text.replace(/```[\s\S]*?```/g, ''); // Code blocks
    text = text.replace(/`([^`]+)`/g, '$1'); // Inline code
    // Remove strikethrough
    text = text.replace(/~~([^~]+)~~/g, '$1');
    // Remove markdown links [text](url) but keep the text
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    // Remove markdown images ![alt](url)
    text = text.replace(/!\[([^\]]*)\]\([^\)]+\)/g, '');
    // Remove blockquote markers at start of lines
    text = text.replace(/^>\s+/gm, '');
    // Remove markdown list markers
    text = text.replace(/^[\s]*[-*+]\s+/gm, '');
    text = text.replace(/^[\s]*\d+\.\s+/gm, '');
  }
  
  // Remove AI markup
  if (document.getElementById('removeAIMarkup').checked) {
    text = text.replace(/(\*{2,}|\*{3,}|#{2,}|\+{2,}|={2,}|-{2,}|_{2,})/g, '');
  }
  
  // Advanced options
  const adv = document.getElementById('advanced');
  if (!adv.classList.contains('hidden')) {
    // Collapse spaces
    if (document.getElementById('collapseSpaces').checked) {
      text = text.replace(/[ \t]+/g, ' ');
    }
    
    // Collapse newlines
    if (document.getElementById('collapseNewlines').checked) {
      text = text.replace(/\n{3,}/g, '\n\n');
    }
    
    // Trim per line
    if (document.getElementById('trimPerLine').checked) {
      text = text.split('\n').map(l => l.trim()).join('\n');
    }
    
    // Remove HTML tags
    if (document.getElementById('removeHtml').checked) {
      text = text.replace(/<|>/g, '');
    }
    
    // Remove comments
    if (document.getElementById('removeComments').checked) {
      text = text.replace(/#\s*(italic|bold|comment)[^\n]*/gi, '');
      text = text.replace(/\/\/[^\n]*/g, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');
      // Remove HTML comments recursively until no more matches
      let prevText;
      do {
        prevText = text;
        text = text.replace(/<!--[\s\S]*?-->/g, '');
      } while (text !== prevText);
    }
    
    // Case transform
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
    
    // Remove punctuation
    const punctuationSelect = document.getElementById('removePunctuation');
    if (punctuationSelect) {
      const selectedPunctuation = Array.from(punctuationSelect.selectedOptions).map(opt => opt.value);
      if (selectedPunctuation.length > 0) {
        // Escape special regex characters
        const escaped = selectedPunctuation.map(p => {
          // Escape special regex characters: . * + ? ^ $ { } [ ] \ | ( )
          return p.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');
        });
        const punctuationRegex = new RegExp('[' + escaped.join('') + ']', 'g');
        text = text.replace(punctuationRegex, '');
      }
    }
    
    // Custom find/replace
    const find = document.getElementById('customFind').value;
    const replace = document.getElementById('customReplace').value;
    const useRegex = document.getElementById('customRegex').checked;
    if (find) {
      try {
        if (useRegex) {
          const regex = new RegExp(find, 'g');
          text = text.replace(regex, replace || '');
        } else {
          text = text.split(find).join(replace || '');
        }
      } catch (e) {
        console.error('Regex error:', e);
      }
    }
  }
  
  document.getElementById('cleaned').value = text;
  } catch (error) {
    console.error('Error cleaning text:', error);
    alert('An error occurred while cleaning the text. Please check the console for details.');
  }
}
