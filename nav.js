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

/* Load the isolated visitor chat only when a chat server is configured.
   The server can also serve this static site directly for same-origin testing. */
(function () {
  "use strict";
  var base = new URL(".", document.currentScript.src);
  var config = document.createElement("script");
  config.src = new URL("chat-config.js?v=1", base).href;
  config.onload = function () {
    var configured = typeof window.ADVANTAGE_CHAT_API === "string" && /^https:\/\//.test(window.ADVANTAGE_CHAT_API);
    var local = location.hostname === "localhost" || location.hostname === "127.0.0.1";
    if (!configured && !local) return;
    var widget = document.createElement("script");
    widget.src = new URL("chat-widget.js?v=1", base).href;
    document.body.append(widget);
  };
  document.head.append(config);
})();
