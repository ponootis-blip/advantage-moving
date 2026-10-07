/* Advantage Moving — planning tools (checklist, box calculator, cost calculator).
   The tool content is plain HTML on each page so search engines can read it;
   this script only adds dates, ticks, totals and printing. */
(function () {
  "use strict";
  var store = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var fmt = function (d) { return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); };

  /* ---------- Moving checklist ---------- */
  var list = document.getElementById("checklist");
  if (list) {
    var KEY = "advantage-checklist", saved = store.get(KEY) || { done: {}, date: "" };
    var dateInput = document.getElementById("moveDate");
    var boxes = list.querySelectorAll("input[type=checkbox]");
    var count = document.getElementById("checkCount");
    function paint() {
      var done = 0;
      boxes.forEach(function (b) { b.checked = !!saved.done[b.id]; b.closest("li").classList.toggle("is-done", b.checked); if (b.checked) done++; });
      if (count) count.textContent = done + " of " + boxes.length + " done";
      var when = saved.date ? new Date(saved.date + "T12:00:00") : null;
      list.querySelectorAll("[data-days]").forEach(function (group) {
        var out = group.querySelector(".phase-date");
        if (!out) return;
        if (!when) { out.textContent = ""; return; }
        var d = new Date(when); d.setDate(d.getDate() + Number(group.dataset.days));
        out.textContent = "Target: " + fmt(d);
      });
    }
    if (dateInput) {
      dateInput.value = saved.date || "";
      dateInput.addEventListener("change", function () { saved.date = dateInput.value; store.set(KEY, saved); paint(); });
    }
    list.addEventListener("change", function (e) {
      if (e.target.type !== "checkbox") return;
      saved.done[e.target.id] = e.target.checked; store.set(KEY, saved); paint();
    });
    var reset = document.getElementById("checkReset");
    if (reset) reset.addEventListener("click", function () { if (confirm("Clear all ticks and the move date?")) { saved = { done: {}, date: "" }; store.set(KEY, saved); if (dateInput) dateInput.value = ""; paint(); } });
    var print = document.getElementById("checkPrint");
    if (print) print.addEventListener("click", function () { window.print(); });
    paint();
  }

  /* ---------- Box & supplies calculator ---------- */
  var boxForm = document.getElementById("boxCalc");
  if (boxForm) {
    var table = JSON.parse(document.getElementById("boxData").textContent);
    var out = document.getElementById("boxResult");
    function calc() {
      var size = boxForm.size.value, factor = Number(boxForm.amount.value), row = table.sizes[size];
      var extra = boxForm.office.checked ? table.office : null;
      var items = table.items.map(function (item, i) {
        var n = Math.ceil(row[i] * factor + (extra ? extra[i] : 0));
        return "<tr><th>" + item + "</th><td>" + n + "</td></tr>";
      });
      out.innerHTML = '<table class="calc-table"><tbody>' + items.join("") + "</tbody></table>" +
        '<p class="calc-note">A starting point—buy a few extra small boxes; they go first. Prefer not to pack? <a href="packing-services-austin.html">Our crew can do it</a>.</p>';
      out.hidden = false;
    }
    boxForm.addEventListener("submit", function (e) { e.preventDefault(); calc(); });
    boxForm.addEventListener("change", calc);
  }

  /* ---------- Cost calculator (same planning logic as the home page) ---------- */
  var costForm = document.getElementById("costCalc");
  if (costForm && window.estimateMove) {
    var costOut = document.getElementById("costResult"), milesWrap = document.getElementById("costMilesWrap");
    function cost() {
      var state = costForm.distance.value === "state";
      milesWrap.hidden = !state;
      var miles = Number(costForm.miles.value);
      if (state && !(miles >= 20 && miles <= 900)) { costOut.innerHTML = '<p class="form-error">Enter a distance between 20 and 900 miles.</p>'; costOut.hidden = false; return; }
      var e = window.estimateMove({ size: costForm.size.value, distance: costForm.distance.value, miles: miles, packing: costForm.packing.checked, piano: costForm.piano.checked });
      costOut.innerHTML = "<strong>$" + e.low.toLocaleString() + "–$" + e.high.toLocaleString() + "</strong><span>Planning range for a crew of " + e.crew + " and about " + e.hours + " hours. Not a binding quote—your written proposal is based on the details of your move.</span>" +
        '<a class="button button-wide" href="index.html#quote">Get my written estimate →</a>';
      costOut.hidden = false;
    }
    costForm.addEventListener("submit", function (ev) { ev.preventDefault(); cost(); });
    costForm.addEventListener("change", cost);
  }
})();
