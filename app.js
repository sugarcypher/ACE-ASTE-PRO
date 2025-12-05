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
  const copyBtn = document.getElementById('copyBtn');
  const moreOptions = document.getElementById('moreOptions');
  const darkModeToggle = document.getElementById('darkModeToggle');
  
  if (cleanBtn) cleanBtn.addEventListener('click', cleanText);
  if (pasteBtn) pasteBtn.addEventListener('click', pasteFromClipboard);
  if (clearBtn) clearBtn.addEventListener('click', clearFields);
  if (copyBtn) copyBtn.addEventListener('click', copyToClipboard);
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
  const reportDiv = document.getElementById('cleaningReport');
  if (reportDiv) {
    reportDiv.classList.add('hidden');
    reportDiv.innerHTML = '';
  }
  document.getElementById('paste').focus();
}

async function copyToClipboard() {
  const cleanedField = document.getElementById('cleaned');
  const text = cleanedField.value;
  
  if (!text) {
    alert('Nothing to copy. Clean some text first!');
    return;
  }
  
  try {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      const copyBtn = document.getElementById('copyBtn');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      copyBtn.style.background = 'linear-gradient(#2fd163, #28b856)';
      setTimeout(() => {
        copyBtn.textContent = originalText;
        copyBtn.style.background = '';
      }, 2000);
      return;
    }
    
    // Fallback for older browsers
    cleanedField.select();
    cleanedField.setSelectionRange(0, 99999); // For mobile devices
    document.execCommand('copy');
    const copyBtn = document.getElementById('copyBtn');
    const originalText = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    copyBtn.style.background = 'linear-gradient(#2fd163, #28b856)';
    setTimeout(() => {
      copyBtn.textContent = originalText;
      copyBtn.style.background = '';
    }, 2000);
  } catch (err) {
    console.error('Failed to copy:', err);
    alert('Failed to copy to clipboard. Please select and copy manually.');
  }
}

function cleanText() {
  try {
    let text = document.getElementById('paste').value;
    if (!text) {
      document.getElementById('cleaned').value = '';
      const reportDiv = document.getElementById('cleaningReport');
      if (reportDiv) {
        reportDiv.classList.add('hidden');
        reportDiv.innerHTML = '';
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
    custom: 0
  };
  
  // Remove zero-width characters (if enabled)
  if (document.getElementById('removeInvisible').checked) {
    const zwRe = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;
    const zwMatches = text.match(zwRe);
    report.zeroWidth = zwMatches ? zwMatches.length : 0;
    text = text.replace(zwRe, '');
  }
  
  // Remove emojis (if enabled)
  if (document.getElementById('removeEmojis').checked) {
    const beforeEmojis = text.length;
    // Comprehensive emoji regex pattern - covers all major emoji ranges
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2190}-\u{21FF}]|[\u{2300}-\u{23FF}]|[\u{24C2}-\u{1F251}]|[\u{1F018}-\u{1F270}]|[\u{238C}-\u{2454}]|[\u{20D0}-\u{20FF}]/gu;
    // Also remove emoji sequences (flags, skin tone modifiers, etc.)
    const emojiSequenceRegex = /[\u{1F3FB}-\u{1F3FF}]|[\u{1F9B0}-\u{1F9B3}]|[\u{200D}]/gu;
    text = text.replace(emojiRegex, '').replace(emojiSequenceRegex, '');
    report.emojis = beforeEmojis - text.length;
  }
  
  // Remove formatting (if enabled) - removes rich text formatting characters
  if (document.getElementById('removeFormatting').checked) {
    const beforeFormatting = text.length;
    // Remove various formatting characters: soft hyphens, non-breaking spaces (keep regular spaces), zero-width joiners, etc.
    text = text.replace(/[\u00AD\u2000-\u200B\u2028-\u2029\uFEFF]/g, '');
    // Remove non-breaking spaces but keep regular spaces
    text = text.replace(/\u00A0/g, ' ');
    report.formatting = beforeFormatting - text.length;
  }
  
  // Remove markdown
  if (document.getElementById('removeMarkdown').checked) {
    const beforeMarkdown = text.length;
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
    report.markdown = beforeMarkdown - text.length;
  }
  
  // Remove AI markup
  if (document.getElementById('removeAIMarkup').checked) {
    const beforeAI = text.length;
    text = text.replace(/(\*{2,}|\*{3,}|#{2,}|\+{2,}|={2,}|-{2,}|_{2,})/g, '');
    report.aiMarkup = beforeAI - text.length;
  }
  
  // Advanced options
  const adv = document.getElementById('advanced');
  if (!adv.classList.contains('hidden')) {
    // Collapse spaces
    if (document.getElementById('collapseSpaces').checked) {
      const beforeSpaces = text.length;
      text = text.replace(/[ \t]+/g, ' ');
      report.spaces = beforeSpaces - text.length;
    }
    
    // Collapse newlines
    if (document.getElementById('collapseNewlines').checked) {
      const beforeNewlines = text.length;
      text = text.replace(/\n{3,}/g, '\n\n');
      report.newlines = beforeNewlines - text.length;
    }
    
    // Trim per line
    if (document.getElementById('trimPerLine').checked) {
      text = text.split('\n').map(l => l.trim()).join('\n');
    }
    
    // Remove HTML tags
    if (document.getElementById('removeHtml').checked) {
      const beforeHTML = text.length;
      text = text.replace(/<|>/g, '');
      report.html = beforeHTML - text.length;
    }
    
    // Remove comments
    if (document.getElementById('removeComments').checked) {
      const beforeComments = text.length;
      text = text.replace(/#\s*(italic|bold|comment)[^\n]*/gi, '');
      text = text.replace(/\/\/[^\n]*/g, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');
      // Remove HTML comments recursively until no more matches
      let prevText;
      do {
        prevText = text;
        text = text.replace(/<!--[\s\S]*?-->/g, '');
      } while (text !== prevText);
      report.comments = beforeComments - text.length;
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
        const beforePunctuation = text.length;
        // Escape special regex characters
        const escaped = selectedPunctuation.map(p => {
          // Escape special regex characters: . * + ? ^ $ { } [ ] \ | ( )
          return p.replace(/[.*+?^${}()[\]\\|]/g, '\\$&');
        });
        const punctuationRegex = new RegExp('[' + escaped.join('') + ']', 'g');
        text = text.replace(punctuationRegex, '');
        report.punctuation = beforePunctuation - text.length;
      }
    }
    
    // Custom find/replace
    const find = document.getElementById('customFind').value;
    const replace = document.getElementById('customReplace').value;
    const useRegex = document.getElementById('customRegex').checked;
    if (find) {
      try {
        const beforeCustom = text.length;
        if (useRegex) {
          const regex = new RegExp(find, 'g');
          text = text.replace(regex, replace || '');
        } else {
          text = text.split(find).join(replace || '');
        }
        report.custom = beforeCustom - text.length;
      } catch (e) {
        console.error('Regex error:', e);
      }
    }
  }
  
  const finalLength = text.length;
  const totalRemoved = originalLength - finalLength;
  
  // Display the report
  displayCleaningReport(report, originalLength, finalLength, totalRemoved);
  
  document.getElementById('cleaned').value = text;
  } catch (error) {
    console.error('Error cleaning text:', error);
    alert('An error occurred while cleaning the text. Please check the console for details.');
  }
}

function displayCleaningReport(report, originalLength, finalLength, totalRemoved) {
  const reportDiv = document.getElementById('cleaningReport');
  if (!reportDiv) {
    console.error('Cleaning report div not found!');
    return;
  }
  
  // Always show the report when cleaning happens
  reportDiv.classList.remove('hidden');
  
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
  if (report.custom > 0) {
    html += `<li class="report-item"><span class="report-label">Custom replacements</span><span class="report-count">${report.custom} chars</span></li>`;
    hasItems = true;
  }
  
  if (!hasItems) {
    html += '<li class="report-item"><span class="report-label">No changes detected</span></li>';
  }
  
  html += '</ul>';
  
  if (totalRemoved !== 0 || originalLength !== finalLength) {
    const percentage = originalLength > 0 ? ((totalRemoved/originalLength)*100).toFixed(1) : '0.0';
    html += `<div class="report-total">Total: ${originalLength} → ${finalLength} characters (${totalRemoved > 0 ? totalRemoved + ' removed' : 'no change'}, ${percentage}%)</div>`;
  } else {
    html += `<div class="report-total">Total: ${originalLength} characters (no changes)</div>`;
  }
  
  reportDiv.innerHTML = html;
}
