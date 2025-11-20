// Ace Paste Cleaner Pro - Client-side text cleaning
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('cleanBtn').addEventListener('click', cleanText);
  document.getElementById('pasteBtn').addEventListener('click', pasteFromClipboard);
  document.getElementById('clearBtn').addEventListener('click', clearFields);
  document.getElementById('moreOptions').addEventListener('click', () => {
    const adv = document.getElementById('advanced');
    const btn = document.getElementById('moreOptions');
    adv.classList.toggle('hidden');
    btn.textContent = adv.classList.contains('hidden') ? 'Advanced options ▾' : 'Advanced options ▴';
  });
});

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
  let text = document.getElementById('paste').value;
  if (!text) return;
  
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
      text = text.replace(/<[^>\n]+>/g, '');
    }
    
    // Remove comments
    if (document.getElementById('removeComments').checked) {
      text = text.replace(/#\s*(italic|bold|comment)[^\n]*/gi, '');
      text = text.replace(/\/\/[^\n]*/g, '');
      text = text.replace(/\/\*[\s\S]*?\*\//g, '');
      text = text.replace(/<!--[\s\S]*?-->/g, '');
    }
    
    // Case transform
    const caseTx = document.querySelector('input[name="caseTx"]:checked').value;
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
}
