/* Advantage Moving — site builder.
   Pure functions: (previous data, next data, current files) -> rebuilt files.
   Everything search engines and AI tools read is baked into static HTML here,
   so nothing SEO-relevant depends on client-side JavaScript.

   Regions it owns inside the HTML:
     <!-- seo:head --> … <!-- /seo:head -->              per-page title/meta/canonical/OG
     <script type="application/ld+json" id="ld-business"> business entity (index.html)
     <script type="application/ld+json" id="ld-faq">      FAQ schema (index.html)
     <!--seo:faq--> … <!--/seo:faq-->                     visible FAQ (index.html)
     <!--slot:NAME--> … <!--/slot:NAME-->                 optional links (reviews, profiles, text)
   Plus whole files: sitemap.xml and robots.txt.
   Business phone / email / TXDMV / street are also replaced wherever the
   previously published value appears, so one edit updates every page. */
(function (root) {
  "use strict";

  var esc = function (s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  function phoneForms(raw) {
    var d = String(raw || "").replace(/\D/g, "");
    if (d.length === 11 && d[0] === "1") d = d.slice(1);
    if (d.length !== 10) return null;
    var a = d.slice(0, 3), b = d.slice(3, 6), c = d.slice(6);
    return { digits: d, display: "(" + a + ") " + b + "-" + c, tel: "+1" + d, schema: "+1-" + a + "-" + b + "-" + c, dashed: a + "-" + b + "-" + c };
  }

  function absUrl(data, path) { return data.site.baseUrl + (path || ""); }

  function headBlock(data, page) {
    var url = absUrl(data, page.path);
    var img = absUrl(data, page.ogImage || data.site.defaultOgImage);
    return [
      "<!-- seo:head -->",
      "<title>" + esc(page.title) + "</title>",
      '<meta name="description" content="' + esc(page.description) + '">',
      '<meta name="robots" content="' + (page.index === false ? "noindex, nofollow" : "index, follow") + '">',
      '<link rel="canonical" href="' + esc(url) + '">',
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="' + esc(data.site.name) + '">',
      '<meta property="og:title" content="' + esc(page.ogTitle || page.title) + '">',
      '<meta property="og:description" content="' + esc(page.description) + '">',
      '<meta property="og:url" content="' + esc(url) + '">',
      '<meta property="og:image" content="' + esc(img) + '">',
      '<meta name="twitter:card" content="summary_large_image">',
      "<!-- /seo:head -->"
    ].join("\n");
  }

  function profileUrls(b) {
    var list = [b.googleBusinessUrl].concat(b.sameAs || []);
    var seen = {};
    return list.map(function (u) { return String(u || "").trim(); }).filter(function (u) {
      if (!/^https:\/\//.test(u) || seen[u]) return false;
      seen[u] = true; return true;
    });
  }

  function businessLd(data) {
    var b = data.business, base = data.site.baseUrl, p = phoneForms(b.phone);
    var o = { "@context": "https://schema.org", "@type": "MovingCompany", "@id": base + "#business", "name": b.name };
    if (b.alternateName) o.alternateName = b.alternateName;
    if (b.tagline) o.slogan = b.tagline;
    if (b.description) o.description = b.description;
    o.url = base;
    o.logo = base + data.site.logo;
    o.image = [base + data.site.defaultOgImage].concat(b.photo ? [base + b.photo] : []);
    if (p) o.telephone = p.schema;
    if (b.email) o.email = b.email;
    if (b.foundingYear) o.foundingDate = String(b.foundingYear);
    o.address = { "@type": "PostalAddress", "streetAddress": b.street, "addressLocality": b.city, "addressRegion": b.region, "postalCode": b.postalCode, "addressCountry": b.country || "US" };
    if (b.hours && b.hours.days && b.hours.days.length) {
      o.openingHoursSpecification = [{ "@type": "OpeningHoursSpecification", "dayOfWeek": b.hours.days, "opens": b.hours.opens, "closes": b.hours.closes }];
    }
    if (b.areaServed && b.areaServed.length) {
      o.areaServed = b.areaServed.map(function (a) { return { "@type": a.type || "City", "name": a.name }; });
    }
    var c = b.serviceCenter;
    if (c && c.lat && c.lng && b.serviceRadiusMiles) {
      o.areaServed = (o.areaServed || []).concat([{ "@type": "GeoCircle", "geoMidpoint": { "@type": "GeoCoordinates", "latitude": Number(c.lat), "longitude": Number(c.lng) }, "geoRadius": String(Math.round(Number(b.serviceRadiusMiles) * 1609.34)) }]);
    }
    var ids = [];
    if (b.txdmv) ids.push({ "@type": "PropertyValue", "propertyID": "TXDMV", "value": b.txdmv });
    if (b.usdot) ids.push({ "@type": "PropertyValue", "propertyID": "USDOT", "value": b.usdot });
    if (ids.length) o.identifier = ids;
    if (b.priceRange) o.priceRange = b.priceRange;
    if (data.services && data.services.length) {
      o.hasOfferCatalog = { "@type": "OfferCatalog", "name": "Moving services", "itemListElement": data.services.map(function (sv) {
        return { "@type": "Offer", "itemOffered": { "@type": "Service", "@id": base + sv.file + "#service", "name": sv.name, "url": base + sv.file } };
      }) };
    }
    var same = profileUrls(b);
    if (same.length) o.sameAs = same;
    return '<script type="application/ld+json" id="ld-business">' + JSON.stringify(o) + "</script>";
  }

  function websiteLd(data) {
    var base = data.site.baseUrl;
    var o = { "@context": "https://schema.org", "@type": "WebSite", "@id": base + "#website", "name": data.site.name, "url": base, "inLanguage": "en-US", "publisher": { "@id": base + "#business" } };
    return '<script type="application/ld+json" id="ld-website">' + JSON.stringify(o) + "</script>";
  }

  function faqLd(data) {
    var o = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": (data.faq || []).map(function (f) {
      return { "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": f.a } };
    }) };
    return '<script type="application/ld+json" id="ld-faq">' + JSON.stringify(o) + "</script>";
  }

  function faqHtml(data) {
    return (data.faq || []).map(function (f) {
      return '<details><summary>' + esc(f.q) + '<span aria-hidden="true">+</span></summary><p>' + esc(f.a) + "</p></details>";
    }).join("\n    ");
  }

  function profileLabel(url) {
    var host = url.replace(/^https:\/\//, "").split("/")[0].replace(/^www\./, "");
    var known = { "google.com": "Google", "g.page": "Google", "maps.app.goo.gl": "Google", "yelp.com": "Yelp", "bbb.org": "BBB", "facebook.com": "Facebook", "instagram.com": "Instagram", "nextdoor.com": "Nextdoor", "angi.com": "Angi", "thumbtack.com": "Thumbtack" };
    for (var k in known) { if (host === k || host.slice(-(k.length + 1)) === "." + k) return known[k]; }
    return host;
  }

  /* ---------- Editable page copy ----------
     data.content[file] = { eyebrow, h1, lede, article (simple formatting),
       side: { title, text, items[] }, faqTitle, faq: [{q,a}], schema: {type, name, areaServed[]} }
     Formatting: blank line = new paragraph, "## " / "### " headings, "- " bullets,
     "1. " numbered steps, **bold**, [link text](page.html or https://…). */
  function inline(text) {
    return esc(text)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, url) {
        var raw = url.replace(/&amp;/g, "&");
        if (!/^(https:\/\/|[a-z0-9-]+\.html(#[\w-]+)?$|#[\w-]+$|tel:\+?\d+$|mailto:)/i.test(raw)) return label;
        var ext = /^https:/.test(raw);
        return '<a href="' + url + '"' + (ext ? ' target="_blank" rel="noopener"' : "") + ">" + label + (ext ? " ↗" : "") + "</a>";
      });
  }

  function renderText(src) {
    var blocks = String(src || "").replace(/\r/g, "").split(/\n\s*\n/);
    return blocks.map(function (block) {
      var lines = block.split("\n").map(function (l) { return l.trim(); }).filter(Boolean);
      if (!lines.length) return "";
      if (/^###\s/.test(lines[0]) && lines.length === 1) return "<h3>" + inline(lines[0].replace(/^###\s+/, "")) + "</h3>";
      if (/^##\s/.test(lines[0]) && lines.length === 1) return "<h2>" + inline(lines[0].replace(/^##\s+/, "")) + "</h2>";
      if (/^###\s/.test(lines[0])) return "<h3>" + inline(lines[0].replace(/^###\s+/, "")) + "</h3>\n" + renderText(lines.slice(1).join("\n"));
      if (/^##\s/.test(lines[0])) return "<h2>" + inline(lines[0].replace(/^##\s+/, "")) + "</h2>\n" + renderText(lines.slice(1).join("\n"));
      if (lines.every(function (l) { return /^-\s/.test(l); })) return "<ul>" + lines.map(function (l) { return "<li>" + inline(l.replace(/^-\s+/, "")) + "</li>"; }).join("") + "</ul>";
      if (lines.every(function (l) { return /^\d+\.\s/.test(l); })) return '<ol class="steps">' + lines.map(function (l) { return "<li><p>" + inline(l.replace(/^\d+\.\s+/, "")) + "</p></li>"; }).join("") + "</ol>";
      return "<p>" + inline(lines.join(" ")) + "</p>";
    }).join("\n");
  }

  function contentRegions(data, file, html) {
    var c = (data.content || {})[file];
    if (!c) return html;
    var base = data.site.baseUrl;
    html = replaceRegion(html, "<!--content:hero-->", "<!--/content:hero-->",
      '<p class="eyebrow">' + esc(c.eyebrow) + "</p><h1>" + esc(c.h1) + '</h1><p class="lede">' + inline(c.lede) + "</p>");
    html = replaceRegion(html, "<!--content:article-->", "<!--/content:article-->", "\n" + renderText(c.article) + "\n");
    var side = c.side || {};
    html = replaceRegion(html, "<!--content:side-->", "<!--/content:side-->",
      "<h2>" + esc(side.title) + "</h2><p>" + inline(side.text) + "</p><ul>" + (side.items || []).map(function (i) { return "<li><span>" + esc(i) + "</span></li>"; }).join("") + "</ul>");
    html = replaceRegion(html, "<!--content:faq-title-->", "<!--/content:faq-title-->", esc(c.faqTitle || "Common questions"));
    html = replaceRegion(html, "<!--content:faq-->", "<!--/content:faq-->", "\n      " + (c.faq || []).map(function (f) {
      return '<details><summary>' + esc(f.q) + '<span aria-hidden="true">+</span></summary><p>' + inline(f.a) + "</p></details>";
    }).join("\n      ") + "\n    ");
    var plain = function (t) { return String(t || "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); };
    var faq = { "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": (c.faq || []).map(function (f) { return { "@type": "Question", "name": f.q, "acceptedAnswer": { "@type": "Answer", "text": plain(f.a) } }; }) };
    html = html.replace(/<script type="application\/ld\+json" id="ld-page-faq">[\s\S]*?<\/script>/, function () { return '<script type="application/ld+json" id="ld-page-faq">' + JSON.stringify(faq) + "</script>"; });
    var sc = c.schema || {}, main;
    if (sc.type === "Article") {
      main = { "@context": "https://schema.org", "@type": "Article", "@id": base + file + "#article", "headline": c.h1, "description": plain(c.lede), "url": base + file, "author": { "@id": base + "#business" }, "publisher": { "@id": base + "#business" } };
      if (c.updated) main.dateModified = c.updated;
    } else {
      main = { "@context": "https://schema.org", "@type": "Service", "@id": base + file + "#service", "url": base + file, "name": sc.name || c.h1, "description": plain(c.lede), "provider": { "@type": "MovingCompany", "@id": base + "#business", "name": data.business.name } };
      if (sc.areaServed) main.areaServed = sc.areaServed.map(function (n) { return { "@type": "City", "name": n }; });
    }
    html = html.replace(/<script type="application\/ld\+json" id="ld-page-main">[\s\S]*?<\/script>/, function () { return '<script type="application/ld+json" id="ld-page-main">' + JSON.stringify(main) + "</script>"; });
    return html;
  }

  var SLOTS = {
    "intro-contact": function (data) {
      var p = phoneForms(data.business.smsNumber);
      return p ? '<a class="text-link" href="sms:' + p.tel + '">Prefer to text? ' + p.display + "</a>" : "";
    },
    "reviews-cta": function (data) {
      var b = data.business, out = [];
      if (/^https:\/\//.test(b.googleBusinessUrl || "")) out.push('<a class="button button-outline" href="' + esc(b.googleBusinessUrl) + '" target="_blank" rel="noopener">Read our Google reviews ↗</a>');
      if (/^https:\/\//.test(b.googleReviewUrl || "")) out.push('<a class="button button-cream" href="' + esc(b.googleReviewUrl) + '" target="_blank" rel="noopener">Moved with us? Leave a review ↗</a>');
      return out.length ? '<div class="reviews-cta">' + out.join("") + "</div>" : "";
    },
    "footer-profiles": function (data) {
      var urls = profileUrls(data.business);
      if (!urls.length) return "";
      return '<span class="footer-profiles">' + urls.map(function (u) {
        return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(profileLabel(u)) + "</a>";
      }).join("") + "</span>";
    }
  };

  function replaceRegion(html, open, close, content) {
    var i = html.indexOf(open);
    if (i === -1) return html;
    var j = html.indexOf(close, i + open.length);
    if (j === -1) return html;
    return html.slice(0, i + open.length) + content + html.slice(j);
  }

  function replaceAll(html, from, to) {
    if (!from || from === to) return html;
    return html.split(from).join(to);
  }

  /* Swap the previously published business facts for the new ones everywhere. */
  function replaceFacts(html, prev, next) {
    var a = phoneForms(prev.phone), b = phoneForms(next.phone);
    if (a && b && a.digits !== b.digits) {
      html = replaceAll(html, a.schema, b.schema);
      html = replaceAll(html, "tel:" + a.tel, "tel:" + b.tel);
      html = replaceAll(html, a.display, b.display);
      html = replaceAll(html, a.dashed, b.dashed);
    }
    if (prev.email && next.email) html = replaceAll(html, prev.email, next.email);
    if (prev.txdmv && next.txdmv) html = replaceAll(html, prev.txdmv, next.txdmv);
    if (prev.street && next.street) html = replaceAll(html, prev.street, next.street);
    return html;
  }

  function buildPage(prevData, data, file, html) {
    var page = (data.pages || []).filter(function (p) { return p.file === file; })[0];
    html = replaceFacts(html, prevData.business, data.business);
    html = contentRegions(data, file, html);
    if (page) {
      html = html.replace(/<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->/, function () { return headBlock(data, page); });
    }
    html = html.replace(/<script type="application\/ld\+json" id="ld-business">[\s\S]*?<\/script>/, function () { return businessLd(data); });
    html = html.replace(/<script type="application\/ld\+json" id="ld-website">[\s\S]*?<\/script>/, function () { return websiteLd(data); });
    html = html.replace(/<script type="application\/ld\+json" id="ld-faq">[\s\S]*?<\/script>/, function () { return faqLd(data); });
    html = replaceRegion(html, "<!--seo:faq-->", "<!--/seo:faq-->", "\n    " + faqHtml(data) + "\n    ");
    Object.keys(SLOTS).forEach(function (name) {
      html = replaceRegion(html, "<!--slot:" + name + "-->", "<!--/slot:" + name + "-->", SLOTS[name](data));
    });
    return html;
  }

  function sitemap(data) {
    var rows = (data.pages || []).filter(function (p) { return p.index !== false && p.sitemap !== false; }).map(function (p) {
      return "  <url><loc>" + esc(absUrl(data, p.path)) + "</loc><lastmod>" + p.lastmod + "</lastmod><priority>" + (p.priority || "0.5") + "</priority></url>";
    });
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + rows.join("\n") + "\n</urlset>\n";
  }

  function robots(data) {
    return "User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /data/\n\nSitemap: " + data.site.baseUrl + "sitemap.xml\n";
  }

  /* files: { "index.html": "<html…", … }. Returns { files: {path: content}, data } with
     only changed files, and data updated with lastmod dates for changed pages. */
  function build(prevData, nextData, files, today) {
    var data = JSON.parse(JSON.stringify(nextData));
    if (data.content) data.content = JSON.parse(replaceFacts(JSON.stringify(data.content), prevData.business, data.business));
    var out = {};
    Object.keys(files).forEach(function (file) {
      if (!/\.html$/.test(file) || file.indexOf("/") !== -1) return;
      var next = buildPage(prevData, data, file, files[file]);
      if (next !== files[file]) {
        out[file] = next;
        data.pages.forEach(function (p) { if (p.file === file) p.lastmod = today; });
      }
    });
    var sm = sitemap(data);
    if (sm !== files["sitemap.xml"]) out["sitemap.xml"] = sm;
    var rb = robots(data);
    if (rb !== files["robots.txt"]) out["robots.txt"] = rb;
    return { files: out, data: data };
  }

  var api = { build: build, renderText: renderText, phoneForms: phoneForms, headBlock: headBlock, businessLd: businessLd, faqLd: faqLd, esc: esc, profileUrls: profileUrls };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.AdvBuilder = api;
})(typeof window !== "undefined" ? window : globalThis);
