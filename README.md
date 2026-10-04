# Advantage Moving Austin website

Static, multi-page website for Advantage Moving, focused on South Austin and
nearby Central Texas service areas. It is built for GitHub Pages with no build
step.

The quote form is prepared for Formspree, but intentionally ships with a
placeholder endpoint so no customer data is sent to an account the company does
not control. Add the company-owned Formspree endpoint in `site-config.js`, then
run the activation test in `HOSTING.md`.

- `HOSTING.md` — publishing and Formspree activation
- `QUOTE-WORKFLOW.md` — how staff triage and answer leads
- `RECOVERY.md` — missed-alert, quota, endpoint, and rollback runbook
- `node tests/site.test.js` — local structural and quote-safety checks
