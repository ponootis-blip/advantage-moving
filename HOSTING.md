# Publish Advantage Moving with GitHub Pages

This folder is a static site ready for GitHub Pages. Publish the **contents of
`Files` as the repository root** so that `index.html` is at the top level.

## What is needed

1. A GitHub account and a public repository, suggested name: `advantage-moving`.
2. A free Web3Forms access key sent to the inbox that should receive quote
   requests (currently `service@advantagemovingaustin.com`).
3. DNS access for `advantagemovingaustin.com` when the custom domain is ready
   to be pointed at GitHub Pages.

## Connect quote requests

1. Create an access key at <https://web3forms.com/> and verify the receiving
   email address.
2. Open `site-config.js` and replace `REPLACE_WITH_WEB3FORMS_ACCESS_KEY` with
   the issued key.
3. In the Web3Forms dashboard, restrict submissions to the production domain
   if that option is available for the account.

The access key is designed for static client-side forms. Do not place unrelated
private API keys, passwords, or GitHub tokens in this file.

## Publish

1. Create the public repository on GitHub.
2. Commit and push everything inside `Files` to the repository's `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose branch `main`, folder `/ (root)`, then save.
6. GitHub will show the public `github.io` URL after the first deployment.

The `.nojekyll` file tells GitHub Pages to serve these files directly. The
`CNAME` file prepares the site for `advantagemovingaustin.com`; the domain will
not switch until its DNS records are updated in the domain provider.

## Custom domain

After the `github.io` site works, add `advantagemovingaustin.com` in the Pages
custom-domain field and follow GitHub's displayed DNS instructions. Verify the
domain in GitHub before changing DNS, then enable **Enforce HTTPS** after the
certificate is issued.
