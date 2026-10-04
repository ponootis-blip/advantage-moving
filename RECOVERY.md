# Quote-system recovery runbook

## If notification email stops arriving

1. Open the Formspree project and inspect **Inbox**, **Spam**, and **Over Limit**.
2. If the lead exists, contact the customer from the stored phone/email and keep
   the `ADV-` reference. Then verify the Email plugin and target address.
3. If the lead is in Over Limit, reprocess it after capacity is available or
   upgrade the plan. Do not wait for the delayed notification before responding.
4. If no lead exists, submit one controlled test from the live site and capture
   the on-page error plus browser time. Do not submit real customer data while
   diagnosing.
5. Keep phone and direct email visible on the site; they are the public fallback.

## Rotate a broken or compromised form endpoint

1. Create a replacement form in the company-owned Formspree account and verify
   its target inbox.
2. Restrict it to the active production domain and keep spam protection enabled.
3. Replace only the endpoint in `site-config.js`; never add an account token.
4. Publish, run `node tools/verify-production.mjs`, and complete the activation
   test in `HOSTING.md`.
5. Disable the old form only after the replacement passes desktop and phone
   delivery tests.

## Restore the website

1. In GitHub, find the last known-good commit on `main`.
2. Prefer reverting the bad commit with a new commit so history remains intact.
3. Wait for the GitHub Pages deployment to finish, then run
   `node tools/verify-production.mjs` and visually check the home page.
4. If quote delivery is still uncertain, temporarily replace the configured
   endpoint with the placeholder. The site will fail safely and direct visitors
   to call or email instead of claiming a lead was sent.

## Monthly housekeeping

- Export leads before the provider retention window expires.
- Confirm the connected inbox is still monitored and its recovery method works.
- Review Formspree usage at 50%, 75%, and 90% warning levels.
- Submit and answer one test lead from the live site.
