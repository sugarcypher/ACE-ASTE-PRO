/* All client-side. No tracking. */
(function(){
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  // UI elements
  const input = $('#input');
  const output = $('#output');
  const metrics = $('#metrics');

  // Option getters
  const opts = {
    zero: () => $('#opt-zero').checked,
    markdown: () => $('#opt-markdown').checked,
    dashes: () => $('#opt-dashes').checked,
    smart: () => $('#opt-smartquotes').checked,
    html: () => $('#opt-html').checked,
    urls: () => $('#opt-urls').checked,
    hashlines: () => $('#opt-hashlines').checked,
    emojis: () => $('#opt-emojis').checked,
    trimspaces: () => $('#opt-trimspaces').checked,
    blanklines: () => $('#opt-blanklines').checked,
    useRegex: () => $('#rule-regex').checked
  };

  // Rules
  const rulesEl = $('#rules');
  const ruleType = $('#rule-type');
  const rulePattern = $('#rule-pattern');
  const ruleRepl = $('#rule-repl');
  $('#add-rule').addEventListener('click', () => {
    const type = ruleType.value;
    const pat = rulePattern.value;
    const repl = ruleRepl.value;
    if(!pat) return;
    addRule({type, pat, repl});
    rulePattern.value=''; ruleRepl.value='';
    persistRules();
  });

  function addRule({type, pat, repl}){
    const div = document.createElement('div');
    div.className = 'rule';
    div.dataset.type = type;
    div.dataset.pat = pat;
    div.dataset.repl = repl || '';
    div.innerHTML = `<span><strong>${type}</strong>: <code>${escapeHtml(pat)}</code> ${type==='replace'?`→ <code>${escapeHtml(repl||'')}</code>`:''}</span><button class="kill" title="Remove">✕</button>`;
    div.querySelector('.kill').addEventListener('click', () => { div.remove(); persistRules(); });
    rulesEl.appendChild(div);
  }

  function getRules(){
    return $$('.rule').map(n => ({
      type: n.dataset.type,
      pat: n.dataset.pat,
      repl: n.dataset.repl
    }));
  }

  function persistRules(){
    localStorage.setItem('acepaste_rules', JSON.stringify(getRules()));
  }

  // Load rules
  try {
    const saved = JSON.parse(localStorage.getItem('acepaste_rules') || '[]');
    saved.forEach(addRule);
  } catch(e){}

  // Cleaning pipeline
  function cleanText(src){
    let before = src;
    let removedChars = 0;
    const removalKinds = {};

    function rm(re, label){
      const prev = before.length;
      before = before.replace(re, '');
      const diff = prev - before.length;
      if(diff>0){ removedChars+=diff; removalKinds[label]=(removalKinds[label]||0)+diff; }
    }
    function rep(re, to, label){
      const prev = before.length;
      before = before.replace(re, to);
      const diff = prev - before.length;
      if(diff>0){ removalKinds[label]=(removalKinds[label]||0)+diff; }
    }

    if(opts.zero()){
      // zero-width, NBSP, BOM
      rep(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g, '', 'zero-width');
      rep(/\u00A0/g, ' ', 'nbsp→space');
    }

    if(opts.html()){
      // remove tags and decode a few common entities
      rep(/<[^>]+>/g, '', 'html-tags');
      before = before.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    }

    if(opts.markdown()){
      // inline code, bold/italic markers, headings, links, images
      rep(/`{1,3}[^`]*`{1,3}/g, s => s.replace(/`/g,''), 'backticks');
      rep(/(\*\*|__)(.*?)\1/g, '$2', 'md-strong');
      rep(/(\*|_)(.*?)\1/g, '$2', 'md-em');
      rep(/^#{1,6}\s+/gm, '', 'md-headings');
      rep(/!\[[^\]]*]\([^)]*\)/g, '', 'md-images');
      rep(/\[[^\]]*]\([^)]*\)/g, (m)=>{
        const text = m.replace(/^\[/,'').replace(/]\(.+$/,'');
        return text;
      }, 'md-links');
      rm(/^\s{0,3}>\s?/gm, 'md-quotes');
      rm(/^\s*[-*+]\s+/gm, 'md-lists');
      rep(/\\([#()*_`[\]{}\\])/g, '$1', 'md-escapes');
    }

    if(opts.dashes()){
      before = before.replace(/[–—]/g, '-').replace(/-{2,}/g, '-');
    }

    if(opts.smart()){
      before = before
        .replace(/[“”«»„‟]/g, '"')
        .replace(/[‘’‚‛]/g, "'");
    }

    if(opts.urls()){
      rm(/\bhttps?:\/\/\S+|www\.\S+/gi, 'urls');
    }

    if(opts.hashlines()){
      // Lines that begin with # (not headings if markdown already handled)
      rm(/^[ \t]*#[^\n]*\n?/gm, 'hash-lines');
    }

    if(opts.emojis()){
      // emojis and pictographs
      rm(/[\u{1F300}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}]/gu, 'emoji');
    }

    // Custom rules
    const useRegex = opts.useRegex();
    getRules().forEach(r => {
      try {
        const re = useRegex ? new RegExp(r.pat, 'g') : new RegExp(escapeRegExp(r.pat), 'g');
        if(r.type === 'remove') rm(re, 'custom-remove');
        else if(r.type === 'replace') rep(re, r.repl ?? '', 'custom-replace');
        else if(r.type === 'keep') before = (before.match(re)||[]).join('\n');
      } catch(e){ /* ignore invalid regex */ }
    });

    if(opts.trimspaces()){
      // collapse internal runs of whitespace to single spaces but preserve newlines
      before = before.replace(/[ \t\f\v]+/g, ' ');
      before = before.replace(/ *\n */g, '\n');
      before = before.trim();
    }

    if(opts.blanklines()){
      before = before.replace(/\n{3,}/g, '\n\n');
    }

    const after = before;
    const removed = countRemoved(src, after);
    return {after, removed, removalKinds};
  }

  function countRemoved(a, b){
    // Simple diff count
    let i=0, j=0, diff=0;
    while(i<a.length && j<b.length){
      if(a[i]===b[j]){ i++; j++; }
      else { diff++; i++; }
    }
    diff += (a.length - i);
    return diff;
  }

  function escapeHtml(s){ return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // Actions
  function doClean(){
    const src = input.value;
    const {after, removed, removalKinds} = cleanText(src);
    output.value = after;
    const kinds = Object.entries(removalKinds).map(([k,v])=>`${k}: ${v}`).join(' · ');
    metrics.textContent = `Removed characters: ${removed}${kinds?` | ${kinds}`:''} | Input: ${src.length} | Output: ${after.length}`;
  }

  $('#clean').addEventListener('click', doClean);
  document.addEventListener('keydown', e => {
    if((e.metaKey || e.ctrlKey) && e.key === 'Enter'){ doClean(); }
  });

  // Quick buttons
  $('#btn-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      doClean();
    } catch(e) {
      alert('Clipboard read blocked. Paste into the top box manually.');
    }
  });
  $('#btn-copy').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(output.value);
    } catch(e) {
      // Fallback
      output.select(); document.execCommand('copy');
    }
  });
  $('#btn-clear').addEventListener('click', () => {
    input.value=''; output.value=''; metrics.textContent='';
  });

  // Footer year
  document.querySelector('.foot small').innerHTML = `© ${new Date().getFullYear()} AcePaste. Client-side only. No data leaves your browser.`;
})();