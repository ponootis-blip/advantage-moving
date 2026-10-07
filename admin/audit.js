/* Page audit: what a search engine or AI assistant can actually read.
   Runs on built HTML strings, so it checks exactly what will be published. */
(function (root) {
  "use strict";

  function visibleText(doc) {
    var clone = doc.body ? doc.body.cloneNode(true) : null;
    if (!clone) return "";
    clone.querySelectorAll("script,style,noscript,template").forEach(function (n) { n.remove(); });
    return clone.textContent.replace(/\s+/g, " ").trim();
  }

  function auditPage(data, file, html, allFiles) {
    var page = (data.pages || []).filter(function (p) { return p.file === file; })[0] || {};
    var doc = new DOMParser().parseFromString(html, "text/html");
    var issues = [];
    var add = function (level, msg) { issues.push({ level: level, msg: msg }); };
    var b = data.business, phone = root.AdvBuilder.phoneForms(b.phone);
    var text = visibleText(doc);

    var title = (doc.querySelector("title") || {}).textContent || "";
    if (!title) add("error", "Missing page title.");
    else if (title.length > 65) add("warn", "Title is " + title.length + " characters; Google usually shows about 60.");
    else if (title.length < 25) add("warn", "Title is short (" + title.length + " characters); add the service and area.");

    var desc = (doc.querySelector('meta[name="description"]') || {}).content || "";
    if (!desc) add("error", "Missing meta description.");
    else if (desc.length > 160) add("warn", "Description is " + desc.length + " characters; aim for 70–160.");
    else if (desc.length < 70) add("warn", "Description is short (" + desc.length + " characters).");

    var h1s = doc.querySelectorAll("h1");
    if (h1s.length !== 1) add("error", "Page has " + h1s.length + " H1 headings; use exactly one.");

    var canon = (doc.querySelector('link[rel="canonical"]') || {}).href || "";
    var expected = data.site.baseUrl + (page.path || "");
    if (!canon) add("error", "Missing canonical URL.");
    else if (canon !== expected) add("warn", "Canonical is " + canon + " but data says " + expected + ".");

    if (!doc.querySelector('meta[property="og:image"]')) add("warn", "No social share image (og:image).");

    var robots = (doc.querySelector('meta[name="robots"]') || {}).content || "";
    if (/noindex/.test(robots) && page.index !== false) add("error", "Page is marked noindex.");

    var lds = doc.querySelectorAll('script[type="application/ld+json"]');
    var phonesInLd = [];
    lds.forEach(function (s) {
      try {
        var json = JSON.parse(s.textContent);
        (JSON.stringify(json).match(/"telephone":"([^"]+)"/g) || []).forEach(function (m) { phonesInLd.push(m.split(":")[1].replace(/"/g, "")); });
      } catch (e) { add("error", "Structured data block is not valid JSON."); }
    });
    if (!lds.length && page.index !== false) add("warn", "No structured data (JSON-LD) on this page.");
    if (phone && phonesInLd.some(function (p) { return p !== phone.schema; })) add("error", "Structured data lists a phone number that doesn't match the business phone.");

    if (page.index !== false) {
      if (phone && text.indexOf(phone.display) === -1) add("warn", "Business phone " + phone.display + " isn't visible on the page.");
      if (b.txdmv && text.indexOf(b.txdmv) === -1) add("info", "TXDMV number isn't visible on this page.");
      var words = text.split(" ").length;
      if (words < 350 && !/privacy/.test(file)) add("warn", "Only about " + words + " words of visible text; thin pages are rarely cited.");
      if (b.hours && (b.hours.opens !== "08:00" || b.hours.closes !== "17:00") && /8am–5pm|8–5/.test(text)) {
        add("error", "Visible text says 8am–5pm but business hours are " + b.hours.opens + "–" + b.hours.closes + ". Update the page copy.");
      }
    }

    doc.querySelectorAll("img").forEach(function (img) {
      if (!img.hasAttribute("alt")) add("error", "Image without alt text: " + img.getAttribute("src"));
    });

    doc.querySelectorAll("a[href]").forEach(function (a) {
      var href = a.getAttribute("href");
      if (/^(https?:|mailto:|tel:|sms:|#)/.test(href)) return;
      var target = href.split("#")[0].split("?")[0];
      if (target && /\.html$/.test(target) && !(target in allFiles)) add("error", "Broken internal link to " + target + ".");
    });

    if (/Replace this starter text|Add a specific detail|Replace with a one- or two-sentence/.test(text + " " + desc)) add("error", "Starter text is still on this page. Edit it under Page copy before publishing.");

    // Decorative strings that read like data (the "Art. 49fk" problem)
    var known = [b.txdmv, b.usdot, b.postalCode, String(b.foundingYear)].filter(Boolean);
    var codeLike = (text.match(/\b[A-Z]{1,4}[.\-#]?\s?\d{2,}[a-z]{0,3}\b/g) || []).filter(function (t) {
      return !known.some(function (k) { return t.indexOf(k) !== -1; }) && !/^(?:I|IH|US|SH|FM|RM|RR|CR|TX|SR|Loop)[-\s]?\d+$/.test(t) && !/^\d/.test(t);
    });
    if (codeLike.length) add("warn", "Code-like text an AI might treat as a fact: " + codeLike.slice(0, 4).join(", ") + ".");

    // Every visible FAQ must match its FAQPage structured data exactly (AI answers quote the schema).
    var visibleQ = Array.prototype.map.call(doc.querySelectorAll(".accordion summary"), function (s) { return s.firstChild.textContent.trim(); });
    var faqLd = [];
    lds.forEach(function (s) { try { var o = JSON.parse(s.textContent); if (o["@type"] === "FAQPage") faqLd.push(o); } catch (e) {} });
    if (visibleQ.length && page.index !== false) {
      if (faqLd.length !== 1) add("warn", "Page shows FAQs but has " + faqLd.length + " FAQ structured data blocks (expected 1).");
      else {
        var ldQ = faqLd[0].mainEntity.map(function (q) { return q.name; });
        if (ldQ.length !== visibleQ.length || ldQ.some(function (q) { return visibleQ.indexOf(q) === -1; })) add("error", "Visible FAQ and FAQ structured data don't match.");
      }
    }

    var penalty = issues.reduce(function (n, i) { return n + (i.level === "error" ? 12 : i.level === "warn" ? 4 : 0); }, 0);
    return { file: file, title: title, score: Math.max(0, 100 - penalty), issues: issues };
  }

  function auditSite(data, files) {
    var results = (data.pages || []).filter(function (p) { return files[p.file] && p.index !== false; }).map(function (p) {
      return auditPage(data, p.file, files[p.file], files);
    });
    var site = [];
    var b = data.business;
    if (!root.AdvBuilder.profileUrls(b).length) site.push({ level: "warn", msg: "No Google Business, Yelp or BBB profile links yet. They help AI assistants confirm who you are." });
    if (!b.googleReviewUrl) site.push({ level: "info", msg: "Add your Google review link so happy customers can leave a review in one tap." });
    if (data.admin && data.admin.mustChange) site.push({ level: "error", msg: "The default admin password is still active." });
    var scored = results.filter(function (r) { var p = data.pages.filter(function (x) { return x.file === r.file; })[0]; return p && p.index !== false; });
    var overall = scored.length ? Math.round(scored.reduce(function (n, r) { return n + r.score; }, 0) / scored.length) : 0;
    return { overall: overall, pages: results, site: site };
  }

  root.AdvAudit = { auditSite: auditSite, auditPage: auditPage };
})(window);
