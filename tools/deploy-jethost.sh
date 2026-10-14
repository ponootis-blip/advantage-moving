#!/bin/sh
# Pull the GitHub repo on the JetHost server and copy the public site into public_html.
# Run by cron every 5 minutes; does nothing unless GitHub has a new commit.
#   */5 * * * * /bin/sh $HOME/repositories/advantage-moving/tools/deploy-jethost.sh >> $HOME/deploy.log 2>&1
# Files are added or replaced, never deleted from public_html (keeps cgi-bin, .well-known, etc.).
set -eu
REPO="$HOME/repositories/advantage-moving"
WEB="$HOME/public_html"
STAMP="$HOME/.deployed-commit"

cd "$REPO"
git fetch -q origin main
git reset -q --hard origin/main
HEAD=$(git rev-parse HEAD)
[ -f "$STAMP" ] && [ "$(cat "$STAMP")" = "$HEAD" ] && [ "${1:-}" != "--force" ] && exit 0

# Everything except development and internal files.
git ls-files | grep -Ev '^(tools/|tests/|chat_server/|chat_worker/|\.github/)|\.md$|^\.gitignore$|^\.nojekyll$' > "$HOME/.deploy-files"
tar -cf - -T "$HOME/.deploy-files" | tar -xf - -C "$WEB"

echo "$HEAD" > "$STAMP"
echo "$(date -u +%FT%TZ) deployed $HEAD ($(wc -l < "$HOME/.deploy-files") files)"
