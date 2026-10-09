# Advantage Moving Austin website

Static, multi-page website for Advantage Moving, focused on South Austin and
nearby Central Texas service areas. It is built for GitHub Pages with no build
step. An optional company-operated Python chat server provides visitor chat and
a separate authenticated staff inbox.

The quote form uses the company Formspree endpoint in `site-config.js`; chat is
separate and remains disabled on GitHub Pages until an HTTPS chat server is
configured in `chat-config.js`.

- `HOSTING.md` — publishing and Formspree activation
- `CHAT-HOSTING.md` — self-hosted chat server and staff inbox setup
- `QUOTE-WORKFLOW.md` — how staff triage and answer leads
- `RECOVERY.md` — missed-alert, quota, endpoint, and rollback runbook
- `node tests/site.test.js` — local structural and quote-safety checks
