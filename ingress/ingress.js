// acepaste.xyz/ingress: copy buttons, and the live refusal log (hostile refusals, last 48 hours).
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

  function status(state, text) {
    document.getElementById("ll-status").className = "ll-status" + (state ? " " + state : "");
    document.getElementById("ll-status-text").textContent = text;
  }
  function clear() { while (list.firstChild) list.removeChild(list.firstChild); }
  function str(v, max) { return typeof v === "string" ? v.slice(0, max) : ""; }

  function render(data) {
    clear();
    var items = data && Array.isArray(data.items) ? data.items : [];
    status("live", items.length + " hostile refusal" + (items.length === 1 ? "" : "s") + " in the last 48 hours");
    if (data && data.updatedAt) {
      var u = new Date(data.updatedAt);
      if (!isNaN(u)) document.getElementById("ll-updated").textContent = "updated " + u.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
    }
    if (!items.length) {
      list.appendChild(el("li", "ll-empty", "Nothing hostile in the last 48 hours."));
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
        status("down", "The log is unreachable right now.");
        list.appendChild(el("li", "ll-empty", "Try again in a few minutes."));
      });
  }
  load();
  setInterval(load, 5 * 60 * 1000);
})();
