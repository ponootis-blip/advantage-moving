/* Home hero slideshow: photo collage for 3s, then the mosaic slides every 8s with a
   Ken Burns zoom. Images load just before they're shown. Pauses when the tab is hidden
   or the visitor presses pause. With "reduce motion", slides still change but don't zoom. */
(function () {
  "use strict";
  var hero = document.querySelector(".hero");
  if (!hero) return;
  var slides = Array.prototype.slice.call(hero.querySelectorAll(".hero-slide"));
  var base = slides.shift();
  if (!slides.length) return;
  var FIRST = 3000, EVERY = 8000;
  var index = -1, timer = null, paused = false, current = base;

  function load(slide) {
    slide.querySelectorAll("source[data-srcset]").forEach(function (s) { s.srcset = s.dataset.srcset; s.removeAttribute("data-srcset"); });
    slide.querySelectorAll("img[data-src]").forEach(function (i) { i.src = i.dataset.src; i.removeAttribute("data-src"); });
  }

  function show(next) {
    var prev = current;
    slides.forEach(function (s) { s.classList.remove("is-prev"); });
    if (prev !== base) prev.classList.add("is-prev");
    next.classList.remove("is-active");
    void next.offsetWidth; // restart the zoom
    next.classList.add("is-active");
    if (prev !== base) setTimeout(function () { if (prev !== current) prev.classList.remove("is-active", "is-prev"); }, 1400);
    current = next;
  }

  function advance() {
    index = (index + 1) % slides.length;
    var next = slides[index];
    load(next);
    var img = next.querySelector("img");
    var go = function () { show(next); load(slides[(index + 1) % slides.length]); schedule(EVERY); };
    if (img && !img.complete) { img.addEventListener("load", go, { once: true }); img.addEventListener("error", go, { once: true }); }
    else go();
  }

  function schedule(ms) { clearTimeout(timer); if (!paused && !document.hidden) timer = setTimeout(advance, ms); }

  // pause / play control (WCAG 2.2.2)
  var btn = document.createElement("button");
  btn.type = "button";
  btn.className = "hero-pause";
  btn.setAttribute("aria-label", "Pause slideshow");
  btn.addEventListener("click", function () {
    paused = !paused;
    hero.classList.toggle("is-paused", paused);
    btn.setAttribute("aria-label", paused ? "Play slideshow" : "Pause slideshow");
    if (paused) clearTimeout(timer); else schedule(1500);
  });
  hero.appendChild(btn);

  document.addEventListener("visibilitychange", function () { if (document.hidden) clearTimeout(timer); else schedule(EVERY / 2); });

  load(slides[0]);
  schedule(FIRST);
})();
