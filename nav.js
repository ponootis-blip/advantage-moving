/* Theme preview: ?theme=tile switches to the "all tile" look for this browser session,
   ?theme=default switches back. The default design is unaffected for everyone else. */
(function () {
  try {
    var p = new URLSearchParams(location.search).get("theme");
    if (p === "tile") sessionStorage.setItem("adv-theme", "tile");
    if (p === "default") sessionStorage.removeItem("adv-theme");
    if (sessionStorage.getItem("adv-theme") !== "tile") return;
  } catch (e) { return; }
  var root = document.documentElement;
  root.classList.add("theme-tile");
  var link = document.createElement("link");
  link.rel = "stylesheet"; link.href = "tile-theme.css?v=3";
  document.head.appendChild(link);
  var badge = document.createElement("div");
  badge.className = "tile-preview-badge";
  badge.innerHTML = "Tile theme preview <button type=\"button\">Exit</button>";
  badge.querySelector("button").addEventListener("click", function () {
    try { sessionStorage.removeItem("adv-theme"); } catch (e) {}
    root.classList.remove("theme-tile"); link.remove(); badge.remove();
  });
  document.body.appendChild(badge);
})();

/* Header dropdowns (Services, Service areas).
   Links are plain HTML in every page, so search engines see them without this script;
   it only opens and closes the panels on hover, click, touch and keyboard. */
(function () {
  "use strict";
  var head = document.querySelector(".sitehead");
  if (!head) return;
  var toggles = head.querySelectorAll(".nav-toggle");
  var desktop = window.matchMedia("(min-width: 961px) and (hover: hover)");
  var closeTimer;

  function panelFor(btn) { return document.getElementById(btn.getAttribute("aria-controls")); }
  function close(btn) { if (!btn) return; btn.setAttribute("aria-expanded", "false"); var p = panelFor(btn); if (p) p.hidden = true; btn.closest(".nav-drop").classList.remove("is-open"); }
  function closeAll(except) { toggles.forEach(function (b) { if (b !== except) close(b); }); }
  function open(btn) {
    closeAll(btn);
    btn.setAttribute("aria-expanded", "true");
    var p = panelFor(btn); if (p) p.hidden = false;
    btn.closest(".nav-drop").classList.add("is-open");
  }

  toggles.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      btn.getAttribute("aria-expanded") === "true" ? close(btn) : open(btn);
    });
    var drop = btn.closest(".nav-drop"), panel = panelFor(btn);
    [drop, panel].forEach(function (el) {
      if (!el) return;
      el.addEventListener("mouseenter", function () { if (!desktop.matches) return; clearTimeout(closeTimer); open(btn); });
      el.addEventListener("mouseleave", function () { if (!desktop.matches) return; closeTimer = setTimeout(function () { close(btn); }, 180); });
    });
  });

  document.addEventListener("click", function (e) { if (!e.target.closest(".mega") && !e.target.closest(".nav-drop")) closeAll(); });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openBtn = head.querySelector('.nav-toggle[aria-expanded="true"]');
    if (openBtn) { close(openBtn); openBtn.focus(); }
  });
})();
