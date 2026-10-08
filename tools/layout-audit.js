/* Layout audit — paste into the console or run via a browser tool on any page.
   Reports overflow, line length, small text, small tap targets, fold and spacing. */
(function () {
  var vw = innerWidth, vh = innerHeight, out = { vw: vw, vh: vh };
  out.overflowX = document.documentElement.scrollWidth > vw + 1;
  var vis = function (el) { var r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[hidden],.mega,.sr-only,.hp-field"); };
  // line length (characters per line) for real paragraphs
  var cpl = [];
  document.querySelectorAll("main p, main li").forEach(function (p) {
    if (!vis(p) || p.textContent.trim().length < 140 || p.closest("nav,.link-band,.checklist")) return;
    var cs = getComputedStyle(p), fs = parseFloat(cs.fontSize), w = p.getBoundingClientRect().width;
    cpl.push({ cpl: Math.round(w / (fs * 0.5)), fs: fs, cls: (p.className || p.parentElement.className || p.tagName).toString().slice(0, 30) });
  });
  out.cplLong = cpl.filter(function (c) { return c.cpl > 88; }).map(function (c) { return c.cls + ":" + c.cpl; }).slice(0, 8);
  out.cplShort = cpl.filter(function (c) { return c.cpl < 32; }).map(function (c) { return c.cls + ":" + c.cpl; }).slice(0, 8);
  // small text
  var small = {};
  document.querySelectorAll("main p, main li, main a, main span, main label, main small, main figcaption, footer a, footer span").forEach(function (el) {
    if (!vis(el) || !el.childNodes.length || !el.textContent.trim()) return;
    var fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 13) { var k = (el.className || el.tagName).toString().slice(0, 28) + "@" + fs; small[k] = (small[k] || 0) + 1; }
  });
  out.smallText = small;
  // tap targets (not inline links in running text)
  var taps = {};
  document.querySelectorAll("a, button, input, select, textarea").forEach(function (el) {
    if (!vis(el) || el.closest("p, li:not(.area-grid li):not(.tool-grid li)") && el.tagName === "A") return;
    var r = el.getBoundingClientRect();
    if (vw < 1024 && (r.height < 40 || r.width < 40)) { var k = (el.className || el.tagName).toString().slice(0, 26) + " " + Math.round(r.width) + "x" + Math.round(r.height); taps[k] = (taps[k] || 0) + 1; }
  });
  out.smallTaps = taps;
  // fold
  var h1 = document.querySelector("h1"), q = document.querySelector("#quoteNext") || document.querySelector(".hero-contact .button");
  if (h1) out.h1Bottom = Math.round(h1.getBoundingClientRect().bottom + scrollY);
  if (q) out.ctaBottom = Math.round(q.getBoundingClientRect().bottom + scrollY);
  out.ctaAboveFold = q ? q.getBoundingClientRect().bottom + scrollY <= vh : null;
  out.h1AboveFold = h1 ? h1.getBoundingClientRect().top + scrollY + 60 <= vh : null;
  // type scale + spacing
  out.h1px = h1 ? parseFloat(getComputedStyle(h1).fontSize) : null;
  var h2 = document.querySelector("main h2"); out.h2px = h2 ? parseFloat(getComputedStyle(h2).fontSize) : null;
  out.bodyPx = parseFloat(getComputedStyle(document.querySelector("main p") || document.body).fontSize);
  out.sectionPad = Array.prototype.map.call(document.querySelectorAll("main > section"), function (s) { return Math.round(parseFloat(getComputedStyle(s).paddingTop)); }).filter(function (x, i, a) { return a.indexOf(x) === i; });
  out.pageScreens = +(document.documentElement.scrollHeight / vh).toFixed(1);
  return out;
})();
