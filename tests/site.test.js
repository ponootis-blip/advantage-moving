"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const root=path.resolve(__dirname,"..");
const read=file=>fs.readFileSync(path.join(root,file),"utf8");

const index=read("index.html"),script=read("site.js"),privacy=read("privacy-policy.html"),config=read("site-config.js");
assert.match(index,/id="quoteForm"/);
assert.match(index,/name="_gotcha"/);
assert.match(index,/href="privacy-policy\.html"/);
assert.match(index,/id="qStatus"[^>]*tabindex="-1"/);
assert.match(index,/JavaScript is required for the online form/);
assert.match(script,/AbortController/);
assert.match(script,/hostname!=="formspree\.io"/);
assert.match(script,/status\.focus\(\)/);
assert.doesNotMatch(script,/provider==="web3forms"/);
assert.match(privacy,/processed by Formspree/);

const htmlFiles=fs.readdirSync(root).filter(file=>file.endsWith(".html"));
for(const file of htmlFiles){
  const html=read(file);
  assert.match(html,/<meta name="viewport"/i,`${file} needs a viewport meta tag`);
  assert.match(html,/styles\.css\?v=\d+/,`${file} needs a versioned stylesheet`);
}

const sitemap=read("sitemap.xml");
for(const match of sitemap.matchAll(/<loc>https:\/\/advantagemovingaustin\.com\/(.*?)<\/loc>/g)){
  const file=match[1]||"index.html";
  assert.ok(fs.existsSync(path.join(root,file)),`sitemap target missing: ${file}`);
}

assert.match(config,/REPLACE_WITH_FORMSPREE_FORM_ID|https:\/\/formspree\.io\/f\/[a-z0-9]+/i);
console.log(`PASS: ${htmlFiles.length} pages, quote safeguards, privacy copy, and sitemap targets`);
