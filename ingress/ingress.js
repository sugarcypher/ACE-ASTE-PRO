// acepaste.xyz/ingress: copy buttons, and the live refusal log (what the gate checked lately, and the hostile
// refusals on public websites). The window of the list is whatever the log service says it is.
// The page enforces Trusted Types with no policy, so this only uses textContent and createElement.
(function () {
  "use strict";
  var LOG = "https://acepaste-ingress-log.13531nxt.workers.dev/refusals";

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  if (navigator.clipboard) {
    document.querySelectorAll("[data-copy]").forEach(function (block) {
      var text = block.textContent;
      var b = el("button", "copy", "Copy");
      b.type = "button";
      b.setAttribute("aria-label", "Copy to clipboard");
      b.addEventListener("click", function () {
        navigator.clipboard.writeText(text).then(function () {
          b.textContent = "Copied";
          setTimeout(function () { b.textContent = "Copy"; }, 1600);
        }, function () { b.textContent = "Press Cmd/Ctrl-C"; });
      });
      block.appendChild(b);
    });
  }

  var list = document.getElementById("ll-list");
  if (!list) return;
  var sum = document.getElementById("ll-sum");

  function status(state, text) {
    document.getElementById("ll-status").className = "ll-status" + (state ? " " + state : "");
    document.getElementById("ll-status-text").textContent = text;
  }
  function empty(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function clear() { empty(list); }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }
  function num(v) { return typeof v === "number" && isFinite(v) && v >= 0 ? Math.floor(v) : null; }
  function fmt(n) { return n.toLocaleString(); }

  // "48 hours", "30 days": the window the service says the list covers
  function windowLabel(data) {
    var h = data && num(data.windowHours);
    if (!h) h = 48;
    return h >= 72 && h % 24 === 0 ? (h / 24) + " days" : h + " hours";
  }

  function stat(n, label) {
    var d = el("div", "ll-stat");
    d.appendChild(el("b", null, fmt(n)));
    d.appendChild(el("span", null, label));
    return d;
  }

  // the counts: how much the gate checked and what became of it. Absent or malformed, nothing is shown.
  function renderSummary(s) {
    if (!sum) return;
    empty(sum);
    sum.hidden = true;
    if (!s || typeof s !== "object") return;
    var days = num(s.days), checked = num(s.checked), passed = num(s.passed), held = num(s.held), refused = num(s.refused), labelled = num(s.labelled);
    if (!days || checked === null || passed === null || held === null || refused === null) return;

    sum.appendChild(el("p", "ll-sumhead", "Everything the gate checked in the last " + days + " days"));
    var stats = el("div", "ll-stats");
    stats.appendChild(stat(checked, "checked"));
    stats.appendChild(stat(passed, "passed as clean"));
    stats.appendChild(stat(held, "held for a person"));
    stats.appendChild(stat(refused, "refused"));
    sum.appendChild(stats);

    var rows = Array.isArray(s.sources) ? s.sources.slice(0, 8) : [];
    if (rows.length) {
      var ul = el("ul", "ll-src");
      rows.forEach(function (r) {
        if (!r || typeof r !== "object") return;
        var c = num(r.checked), h = num(r.held), f = num(r.refused), lab = num(r.labelled);
        if (!c) return;
        var parts = [fmt(c) + " checked"];
        if (h) parts.push(fmt(h) + " held");
        if (f) parts.push(fmt(f) + " refused");
        if (lab) parts.push(fmt(lab) + " labelled");
        var li = el("li");
        li.appendChild(el("span", "ll-srcname", str(r.source, 30)));
        li.appendChild(el("span", "ll-srcnum", parts.join(" · ")));
        ul.appendChild(li);
      });
      sum.appendChild(ul);
    }

    var cap = "Held means rated suspect and kept back until a person asks for it. Refused means rated hostile.";
    if (labelled) cap += " Another " + fmt(labelled) + " were labelled with a warning and delivered: files written on the machine itself are never kept back.";
    cap += " These counts include false alarms and our own tests.";
    sum.appendChild(el("p", "ll-cap", cap));
    sum.hidden = false;
  }

  function render(data) {
    clear();
    var items = data && Array.isArray(data.items) ? data.items : [];
    var span = windowLabel(data);
    renderSummary(data && data.summary);
    status("live", items.length + " hostile refusal" + (items.length === 1 ? "" : "s") + " on public websites in the last " + span);
    if (data && data.updatedAt) {
      var u = new Date(data.updatedAt);
      if (!isNaN(u)) document.getElementById("ll-updated").textContent = "updated " + u.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    }
    if (!items.length) {
      list.appendChild(el("li", "ll-empty", "No public website was rated hostile in the last " + span + "."));
      return;
    }
    items.slice(0, 50).forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var li = el("li", "ll-item");
      var top = el("div", "ll-top");
      top.appendChild(el("span", "ll-badge", "hostile"));
      top.appendChild(el("span", it.own ? "ll-host" : "ll-host third", str(it.host, 80) || "a third-party site"));
      if (typeof it.score === "number") top.appendChild(el("span", "ll-date", "score " + it.score.toFixed(2)));
      top.appendChild(el("span", "ll-date", str(it.date, 10)));
      li.appendChild(top);
      var kinds = Array.isArray(it.kinds) ? it.kinds.filter(function (k) { return typeof k === "string"; }).slice(0, 12) : [];
      if (kinds.length) {
        var kd = el("div", "ll-kinds");
        kinds.forEach(function (k) { kd.appendChild(el("span", null, k.slice(0, 70))); });
        li.appendChild(kd);
      }
      if (it.own && it.note) li.appendChild(el("p", "ll-note", str(it.note, 160)));
      list.appendChild(li);
    });
  }

  function load() {
    var ctl = "AbortController" in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    fetch(LOG, { credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store", signal: ctl ? ctl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) { clearTimeout(timer); render(j); })
      .catch(function () {
        clearTimeout(timer);
        clear();
        renderSummary(null);
        status("down", "The log is unreachable right now.");
        list.appendChild(el("li", "ll-empty", "Try again in a few minutes."));
      });
  }
  load();
  setInterval(load, 5 * 60 * 1000);
})();
