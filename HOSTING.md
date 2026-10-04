# Publish Advantage Moving with GitHub Pages

This folder is a static site ready for GitHub Pages. Publish the **contents of
`Files` as the repository root** so that `index.html` is at the top level.

## What is needed

1. A GitHub account and a public repository, suggested name: `advantage-moving`.
2. A company-owned Formspree form connected to the inbox that should receive
   quote requests (currently `service@advantagemovingaustin.com`). The free tier
   is suitable for activation testing; choose a paid plan before sustained
   production traffic if 50 monthly requests or 30-day retention is too low.
3. DNS access for `advantagemovingaustin.com` when the custom domain is ready
   to be pointed at GitHub Pages.

## Connect quote requests and alerts

1. Create a form at <https://formspree.io/> using the email inbox that should
   receive every new quote alert.
2. Copy the endpoint shown for the form. It looks like
   `https://formspree.io/f/xxxxxxxx`.
3. Open `site-config.js` and replace the placeholder endpoint with that value.
4. In Formspree, keep the Email plugin enabled and restrict the form to the
   production domain. While the site uses GitHub Pages, enter
   `ponootis-blip.github.io`; after the custom domain launches, change this to
   `advantagemovingaustin.com` (without `https://` or `www`).
5. Submit one test lead from the live site. Confirm that it appears in the
   Formspree Inbox and arrives by email.
6. Reply directly to the notification email. The visitor's `email` field is
   used as the Reply-To address, so the reply goes to the customer rather than
   to the form service.

The public form ID is designed for client-side forms. Do not place private API
keys, passwords, email credentials, or GitHub tokens in `site-config.js`. The
website rejects non-HTTPS or non-Formspree endpoints, times out stalled requests,
suppresses duplicate clicks, and includes Formspree's `_gotcha` honeypot.

As of October 2026, Formspree's free tier processes 50 submissions per month and
keeps 30 days of submission history. It stores over-limit requests but does not
send their notification emails until they are reprocessed, so the Inbox and Over
Limit folder must be checked daily. Confirm current limits in the Formspree
dashboard before launch.

## Activation test (required before advertising the form)

1. Replace the placeholder in `site-config.js` and publish it.
2. Run `node tools/verify-production.mjs` from this folder. It must end with
   `PASS: quote endpoint is configured`.
3. Open the public site in a private browser window and submit a test using a
   real company-controlled email address and phone number.
4. Confirm all three records match: the on-page `ADV-` reference, the Formspree
   Inbox submission, and the notification email subject.
5. Reply to the notification and confirm the reply reaches the test address.
6. Check that the lead does not appear in Spam or Over Limit.
7. Repeat once from a phone on cellular data.

## Publish

1. Create the public repository on GitHub.
2. Commit and push everything inside `Files` to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main`, folder `/ (root)`, then save.
6. GitHub will show the public `github.io` URL after the first deployment.

The `.nojekyll` file tells GitHub Pages to serve these files directly. Keep the
default `github.io` address until the custom-domain DNS records are ready.

For rollback, missed-alert, quota, and endpoint-rotation procedures, see
`RECOVERY.md`.

## Custom domain

After the `github.io` site works, add `advantagemovingaustin.com` in the Pages
custom-domain field and follow GitHub's displayed DNS instructions. Verify the
domain in GitHub before changing DNS, then enable **Enforce HTTPS** after the
certificate is issued. GitHub will create the repository's `CNAME` file when
the custom domain is saved.
