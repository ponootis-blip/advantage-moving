# Site admin

`/admin/` edits the facts and SEO settings that search engines and AI assistants
read, then rebuilds the static pages. Nothing SEO-related depends on JavaScript
on the public site.

## Sign in

Default login: **admin / admin**. On first sign-in you must choose a new
password; it takes effect for everyone once you publish.

The site is static, so the sign-in only hides the editor. Real protection is the
GitHub token used to publish (fine-grained, this repo only, *Contents: Read and
write*). Without a token nobody can change the live site.

## What it manages

| Section | Writes to |
|---|---|
| Business details | `ld-business` JSON-LD on the home page; phone, email, TXDMV and street are replaced on every page |
| Pages & SEO | the `<!-- seo:head -->` block in each page, `sitemap.xml` |
| FAQ | the home page FAQ **and** its FAQ JSON-LD (always identical) |
| Page copy & search | copy, FAQs and schema on every service, area and guide page; site-wide text search; **Add a new page** (service, service area or guide) |
| Menus (`data.menus`) | the Services and Service areas dropdowns, the link band on every page and new-page breadcrumbs |
| Reviews & profiles | review buttons, footer profile links, `sameAs` |
| AI visibility | browser-only log of AI answers (CSV export) |
| Growth playbook | review-request templates and local marketing priorities |

All settings live in `data/site.json`. The builder is `admin/builder.js`; the
page audit is `admin/audit.js`.

## Publishing

- **Live site:** add a GitHub token under *Publish*. Each publish is one commit.
- **Local preview:** run `python3 tools/admin_server.py`, open
  <http://localhost:8123/admin/>, and publishing writes files to disk.
- **Offline:** download `site.json` and commit it by hand.

New pages are created from `admin/page-template.html` and appear in the menus, the link band on every page and the sitemap. Publishing is blocked while a page still has starter text.

Hand edits to page copy are fine; just leave the `seo:head`, `seo:faq`, `content:*` and
`slot:*` markers and the `ld-business` / `ld-faq` script tags in place.
