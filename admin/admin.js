/* Advantage Moving — site admin.
   Storage backends:
     GitHub  — reads/commits files in the site repo via the GitHub API (production).
     Local   — the dev server in tools/admin_server.py (preview on this computer).
     Offline — read-only; changes can be downloaded as data/site.json.
   The sign-in only hides the editor. Real write access comes from the GitHub token,
   which never leaves this browser except to talk to api.github.com. */
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var esc = AdvBuilder.esc;
  var DEFAULT_REPO = { owner: "ponootis-blip", repo: "advantage-moving", branch: "main" };
  var DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var state = { original: null, draft: null, files: {}, store: null, view: "dashboard", pageFile: null, audit: null };

  /* ---------------- utilities ---------------- */
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key)); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } }
  function toast(msg, isError) {
    var t = $("#toast"); t.textContent = msg; t.className = "toast" + (isError ? " error" : ""); t.hidden = false;
    clearTimeout(toast.timer); toast.timer = setTimeout(function () { t.hidden = true; }, isError ? 7000 : 3500);
  }
  async function sha256(text) {
    var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
  }
  function getPath(obj, path) { return path.split(".").reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function setPath(obj, path, val) {
    var keys = path.split("."), last = keys.pop();
    var target = keys.reduce(function (o, k) { return o[k]; }, obj);
    target[last] = val;
  }
  function scoreClass(n) { return n >= 85 ? "good" : n >= 65 ? "ok" : "bad"; }

  /* ---------------- storage backends ---------------- */
  function ghConfig() { return Object.assign({}, DEFAULT_REPO, store("adv-admin-gh") || {}, { token: sessionStorage.getItem("adv-admin-token") || localStorage.getItem("adv-admin-token") || "" }); }

  var GitHubStore = {
    label: "Connected to GitHub",
    api: async function (path, opts) {
      var c = ghConfig();
      var res = await fetch("https://api.github.com/repos/" + c.owner + "/" + c.repo + path, Object.assign({}, opts, {
        headers: Object.assign({ "Authorization": "Bearer " + c.token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, (opts && opts.headers) || {})
      }));
      if (!res.ok) { var body = await res.json().catch(function () { return {}; }); throw new Error("GitHub " + res.status + ": " + (body.message || res.statusText)); }
      return res;
    },
    read: async function (path) {
      var c = ghConfig();
      var res = await this.api("/contents/" + path + "?ref=" + encodeURIComponent(c.branch), { headers: { "Accept": "application/vnd.github.raw" } });
      return res.text();
    },
    head: async function () {
      var c = ghConfig();
      var ref = await (await this.api("/git/ref/heads/" + c.branch)).json();
      return ref.object.sha;
    },
    commit: async function (files, message) {
      var c = ghConfig(), self = this;
      var headSha = await this.head();
      if (state.baseSha && headSha !== state.baseSha) throw new Error("The site changed on GitHub since you opened the admin. Reload the page, then publish again.");
      var commit = await (await this.api("/git/commits/" + headSha)).json();
      var tree = [];
      for (var path in files) {
        var blob = await (await self.api("/git/blobs", { method: "POST", body: JSON.stringify({ content: files[path], encoding: "utf-8" }) })).json();
        tree.push({ path: path, mode: "100644", type: "blob", sha: blob.sha });
      }
      var newTree = await (await this.api("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: commit.tree.sha, tree: tree }) })).json();
      var newCommit = await (await this.api("/git/commits", { method: "POST", body: JSON.stringify({ message: message, tree: newTree.sha, parents: [headSha] }) })).json();
      await this.api("/git/refs/heads/" + c.branch, { method: "PATCH", body: JSON.stringify({ sha: newCommit.sha }) });
      state.baseSha = newCommit.sha;
      return newCommit.html_url;
    }
  };

  var LocalStore = {
    label: "Local preview server",
    read: async function (path) {
      var res = await fetch("../" + path + "?t=" + Date.now(), { cache: "no-store" });
      if (!res.ok) throw new Error("Could not read " + path);
      return res.text();
    },
    commit: async function (files) {
      var res = await fetch("/__admin/save", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ files: files }) });
      var body = await res.json().catch(function () { return {}; });
      if (!res.ok) throw new Error(body.error || "Local save failed");
      return null;
    }
  };

  var OfflineStore = { label: "Read-only (not connected)", read: LocalStore.read, commit: null };

  async function pickStore() {
    if (ghConfig().token) return GitHubStore;
    try { var r = await fetch("/__admin/ping", { cache: "no-store" }); if (r.ok) return LocalStore; } catch (e) {}
    return OfflineStore;
  }

  async function loadAll() {
    state.store = await pickStore();
    if (state.store === GitHubStore) state.baseSha = await GitHubStore.head();
    var data = JSON.parse(await state.store.read("data/site.json"));
    var paths = data.pages.map(function (p) { return p.file; }).concat(["sitemap.xml", "robots.txt"]);
    var files = {};
    await Promise.all(paths.map(async function (p) { try { files[p] = await state.store.read(p); } catch (e) { files[p] = ""; } }));
    state.original = data; state.draft = clone(data); state.files = files;
    $("#storeLabel").textContent = state.store.label;
  }

  function pending() {
    var result = AdvBuilder.build(state.original, state.draft, state.files, today());
    var dataText = JSON.stringify(result.data, null, 2) + "\n";
    var changed = Object.assign({}, result.files);
    if (dataText !== JSON.stringify(state.original, null, 2) + "\n") changed["data/site.json"] = dataText;
    var built = Object.assign({}, state.files, result.files);
    return { changed: changed, built: built, data: result.data };
  }

  function refreshBadge() {
    var n = Object.keys(pending().changed).length, el = $("#changeCount");
    el.textContent = n; el.hidden = n === 0;
  }

  /* ---------------- auth ---------------- */
  async function checkLogin(user, pass) {
    var a = state.original.admin;
    return user === a.user && (await sha256(a.salt + ":" + pass)) === a.hash;
  }

  async function setPassword(pass) {
    var salt = Array.from(crypto.getRandomValues(new Uint8Array(8))).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    state.draft.admin = { user: state.draft.admin.user, salt: salt, hash: await sha256(salt + ":" + pass), mustChange: false };
  }

  /* ---------------- views ---------------- */
  function field(label, path, opts) {
    opts = opts || {};
    var v = getPath(state.draft, path); if (v == null) v = "";
    var input = opts.textarea
      ? '<textarea data-bind="' + path + '"' + (opts.max ? ' data-max="' + opts.max + '"' : "") + ">" + esc(v) + "</textarea>"
      : '<input data-bind="' + path + '" type="' + (opts.type || "text") + '" value="' + esc(v) + '"' + (opts.max ? ' data-max="' + opts.max + '"' : "") + (opts.placeholder ? ' placeholder="' + esc(opts.placeholder) + '"' : "") + ">";
    var count = opts.max ? '<span class="count' + (String(v).length > opts.max ? " bad" : "") + '">' + String(v).length + "/" + opts.max + "</span>" : "";
    return '<label class="field"><span>' + label + count + "</span>" + input + (opts.help ? "<small>" + opts.help + "</small>" : "") + "</label>";
  }

  function issueList(issues) {
    if (!issues.length) return '<p class="muted">No issues found.</p>';
    return '<ul class="issues">' + issues.map(function (i) { return '<li><span class="lvl ' + i.level + '">' + i.level + "</span><span>" + esc(i.msg) + "</span></li>"; }).join("") + "</ul>";
  }

  var views = {};

  views.dashboard = function () {
    var p = pending(), a = AdvAudit.auditSite(p.data, p.built); state.audit = a;
    var errors = a.pages.reduce(function (n, r) { return n + r.issues.filter(function (i) { return i.level === "error"; }).length; }, 0) + a.site.filter(function (i) { return i.level === "error"; }).length;
    var aiLog = store("adv-ai-log") || [];
    var mentioned = aiLog.filter(function (r) { return r.mentioned === "yes"; }).length;
    var b = state.draft.business;
    return '<div class="view-head"><div><h1>Dashboard</h1><p>How the site looks to search engines and AI assistants, based on exactly what will be published.</p></div>' +
      '<div class="actions"><a class="button button-outline btn-sm" href="../index.html" target="_blank" rel="noopener">View site ↗</a><a class="button button-outline btn-sm" href="../launch-checklist.html" target="_blank" rel="noopener">Launch checklist ↗</a></div></div>' +
      (state.store === OfflineStore ? '<div class="notice warn">Read-only mode. To publish, add a GitHub token under <b>Publish</b>.</div>' : "") +
      '<div class="stats">' +
      '<div class="stat"><b><span class="score ' + scoreClass(a.overall) + '">' + a.overall + "</span></b><span>Average page score</span></div>" +
      "<div class=\"stat\"><b>" + errors + "</b><span>Errors to fix</span></div>" +
      "<div class=\"stat\"><b>" + Object.keys(p.changed).length + "</b><span>Files waiting to publish</span></div>" +
      "<div class=\"stat\"><b>" + (aiLog.length ? Math.round(mentioned / aiLog.length * 100) + "%" : "—") + "</b><span>AI answers mentioning you (" + aiLog.length + " logged)</span></div></div>" +
      '<div class="card"><h2>Site-wide</h2>' + issueList(a.site) + "</div>" +
      '<div class="card"><h2>Pages</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Page</th><th>Score</th><th>Top issue</th></tr></thead><tbody>' +
      a.pages.map(function (r) {
        var top = r.issues.filter(function (i) { return i.level !== "info"; })[0];
        return '<tr class="clickable" data-open-page="' + r.file + '"><td><b>' + esc(r.title || r.file) + '</b><br><span class="muted">' + r.file + '</span></td><td><span class="score ' + scoreClass(r.score) + '">' + r.score + "</span></td><td>" + (top ? esc(top.msg) : '<span class="muted">—</span>') + "</td></tr>";
      }).join("") + "</tbody></table></div></div>" +
      '<div class="card"><h2>What the site says about the business</h2><p class="muted">This is the record search engines and AI tools read. It must match Google Maps, Yelp and every directory exactly.</p><table class="tbl"><tbody>' +
      [["Name", b.name], ["Phone", (AdvBuilder.phoneForms(b.phone) || {}).display || b.phone], ["Address", b.street + ", " + b.city + ", " + b.region + " " + b.postalCode], ["Hours", (b.hours.days.length === 7 ? "Daily" : b.hours.days.join(", ")) + " " + b.hours.opens + "–" + b.hours.closes], ["TXDMV", b.txdmv], ["Profiles linked", AdvBuilder.profileUrls(b).length || "None yet"]]
        .map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table></div>";
  };

  views.business = function () {
    var b = state.draft.business;
    return '<div class="view-head"><div><h1>Business details</h1><p>One place for the facts. Phone, email, TXDMV number and street address are updated on every page when you publish.</p></div></div>' +
      '<div class="card"><h2>Identity</h2><div class="grid-2">' +
      field("Business name", "business.name", { help: "Use the exact name on your Google Business Profile." }) +
      field("Also known as", "business.alternateName") +
      field("Tagline", "business.tagline", { help: "Shown on your truck: “Get the Advantage”." }) +
      field("Owners", "business.owner") +
      field("Year founded", "business.foundingYear", { type: "number" }) +
      field("Price range", "business.priceRange", { help: "$, $$ or $$$ — as listed on Google." }) + "</div>" +
      field("One-sentence description", "business.description", { textarea: true, max: 250, help: "How you’d describe the business to a stranger. AI assistants often reuse this wording." }) + "</div>" +
      '<div class="card"><h2>Contact</h2><div class="grid-2">' +
      field("Phone", "business.phone", { help: "Any format. Changing it updates every page." }) +
      field("Text-message number (optional)", "business.smsNumber", { help: "Only if this line can receive texts. Adds a “Prefer to text?” link next to the call button." }) +
      field("Email", "business.email", { type: "email" }) + "</div></div>" +
      '<div class="card"><h2>Address</h2><div class="grid-2">' +
      field("Street", "business.street") + field("City", "business.city") +
      field("State", "business.region") + field("ZIP", "business.postalCode") + "</div></div>" +
      '<div class="card"><h2>Hours</h2><div class="grid-2">' +
      field("Opens", "business.hours.opens", { type: "time" }) + field("Closes", "business.hours.closes", { type: "time" }) + "</div>" +
      '<div class="actions">' + DAYS.map(function (d) { return '<label class="check"><input type="checkbox" data-day="' + d + '"' + (b.hours.days.indexOf(d) !== -1 ? " checked" : "") + "> " + d.slice(0, 3) + "</label>"; }).join("") + "</div>" +
      '<p class="muted">Visible page text says “Open daily 8am–5pm”. If hours change, the audit will flag pages to update.</p></div>' +
      '<div class="card"><h2>Licensing</h2><div class="grid-2">' +
      field("TXDMV certificate", "business.txdmv", { help: '<a href="https://apps.txdmv.gov/apps/mccs/truckstop/" target="_blank" rel="noopener">Check it’s ACTIVE ↗</a>' }) +
      field("USDOT number (optional)", "business.usdot", { help: "Only needed for moves that cross state lines." }) + "</div></div>" +
      '<div class="card"><h2>Service area</h2><div class="grid-3">' + field("Service radius (miles)", "business.serviceRadiusMiles", { type: "number" }) + field("Center latitude", "business.serviceCenter.lat", { help: "Center of the service radius (Buda)." }) + field("Center longitude", "business.serviceCenter.lng") + "</div>" +
      '<label class="field"><span>One place per line</span><textarea data-areas>' + esc(b.areaServed.map(function (a) { return a.name; }).join("\n")) + "</textarea><small>Cities as “City, TX”. A line that is just “Texas” is treated as statewide.</small></label></div>";
  };

  views.pages = function () {
    var p = pending(), a = AdvAudit.auditSite(p.data, p.built);
    var file = state.pageFile || state.draft.pages[0].file;
    var idx = state.draft.pages.findIndex(function (x) { return x.file === file; });
    var pg = state.draft.pages[idx], res = a.pages.filter(function (r) { return r.file === file; })[0] || { issues: [], score: 0 };
    var url = state.draft.site.baseUrl + (pg.path || "");
    return '<div class="view-head"><div><h1>Pages &amp; SEO</h1><p>What appears in Google results and link previews for each page.</p></div>' +
      '<label class="field" style="min-width:280px;margin:0"><span>Page</span><select data-page-select>' + state.draft.pages.map(function (x) { return '<option value="' + x.file + '"' + (x.file === file ? " selected" : "") + ">" + esc(x.title || x.file) + "</option>"; }).join("") + "</select></label></div>" +
      '<div class="card"><h2>Google preview</h2><div class="serp"><div class="u">' + esc(url.replace("https://", "")) + '</div><div class="t">' + esc(pg.title) + '</div><div class="d">' + esc(pg.description) + "</div></div></div>" +
      '<div class="card"><h2>Search listing</h2>' +
      field("Title", "pages." + idx + ".title", { max: 60, help: "Lead with the service and area, end with the brand. Example: “Piano Movers in South Austin | Advantage Moving”." }) +
      field("Description", "pages." + idx + ".description", { textarea: true, max: 160, help: "One or two plain sentences: what you do, where, and a reason to call. Include the phone number when it fits." }) +
      field("Social share title (optional)", "pages." + idx + ".ogTitle") +
      field("Social share image", "pages." + idx + ".ogImage", { placeholder: state.draft.site.defaultOgImage, help: "Path inside the site, e.g. assets/bg.jpg. Leave blank for the default." }) +
      '<div class="grid-2">' + field("Sitemap priority", "pages." + idx + ".priority", { help: "1.0 home, 0.8–0.9 key services, 0.5 minor pages." }) +
      '<label class="check"><input type="checkbox" data-index-toggle="' + idx + '"' + (pg.index !== false ? " checked" : "") + "> Show this page in search results</label></div></div>" +
      '<div class="card"><h2>Audit for this page <span class="score ' + scoreClass(res.score) + '">' + res.score + "</span></h2>" + issueList(res.issues) + "</div>";
  };

  /* ---------- Page copy: site-wide search + editor for builder-managed pages ---------- */
  function pageText(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,noscript,header,footer,.mobile-actions,.utility").forEach(function (n) { n.remove(); });
    return (doc.body ? doc.body.textContent : "").replace(/\s+/g, " ").trim();
  }
  function searchResults(q) {
    q = q.trim().toLowerCase();
    if (q.length < 2) return '<p class="muted">Type at least two letters to search every page’s visible text.</p>';
    var built = pending().built, rows = [], content = state.draft.content || {};
    state.draft.pages.forEach(function (p) {
      var text = pageText(built[p.file] || ""), lower = text.toLowerCase(), i = lower.indexOf(q), hits = 0, snippets = [];
      while (i !== -1 && hits < 50) {
        if (snippets.length < 2) snippets.push(esc(text.slice(Math.max(0, i - 60), i)) + "<mark>" + esc(text.slice(i, i + q.length)) + "</mark>" + esc(text.slice(i + q.length, i + q.length + 60)));
        hits++; i = lower.indexOf(q, i + q.length);
      }
      if (hits) rows.push('<li><div><b>' + esc(p.title || p.file) + '</b> <span class="muted">' + p.file + " · " + hits + " match" + (hits > 1 ? "es" : "") + "</span><p>…" + snippets.join("…<br>…") + "…</p></div>" +
        (content[p.file] ? '<button class="button btn-sm" data-edit-content="' + p.file + '">Edit copy</button>' : '<a class="button button-outline btn-sm" href="../' + p.file + '" target="_blank" rel="noopener">View page ↗</a>') + "</li>");
    });
    return rows.length ? '<ul class="search-results">' + rows.join("") + "</ul>" : '<p class="muted">No matches.</p>';
  }

  views.content = function () {
    var content = state.draft.content || {}, files = Object.keys(content);
    var file = state.contentFile && content[state.contentFile] ? state.contentFile : files[0];
    state.contentFile = file;
    var c = content[file] || {}, side = c.side || {};
    var cf = function (label, key, opts) {
      opts = opts || {};
      var v = key.split(".").reduce(function (o, k) { return o == null ? "" : o[k]; }, c); if (v == null) v = "";
      var input = opts.textarea ? '<textarea data-cfield="' + key + '"' + (opts.tall ? ' style="min-height:420px;font-family:ui-monospace,Menlo,monospace;font-size:.88rem"' : "") + ">" + esc(v) + "</textarea>"
        : '<input data-cfield="' + key + '" value="' + esc(v) + '">';
      return '<label class="field"><span>' + label + "</span>" + input + (opts.help ? "<small>" + opts.help + "</small>" : "") + "</label>";
    };
    return '<div class="view-head"><div><h1>Page copy &amp; search</h1><p>Search every page’s text, and edit the copy on service and guide pages. Everything publishes as plain HTML that search engines and AI assistants can read.</p></div></div>' +
      '<div class="card"><h2>Search the site</h2><label class="field"><span>Find text on any page</span><input data-content-search value="' + esc(state.contentQuery || "") + '" placeholder="e.g. stairs, TXDMV, San Marcos"></label><div id="searchOut">' + searchResults(state.contentQuery || "") + "</div></div>" +
      '<div class="card"><div class="view-head" style="margin-bottom:12px"><h2 style="margin:0">Edit a page</h2><label class="field" style="min-width:300px;margin:0"><span>Page</span><select data-content-select>' +
      files.map(function (f) { var p = state.draft.pages.filter(function (x) { return x.file === f; })[0]; return '<option value="' + f + '"' + (f === file ? " selected" : "") + ">" + esc((p && p.title) || f) + "</option>"; }).join("") +
      '</select></label></div><p class="muted"><a href="../' + file + '" target="_blank" rel="noopener">View current page ↗</a> · Title and description are under <b>Pages &amp; SEO</b>.</p>' +
      '<div class="grid-2">' + cf("Small heading above title", "eyebrow") + cf("Main headline (H1)", "h1") + "</div>" + cf("Intro sentence", "lede", { textarea: true }) +
      '<div class="notice info"><b>Formatting:</b> blank line = new paragraph · <code>## Heading</code> · <code>### Smaller heading</code> · <code>- bullet</code> · <code>1. step</code> · <code>**bold**</code> · <code>[link text](page.html)</code></div>' +
      '<div class="grid-2"><div>' + cf("Main copy", "article", { textarea: true, tall: true }) + '</div><div><span class="field"><span>Live preview</span></span><div class="copy-preview article" id="copyPreview">' + AdvBuilder.renderText(c.article) + "</div></div></div>" +
      '<h3>Side box</h3><div class="grid-2">' + cf("Side box title", "side.title") + cf("Side box text", "side.text") + "</div>" +
      '<label class="field"><span>Side box checklist (one per line)</span><textarea data-citems>' + esc((side.items || []).join("\n")) + "</textarea></label>" +
      '<h3>Questions on this page</h3>' + cf("FAQ heading", "faqTitle") +
      (c.faq || []).map(function (f, i) {
        return '<div class="faq-item"><label class="field"><span>Question ' + (i + 1) + '</span><input data-cfaq="' + i + ':q" value="' + esc(f.q) + '"></label><label class="field"><span>Answer</span><textarea data-cfaq="' + i + ':a">' + esc(f.a) + '</textarea></label><div class="actions"><button class="link-btn" style="color:var(--danger)" data-cfaq-del="' + i + '">Delete question</button></div></div>';
      }).join("") + '<button class="button button-outline btn-sm" data-cfaq-add>Add question</button></div>';
  };

  views.faq = function () {
    var faq = state.draft.faq;
    return '<div class="view-head"><div><h1>FAQ</h1><p>Shown on the home page and published as FAQ structured data—always identical, so AI answers quote you accurately.</p></div><button class="button btn-sm" data-faq-add>Add question</button></div>' +
      '<div class="notice info">Write answers a customer could repeat word for word: specific, true and short. Good additions: how far ahead to book, what affects the price, whether you move on weekends, how payment works.</div>' +
      faq.map(function (f, i) {
        return '<div class="faq-item">' + field("Question " + (i + 1), "faq." + i + ".q") + field("Answer", "faq." + i + ".a", { textarea: true }) +
          '<div class="actions"><button class="link-btn" data-faq-move="' + i + ':-1"' + (i === 0 ? " disabled" : "") + '>Move up</button><button class="link-btn" data-faq-move="' + i + ':1"' + (i === faq.length - 1 ? " disabled" : "") + '>Move down</button><button class="link-btn" style="color:var(--danger)" data-faq-del="' + i + '">Delete</button></div></div>';
      }).join("");
  };

  views.reviews = function () {
    var b = state.draft.business;
    return '<div class="view-head"><div><h1>Reviews &amp; profiles</h1><p>Reviews are the strongest local ranking and trust signal. These links connect your site to them.</p></div></div>' +
      '<div class="card"><h2>Google</h2>' +
      field("Google Business Profile link", "business.googleBusinessUrl", { placeholder: "https://maps.app.goo.gl/…", help: "In Google Maps, open your listing → Share → Copy link. Adds a “Read our Google reviews” button." }) +
      field("Google “leave a review” link", "business.googleReviewUrl", { placeholder: "https://g.page/r/…/review", help: "In your Business Profile dashboard → “Ask for reviews” → copy the link. Adds a “Leave a review” button." }) + "</div>" +
      '<div class="card"><h2>Other profiles</h2><label class="field"><span>One link per line</span><textarea data-sameas>' + esc((b.sameAs || []).join("\n")) + "</textarea><small>Yelp, BBB, Facebook, Nextdoor, Angi… Only add profiles you control and keep their name, phone and address identical to this site.</small></label>" +
      '<div class="actions"><a class="button button-outline btn-sm" href="https://www.yelp.com/search?find_desc=Advantage+Moving&find_loc=Buda%2C+TX" target="_blank" rel="noopener">Find on Yelp ↗</a><a class="button button-outline btn-sm" href="https://www.bbb.org/search?find_text=Advantage%20Moving&find_loc=Buda%2C%20TX" target="_blank" rel="noopener">Find on BBB ↗</a></div></div>';
  };

  var AI_TOOLS = ["ChatGPT", "Google AI Mode", "Gemini", "Perplexity", "Copilot"];
  var AI_PROMPTS = ["Who are the best movers in South Austin?", "Recommend a family-owned moving company near Buda, TX", "Who can move a piano in Austin?", "Is Advantage Moving in Buda licensed?", "What do customers say about Advantage Moving Austin?"];
  views.ai = function () {
    var log = store("adv-ai-log") || [];
    var byTool = AI_TOOLS.map(function (t) {
      var rows = log.filter(function (r) { return r.tool === t; });
      return [t, rows.length, rows.filter(function (r) { return r.mentioned === "yes"; }).length];
    }).filter(function (r) { return r[1]; });
    return '<div class="view-head"><div><h1>AI visibility</h1><p>AI answers change every time. Ask each question three times per tool, log what you see, and repeat monthly to spot trends.</p></div>' +
      '<div class="actions"><button class="button button-outline btn-sm" data-ai-export>Export CSV</button></div></div>' +
      '<div class="notice info">Saved in this browser only (it can include competitor names, so it isn’t published). Export a CSV to keep a copy.</div>' +
      '<form class="card" data-ai-form><h2>Log an answer</h2><div class="grid-3">' +
      '<label class="field"><span>Date</span><input name="date" type="date" value="' + today() + '"></label>' +
      '<label class="field"><span>Tool</span><select name="tool">' + AI_TOOLS.map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
      '<label class="field"><span>Mentioned?</span><select name="mentioned"><option value="yes">Yes</option><option value="no">No</option></select></label></div>' +
      '<label class="field"><span>Question</span><select name="prompt">' + AI_PROMPTS.map(function (p) { return "<option>" + esc(p) + "</option>"; }).join("") + "</select></label>" +
      '<div class="grid-3"><label class="field"><span>Position (1 = first)</span><input name="position" type="number" min="1"></label>' +
      '<label class="field"><span>Details accurate?</span><select name="accurate"><option>Yes</option><option>Partly</option><option>No</option><option>Not mentioned</option></select></label>' +
      '<label class="field"><span>Sites it cited</span><input name="sources" placeholder="yelp.com, bbb.org…"></label></div>' +
      '<label class="field"><span>Notes (competitors named, wrong facts…)</span><input name="notes"></label>' +
      '<button class="button btn-sm" type="submit">Add to log</button></form>' +
      (byTool.length ? '<div class="card"><h2>Mention rate by tool</h2><table class="tbl"><tbody>' + byTool.map(function (r) { return "<tr><th>" + r[0] + "</th><td>" + r[2] + " of " + r[1] + " answers (" + Math.round(r[2] / r[1] * 100) + "%)</td></tr>"; }).join("") + "</tbody></table></div>" : "") +
      '<div class="card"><h2>Log</h2>' + (log.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Tool</th><th>Question</th><th>Mentioned</th><th>Pos.</th><th>Accurate</th><th>Cited</th><th></th></tr></thead><tbody>' +
        log.map(function (r, i) { return "<tr><td>" + esc(r.date) + "</td><td>" + esc(r.tool) + "</td><td>" + esc(r.prompt) + "</td><td>" + esc(r.mentioned) + "</td><td>" + esc(r.position || "") + "</td><td>" + esc(r.accurate) + "</td><td>" + esc(r.sources || "") + '</td><td><button class="link-btn" style="color:var(--danger)" data-ai-del="' + i + '">Delete</button></td></tr>'; }).join("") +
        "</tbody></table></div>" : '<p class="muted">Nothing logged yet.</p>') + "</div>";
  };

  views.growth = function () {
    var b = state.draft.business, review = b.googleReviewUrl || "[your Google review link]";
    var sms = "Hi [name], thanks for moving with Advantage today! If the crew took good care of you, a quick Google review helps a small family business more than you’d think: " + review + " — The Advantage team";
    var email = "Subject: How did your move go?\n\nHi [name],\n\nThank you for trusting Advantage Moving with your move. We’re a family business, and most of our customers find us through neighbors’ reviews.\n\nIf you have two minutes, we’d be grateful for an honest Google review:\n" + review + "\n\nIf anything wasn’t right, reply to this email and we’ll make it right.\n\n— The Advantage Moving team\n" + ((AdvBuilder.phoneForms(b.phone) || {}).display || "");
    return '<div class="view-head"><div><h1>Growth playbook</h1><p>The highest-impact local marketing for a family moving company, in order. Most of it happens off the website.</p></div></div><div class="play">' +
      '<div class="card"><h2><span class="tag">Daily</span>Call every web lead back within 5 minutes</h2><p>The first mover to respond wins most jobs, and reaching a lead within 5 minutes makes contact far more likely than waiting 30. Each quote email’s subject now says <b>“call by 2:45pm”</b> (or the next opening time after hours), and the customer is told what to expect.</p><ul><li>Turn on Formspree email notifications and make sure they reach the phone that’s answered during business hours.</li><li>Call first, then text if there’s no answer: “Hi, this is [name] from Advantage Moving about your quote request—when’s a good time?”</li><li>After hours, call at opening time—the customer was promised that.</li></ul></div>' +
      '<div class="card"><h2><span class="tag">Weekly</span>Ask every happy customer for a Google review</h2><p>Review count, recency and wording are among the strongest local ranking signals, and AI assistants lean on them when choosing which 3–6 businesses to name. Ask the same day, while the crew is fresh in their mind. Never offer anything in exchange.</p>' +
      '<h3>Text message</h3><label class="field"><textarea readonly data-copy>' + esc(sms) + '</textarea></label><button class="button button-outline btn-sm" data-copy-btn>Copy text</button>' +
      '<h3>Email</h3><label class="field"><textarea readonly data-copy style="min-height:220px">' + esc(email) + '</textarea></label><button class="button button-outline btn-sm" data-copy-btn>Copy email</button>' +
      '<p class="muted">Reply to every review—good or bad—within a few days, mentioning the neighborhood or type of move when natural (“Glad the Travis Heights stairs went smoothly!”).</p></div>' +
      '<div class="card"><h2><span class="tag">Once</span>Complete the Google Business Profile</h2><ul><li>Primary category <b>Mover</b>; add secondary categories that truly apply (e.g. Piano moving service, Packing supply store only if you sell supplies).</li><li>Hours, phone and address exactly as on this site. Add holiday hours each season.</li><li>Services list with short descriptions matching the site’s service pages.</li><li>Upload <b>real</b> photos monthly: crew, trucks with the TXDMV number visible, padded furniture, happy customers (with permission). Real photos beat illustrations for trust.</li><li>Post an update twice a month: a recent move, a packing tip, a seasonal reminder.</li></ul></div>' +
      '<div class="card"><h2><span class="tag">Once</span>Make your listings agree everywhere</h2><p>AI assistants cross-check the business across many sources. Claim and correct Yelp, BBB, Bing Places, Apple Business Connect, Nextdoor, Angi and Thumbtack so name, phone, address and hours match this site character for character, then add each link under <b>Reviews &amp; profiles</b>.</p></div>' +
      '<div class="card"><h2><span class="tag">Monthly</span>Lead with what makes a family business different</h2><ul><li><b>Verifiability:</b> the TXDMV number links to the state lookup. Keep it on trucks, invoices and every profile.</li><li><b>Real people:</b> the crew photo on the home page is your best asset. Add first names and years with the company if the crew agrees.</li><li><b>Straight answers:</b> publish how pricing works (hourly crews, what changes the total) as an FAQ. Customers comparing quotes reward clarity.</li><li><b>Local proof:</b> after notable jobs, add a short line to a service page: neighborhood, type of move, one challenge solved. Specific, true details are what AI tools quote.</li></ul></div>' +
      '<div class="card"><h2><span class="tag">Seasonal</span>Plan around Austin’s busy calendar</h2><ul><li><b>May–August</b> is peak season; end-of-month lease turnover and UT move-in in mid-August book first. Publish a “book 2–4 weeks ahead” reminder in spring.</li><li><b>Winter</b> is slower: promote weekday availability and office moves.</li><li>Answer response time is a conversion factor—call back web leads within the hour during business hours.</li></ul></div>' +
      '<div class="card"><h2><span class="tag">Ongoing</span>Earn mentions on pages AI tools cite</h2><p>Most AI citations for local services come from business websites, review sites and “best of” roundups. Ask satisfied commercial clients, realtors and apartment managers in South Austin to mention you; join the Buda and South Austin chambers; answer moving questions honestly on Nextdoor and local Reddit threads without spamming links.</p></div></div>';
  };

  views.publish = function () {
    var p = pending(), c = ghConfig(), names = Object.keys(p.changed);
    var diffs = names.map(function (n) {
      var before = (n === "data/site.json" ? JSON.stringify(state.original, null, 2) + "\n" : state.files[n] || "").split("\n");
      var after = p.changed[n].split("\n"), set = {};
      before.forEach(function (l) { set[l] = (set[l] || 0) + 1; });
      var plus = 0; after.forEach(function (l) { if (set[l]) set[l]--; else plus++; });
      var minus = Object.keys(set).reduce(function (n, k) { return n + set[k]; }, 0);
      return '<li><span>' + esc(n) + '</span><span><span class="plus">+' + plus + '</span> <span class="minus">−' + minus + "</span></span></li>";
    });
    return '<div class="view-head"><div><h1>Publish</h1><p>Review what will change, then publish. The live site updates about a minute after publishing.</p></div></div>' +
      (state.draft.admin.mustChange ? '<div class="notice error">The default password is still active. Change it under <b>Account</b> before publishing.</div>' : "") +
      '<div class="card"><h2>Changes waiting (' + names.length + ")</h2>" + (names.length ? '<ul class="diff-list">' + diffs.join("") + "</ul>" : '<p class="muted">Nothing to publish.</p>') +
      '<label class="field" style="margin-top:16px"><span>Note for the change history (optional)</span><input id="pubMsg" placeholder="e.g. Updated holiday hours"></label>' +
      '<div class="actions"><button class="button btn-sm" data-publish' + (!names.length || !state.store.commit ? " disabled" : "") + ">Publish " + (state.store === LocalStore ? "to local preview" : "to live site") + '</button><button class="button button-outline btn-sm" data-download>Download site.json</button><button class="link-btn" data-discard' + (names.length ? "" : " disabled") + ">Discard changes</button></div></div>" +
      '<div class="card"><h2>GitHub connection</h2><p class="muted">Publishing needs a GitHub <b>fine-grained token</b> limited to this one repository with <b>Contents: Read and write</b>. It stays in this browser. <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">Create a token ↗</a></p>' +
      '<form data-gh-form><div class="grid-3"><label class="field"><span>Owner</span><input name="owner" value="' + esc(c.owner) + '"></label><label class="field"><span>Repository</span><input name="repo" value="' + esc(c.repo) + '"></label><label class="field"><span>Branch</span><input name="branch" value="' + esc(c.branch) + '"></label></div>' +
      '<label class="field"><span>Token</span><input name="token" type="password" autocomplete="off" placeholder="' + (c.token ? "•••••••• saved" : "github_pat_…") + '"></label>' +
      '<label class="check"><input type="checkbox" name="remember"' + (localStorage.getItem("adv-admin-token") ? " checked" : "") + "> Remember on this computer (only on a private device)</label>" +
      '<div class="actions"><button class="button btn-sm" type="submit">Save &amp; connect</button><button class="link-btn" type="button" data-gh-forget>Forget token</button></div></form></div>';
  };

  views.account = function () {
    return '<div class="view-head"><div><h1>Account</h1><p>Signed in as <b>' + esc(state.draft.admin.user) + "</b>.</p></div></div>" +
      '<div class="card"><h2>Change password</h2><button class="button btn-sm" data-change-pw>Choose a new password</button><p class="muted" style="margin-top:12px">The new password applies once you publish.</p></div>' +
      '<div class="card"><h2>How sign-in works</h2><p class="muted">This site is static, so the sign-in only keeps the editor out of view. What actually protects the live site is the GitHub token under <b>Publish</b>—without it, nobody can change anything, even with the password. Keep the token private and revoke it on GitHub if a device is lost.</p></div>';
  };

  function render() {
    document.querySelectorAll("#sideNav button").forEach(function (b) { b.setAttribute("aria-current", b.dataset.view === state.view ? "page" : "false"); });
    $("#main").innerHTML = views[state.view]();
    refreshBadge();
  }

  function go(view) { state.view = view; render(); $("#main").focus(); window.scrollTo(0, 0); }

  /* ---------------- events ---------------- */
  document.addEventListener("input", function (e) {
    var t = e.target;
    if (t.dataset.bind) {
      var v = t.type === "number" ? (t.value === "" ? "" : Number(t.value)) : t.value;
      setPath(state.draft, t.dataset.bind, v);
      if (t.dataset.max) { var c = t.parentElement.querySelector(".count"); if (c) { c.textContent = t.value.length + "/" + t.dataset.max; c.classList.toggle("bad", t.value.length > Number(t.dataset.max)); } }
      refreshBadge();
    } else if (t.hasAttribute("data-content-search")) {
      state.contentQuery = t.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () { var out = document.getElementById("searchOut"); if (out) out.innerHTML = searchResults(state.contentQuery); }, 200);
    } else if (t.dataset.cfield) {
      var c = state.draft.content[state.contentFile], keys = t.dataset.cfield.split("."), last = keys.pop();
      var target = keys.reduce(function (o, k) { o[k] = o[k] || {}; return o[k]; }, c);
      target[last] = t.value;
      if (t.dataset.cfield === "article") { var pv = document.getElementById("copyPreview"); if (pv) pv.innerHTML = AdvBuilder.renderText(t.value); }
      refreshBadge();
    } else if (t.hasAttribute("data-citems")) {
      var cc = state.draft.content[state.contentFile]; cc.side = cc.side || {};
      cc.side.items = t.value.split("\n").map(function (x) { return x.trim(); }).filter(Boolean);
      refreshBadge();
    } else if (t.dataset.cfaq) {
      var p2 = t.dataset.cfaq.split(":");
      state.draft.content[state.contentFile].faq[Number(p2[0])][p2[1]] = t.value;
      refreshBadge();
    } else if (t.hasAttribute("data-areas")) {
      state.draft.business.areaServed = t.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean).map(function (n) { return { type: /^texas$/i.test(n) ? "State" : "City", name: n }; });
      refreshBadge();
    } else if (t.hasAttribute("data-sameas")) {
      state.draft.business.sameAs = t.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean);
      refreshBadge();
    }
  });

  document.addEventListener("change", function (e) {
    var t = e.target;
    if (t.dataset.day) {
      state.draft.business.hours.days = DAYS.filter(function (d) { return document.querySelector('[data-day="' + d + '"]').checked; });
      refreshBadge();
    } else if (t.hasAttribute("data-page-select")) { state.pageFile = t.value; render(); }
    else if (t.hasAttribute("data-content-select")) { state.contentFile = t.value; render(); }
    else if (t.dataset.indexToggle) { state.draft.pages[Number(t.dataset.indexToggle)].index = t.checked; render(); }
    else if (t.dataset.bind && state.view === "pages") render();
  });

  document.addEventListener("click", async function (e) {
    var t = e.target.closest("button,tr[data-open-page]");
    if (!t) return;
    if (t.dataset.view) return go(t.dataset.view);
    if (t.dataset.openPage) { state.pageFile = t.dataset.openPage; return go("pages"); }
    if (t.dataset.editContent) { state.contentFile = t.dataset.editContent; render(); var ed = document.querySelector("[data-content-select]"); if (ed) ed.scrollIntoView({ block: "start" }); return; }
    if (t.hasAttribute("data-cfaq-add")) { var cfq = state.draft.content[state.contentFile]; cfq.faq = cfq.faq || []; cfq.faq.push({ q: "New question?", a: "Answer." }); return render(); }
    if (t.dataset.cfaqDel) { if (confirm("Delete this question?")) { state.draft.content[state.contentFile].faq.splice(Number(t.dataset.cfaqDel), 1); render(); } return; }
    if (t.hasAttribute("data-faq-add")) { state.draft.faq.push({ q: "New question?", a: "Answer." }); return render(); }
    if (t.dataset.faqDel) { if (confirm("Delete this question?")) { state.draft.faq.splice(Number(t.dataset.faqDel), 1); render(); } return; }
    if (t.dataset.faqMove) {
      var parts = t.dataset.faqMove.split(":").map(Number), f = state.draft.faq, item = f.splice(parts[0], 1)[0];
      f.splice(parts[0] + parts[1], 0, item); return render();
    }
    if (t.hasAttribute("data-copy-btn")) {
      var ta = t.previousElementSibling.querySelector("textarea");
      try { await navigator.clipboard.writeText(ta.value); toast("Copied."); } catch (err) { ta.select(); toast("Press Ctrl/Cmd+C to copy."); }
      return;
    }
    if (t.dataset.aiDel) { var log = store("adv-ai-log") || []; log.splice(Number(t.dataset.aiDel), 1); store("adv-ai-log", log); return render(); }
    if (t.hasAttribute("data-ai-export")) {
      var rows = [["date", "tool", "prompt", "mentioned", "position", "accurate", "sources", "notes"]].concat((store("adv-ai-log") || []).map(function (r) { return [r.date, r.tool, r.prompt, r.mentioned, r.position, r.accurate, r.sources, r.notes]; }));
      download("ai-visibility-log.csv", rows.map(function (r) { return r.map(function (v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }).join("\n"), "text/csv");
      return;
    }
    if (t.hasAttribute("data-download")) { download("site.json", JSON.stringify(pending().data, null, 2) + "\n", "application/json"); return; }
    if (t.hasAttribute("data-discard")) { if (confirm("Discard all unpublished changes?")) { var admin = state.draft.admin; state.draft = clone(state.original); state.draft.admin = admin; render(); } return; }
    if (t.hasAttribute("data-gh-forget")) { localStorage.removeItem("adv-admin-token"); sessionStorage.removeItem("adv-admin-token"); await reconnect(); return; }
    if (t.hasAttribute("data-change-pw")) return openPw();
    if (t.hasAttribute("data-publish")) return publish(t);
  });

  document.addEventListener("submit", async function (e) {
    var f = e.target;
    if (f.hasAttribute("data-ai-form")) {
      e.preventDefault();
      var fd = Object.fromEntries(new FormData(f)), log = store("adv-ai-log") || [];
      log.unshift(fd); store("adv-ai-log", log); toast("Logged."); render();
    } else if (f.hasAttribute("data-gh-form")) {
      e.preventDefault();
      var g = Object.fromEntries(new FormData(f));
      store("adv-admin-gh", { owner: g.owner.trim(), repo: g.repo.trim(), branch: g.branch.trim() || "main" });
      if (g.token) {
        localStorage.removeItem("adv-admin-token"); sessionStorage.removeItem("adv-admin-token");
        (g.remember ? localStorage : sessionStorage).setItem("adv-admin-token", g.token.trim());
      }
      await reconnect();
    }
  });

  async function reconnect() {
    var draft = state.draft;
    try {
      await loadAll();
      if (draft) { state.draft = draft; }
      toast("Connected: " + state.store.label + ".");
    } catch (err) { toast(err.message, true); }
    render();
  }

  async function publish(btn) {
    if (state.draft.admin.mustChange) { toast("Change the default password first (Account).", true); return go("account"); }
    var p = pending(), names = Object.keys(p.changed);
    if (!names.length) return;
    var msgInput = $("#pubMsg"), note = msgInput && msgInput.value.trim();
    btn.disabled = true; btn.textContent = "Publishing…";
    try {
      var files = p.changed;
      files["data/site.json"] = JSON.stringify(p.data, null, 2) + "\n";
      var url = await state.store.commit(files, "Admin: " + (note || "update site settings") + "\n\nPublished from the site admin (" + names.length + " files).");
      Object.keys(files).forEach(function (k) { if (k !== "data/site.json") state.files[k] = files[k]; });
      state.original = clone(p.data); state.draft = clone(p.data);
      toast(url ? "Published. The live site updates in about a minute." : "Saved to local preview.");
    } catch (err) { toast(err.message, true); }
    render();
  }

  function download(name, text, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type }));
    a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------------- password dialog ---------------- */
  function openPw(required) {
    var d = $("#pwDialog");
    d.dataset.required = required ? "1" : "";
    $("#pw1").value = ""; $("#pw2").value = ""; $("#pwErr").textContent = "";
    d.showModal();
  }
  $("#pwDialog").addEventListener("cancel", function (e) { if (this.dataset.required) e.preventDefault(); });
  $("#pwForm").addEventListener("submit", async function (e) {
    var a = $("#pw1").value, b = $("#pw2").value, err = $("#pwErr");
    if (a.length < 10) { e.preventDefault(); err.textContent = "Use at least 10 characters."; return; }
    if (a !== b) { e.preventDefault(); err.textContent = "The passwords don’t match."; return; }
    if (a.toLowerCase() === "admin" || a.toLowerCase().indexOf("password") !== -1) { e.preventDefault(); err.textContent = "Choose something less guessable."; return; }
    await setPassword(a);
    toast("New password set. Publish to make it permanent.");
    render();
  });

  /* ---------------- boot ---------------- */
  $("#loginForm").addEventListener("submit", async function (e) {
    e.preventDefault();
    var err = $("#loginErr"); err.textContent = "";
    var user = $("#loginUser").value.trim(), pass = $("#loginPass").value;
    if (!(await checkLogin(user, pass))) { err.textContent = "That username and password don’t match."; $("#loginPass").select(); return; }
    sessionStorage.setItem("adv-admin-session", state.original.admin.hash);
    showApp();
    if (state.original.admin.mustChange || pass === "admin") openPw(true);
  });

  $("#signOut").addEventListener("click", function () { sessionStorage.removeItem("adv-admin-session"); location.reload(); });

  function showApp() { $("#login").hidden = true; $("#app").hidden = false; render(); }

  (async function boot() {
    try { await loadAll(); } catch (err) {
      $("#login").hidden = false; $("#loginErr").textContent = "Couldn’t load site data: " + err.message; return;
    }
    if (sessionStorage.getItem("adv-admin-session") === state.original.admin.hash) showApp();
    else { $("#login").hidden = false; $("#loginUser").focus(); }
  })();
})();
