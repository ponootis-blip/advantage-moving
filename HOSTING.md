# Publish Advantage Moving with GitHub Pages

This folder is a static site ready for GitHub Pages. Publish the **contents of
`Files` as the repository root** so that `index.html` is at the top level.

## What is needed

1. A GitHub account and a public repository, suggested name: `advantage-moving`.
2. A free Formspree form connected to the inbox that should receive quote
   requests (currently `service@advantagemovingaustin.com`).
3. DNS access for `advantagemovingaustin.com` when the custom domain is ready
   to be pointed at GitHub Pages.

## Connect quote requests and alerts

1. Create a form at <https://formspree.io/> using the email inbox that should
   receive every new quote alert.
2. Copy the endpoint shown for the form. It looks like
   `https://formspree.io/f/xxxxxxxx`.
3. Open `site-config.js` and replace the placeholder endpoint with that value.
4. In Formspree, keep the Email plugin enabled and restrict the form to the
   production GitHub Pages/custom domain.
5. Submit one test lead from the live site. Confirm that it appears in the
   Formspree Inbox and arrives by email.
6. Reply directly to the notification email. The visitor's `email` field is
   used as the Reply-To address, so the reply goes to the customer rather than
   to the form service.

The public form endpoint is designed for client-side forms. Do not place private
API keys, passwords, email credentials, or GitHub tokens in `site-config.js`.
The free Formspree plan currently allows 50 processed submissions per month and
keeps 30 days of submission history, so monitor usage and export important leads.

## Publish

1. Create the public repository on GitHub.
2. Commit and push everything inside `Files` to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main`, folder `/ (root)`, then save.
6. GitHub will show the public `github.io` URL after the first deployment.

The `.nojekyll` file tells GitHub Pages to serve these files directly. Keep the
default `github.io` address until the custom-domain DNS records are ready.

## Custom domain

After the `github.io` site works, add `advantagemovingaustin.com` in the Pages
custom-domain field and follow GitHub's displayed DNS instructions. Verify the
domain in GitHub before changing DNS, then enable **Enforce HTTPS** after the
certificate is issued. GitHub will create the repository's `CNAME` file when
the custom domain is saved.
