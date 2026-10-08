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

/* ---------- Mover tip calculator, home inventory, box labels, simple checklists ---------- */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };
  var num = function (id, d) { var v = parseFloat(($(id) || {}).value); return isFinite(v) ? v : d; };
  var money = function (n) { return "$" + Math.round(n).toLocaleString(); };
  var esc = function (t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* Tip calculator: averages three common methods (flat per mover, per mover-hour, % of bill). */
  var tip = $("tipCalc");
  if (tip) {
    var runTip = function () {
      var movers = Math.max(1, num("t-movers", 3)), hours = Math.max(0, num("t-hours", 6)), days = Math.max(1, num("t-days", 1)), cost = Math.max(0, num("t-cost", 0));
      var svc = { below: 0.75, solid: 1, great: 1.25 }[$("t-service").value] || 1;
      var extras = ($("t-stairs").checked ? 10 : 0) + ($("t-heavy").checked ? 15 : 0) + ($("t-weather").checked ? 10 : 0);
      var flat = (hours <= 4 ? 25 : hours <= 8 ? 50 : 75) * days * svc + extras;
      var hourly = 6 * hours * svc + extras;
      var pct = cost ? cost * 0.07 / movers * svc : NaN;
      var vals = [flat, hourly].concat(isFinite(pct) ? [pct] : []);
      var per = Math.round(vals.reduce(function (a, b) { return a + b; }, 0) / vals.length / 5) * 5;
      if ($("t-lunch").checked) per = Math.max(0, per - 5);
      $("tipResult").innerHTML = "<strong>" + money(per) + " per mover</strong><span>About " + money(per * movers) + " total for " + movers + " movers—an average of the methods below, rounded to $5. Tipping is always optional.</span>" +
        '<table class="calc-table"><tbody>' +
        "<tr><th>Flat per mover</th><td>" + money(flat) + "</td></tr>" +
        "<tr><th>Per mover-hour ($6/hr)</th><td>" + money(hourly) + "</td></tr>" +
        "<tr><th>7% of the bill</th><td>" + (isFinite(pct) ? money(pct) : "Add the move cost") + "</td></tr></tbody></table>";
    };
    tip.addEventListener("input", runTip); tip.addEventListener("change", runTip);
    tip.addEventListener("submit", function (e) { e.preventDefault(); runTip(); });
    runTip();
  }

  /* Home inventory: room-by-room list with cubic feet, weight (7 lb/cu ft) and declared value; CSV export. */
  var inv = $("invTool");
  if (inv) {
    var ITEMS = JSON.parse($("invData").textContent), KEY = "advantage-inventory";
    var rows = store.get(KEY, []);
    var roomSel = $("inv-room"), itemSel = $("inv-item");
    roomSel.innerHTML = Object.keys(ITEMS).map(function (r) { return "<option>" + esc(r) + "</option>"; }).join("");
    var fillItems = function () { itemSel.innerHTML = ITEMS[roomSel.value].map(function (it, i) { return '<option value="' + i + '">' + esc(it[0]) + " (" + it[1] + " cu ft)</option>"; }).join("") + '<option value="custom">Custom item…</option>'; $("inv-custom").hidden = itemSel.value !== "custom"; };
    roomSel.addEventListener("change", fillItems); itemSel.addEventListener("change", function () { $("inv-custom").hidden = itemSel.value !== "custom"; });
    fillItems();
    var paint = function () {
      var cuft = 0, value = 0, count = 0;
      $("invRows").innerHTML = rows.length ? rows.map(function (r, i) {
        cuft += r.cuft * r.qty; value += (r.value || 0) * r.qty; count += r.qty;
        return "<tr><td>" + esc(r.room) + "</td><td>" + esc(r.name) + (r.fragile ? ' <span class="tag-fragile">fragile</span>' : "") + "</td><td>" + r.qty + "</td><td>" + (r.cuft * r.qty).toFixed(1) + "</td><td>" + (r.value ? money(r.value * r.qty) : "—") + '</td><td><button type="button" class="link-inline" data-inv-del="' + i + '">Remove</button></td></tr>';
      }).join("") : '<tr><td colspan="6" class="muted">No items yet. Add your first item above.</td></tr>';
      $("invTotals").innerHTML = "<div><b>" + count + "</b><span>items</span></div><div><b>" + Math.round(cuft).toLocaleString() + "</b><span>cubic feet</span></div><div><b>" + Math.round(cuft * 7).toLocaleString() + " lb</b><span>estimated weight</span></div><div><b>" + money(value) + "</b><span>declared value</span></div>";
      store.set(KEY, rows);
    };
    $("invAdd").addEventListener("click", function () {
      var qty = Math.max(1, Math.round(num("inv-qty", 1))), value = Math.max(0, num("inv-value", 0)), name, cuft;
      if (itemSel.value === "custom") {
        name = $("inv-name").value.trim() || "Custom item";
        cuft = Math.max(0.1, num("inv-l", 0) * num("inv-w", 0) * num("inv-h", 0) / 1728);
      } else { var it = ITEMS[roomSel.value][+itemSel.value]; name = it[0]; cuft = it[1]; }
      rows.push({ room: roomSel.value, name: name, qty: qty, cuft: +cuft.toFixed(2), value: value, fragile: $("inv-fragile").checked });
      $("inv-qty").value = 1; $("inv-value").value = ""; $("inv-fragile").checked = false;
      ["inv-name", "inv-l", "inv-w", "inv-h"].forEach(function (id) { $(id).value = ""; });
      paint();
    });
    inv.addEventListener("click", function (e) {
      var d = e.target.closest("[data-inv-del]"); if (d) { rows.splice(+d.dataset.invDel, 1); paint(); }
    });
    $("invCsv").addEventListener("click", function () {
      var lines = [["Room", "Item", "Qty", "Cu ft (each)", "Cu ft (total)", "Value (each)", "Fragile"]].concat(rows.map(function (r) { return [r.room, r.name, r.qty, r.cuft, (r.cuft * r.qty).toFixed(1), r.value || "", r.fragile ? "yes" : ""]; }));
      download("moving-inventory.csv", lines.map(function (l) { return l.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
    });
    $("invPrint").addEventListener("click", function () { window.print(); });
    $("invClear").addEventListener("click", function () { if (confirm("Clear your whole inventory?")) { rows = []; paint(); } });
    paint();
  }

  /* Box label maker: numbered, color-coded labels with flags; prints only the labels. */
  var lab = $("labelTool");
  if (lab) {
    var LKEY = "advantage-labels";
    var saved = store.get(LKEY, null);
    if (saved) Object.keys(saved).forEach(function (k) { var el = lab.elements[k]; if (!el) return; if (el.length && el[0] && el[0].type === "checkbox") { Array.prototype.forEach.call(el, function (c) { c.checked = saved[k].indexOf(c.value) !== -1; }); } else if (el.type === "checkbox") { el.checked = !!saved[k]; } else { el.value = saved[k]; } });
    var renderLabels = function () {
      var room = lab.room.value === "custom" ? (lab.customRoom.value.trim() || "Room") : lab.room.value;
      var color = lab.room.selectedOptions[0] ? lab.room.selectedOptions[0].dataset.color || lab.color.value : lab.color.value;
      if (lab.room.value === "custom") color = lab.color.value;
      $("customRoomWrap").hidden = lab.room.value !== "custom";
      var from = Math.max(1, Math.round(num("lab-from", 1))), to = Math.max(from, Math.min(from + 199, Math.round(num("lab-to", 6))));
      var flags = Array.prototype.filter.call(lab.querySelectorAll('input[name="flags"]'), function (c) { return c.checked; }).map(function (c) { return c.value; });
      var html = "";
      for (var n = from; n <= to; n++) {
        html += '<div class="box-label"><span class="bl-room" style="background:' + esc(color) + '">' + esc(room) + '</span><span class="bl-num">Box ' + n + " of " + to + "</span>" +
          (flags.length ? '<span class="bl-flags">' + flags.map(function (f) { return "<span>" + esc(f) + "</span>"; }).join("") + "</span>" : "") +
          (lab.contents.value.trim() ? '<span class="bl-line"><b>Contents:</b> ' + esc(lab.contents.value.trim()) + "</span>" : "") +
          (lab.dest.value.trim() ? '<span class="bl-line"><b>Goes to:</b> ' + esc(lab.dest.value.trim()) + "</span>" : "") +
          (lab.owner.value.trim() ? '<span class="bl-line bl-owner">' + esc(lab.owner.value.trim()) + "</span>" : "") +
          (lab.brand.checked ? '<span class="bl-brand">Moved by Advantage Moving · (512) 443-6141</span>' : "") + "</div>";
      }
      $("labelSheet").innerHTML = html;
      $("labelSheet").style.gridTemplateColumns = "repeat(" + lab.cols.value + ",1fr)";
      $("labelCount").textContent = (to - from + 1) + " labels ready";
      var data = {}; ["room", "customRoom", "color", "from", "to", "contents", "dest", "owner", "cols"].forEach(function (k) { data[k] = lab[k].value; });
      data.flags = flags; data.brand = lab.brand.checked; store.set(LKEY, data);
    };
    lab.addEventListener("input", renderLabels); lab.addEventListener("change", renderLabels);
    lab.addEventListener("submit", function (e) { e.preventDefault(); renderLabels(); window.print(); });
    renderLabels();
  }

  /* Simple saved checklists (first-night box, pets & plants). */
  document.querySelectorAll(".simple-checklist[data-key]").forEach(function (list) {
    var key = "advantage-check-" + list.dataset.key, done = store.get(key, {});
    var boxes = list.querySelectorAll('input[type="checkbox"]');
    var count = list.parentElement.querySelector(".simple-count");
    var paintList = function () {
      var n = 0;
      boxes.forEach(function (b, i) { b.checked = !!done[i]; b.closest("li").classList.toggle("is-done", b.checked); if (b.checked) n++; });
      if (count) count.textContent = n + " of " + boxes.length + " done";
    };
    list.addEventListener("change", function (e) {
      var i = Array.prototype.indexOf.call(boxes, e.target); if (i === -1) return;
      done[i] = e.target.checked; store.set(key, done); paintList();
    });
    var root = list.closest(".tool-card");
    var print = root && root.querySelector("[data-print]"); if (print) print.addEventListener("click", function () { window.print(); });
    var reset = root && root.querySelector("[data-reset]"); if (reset) reset.addEventListener("click", function () { if (confirm("Clear all ticks?")) { done = {}; store.set(key, done); paintList(); } });
    paintList();
  });
})();
