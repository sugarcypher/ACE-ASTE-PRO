// acepaste.xyz/ingress: copy buttons for the install snippets.
// The page enforces Trusted Types with no policy, so this only uses textContent and createElement.
(function () {
  "use strict";
  if (!navigator.clipboard) return;
  document.querySelectorAll("[data-copy]").forEach(function (block) {
    var text = block.textContent;
    var b = document.createElement("button");
    b.type = "button";
    b.className = "copy";
    b.textContent = "Copy";
    b.setAttribute("aria-label", "Copy to clipboard");
    b.addEventListener("click", function () {
      navigator.clipboard.writeText(text).then(function () {
        b.textContent = "Copied";
        setTimeout(function () { b.textContent = "Copy"; }, 1600);
      }, function () { b.textContent = "Press Cmd/Ctrl-C"; });
    });
    block.appendChild(b);
  });
})();
