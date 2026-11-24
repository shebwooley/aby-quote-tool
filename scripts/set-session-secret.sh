#!/usr/bin/env bash
# Makes a random SESSION_SECRET and stores it on the live worker. Run by Eric BEFORE the deploy that needs it (11-23-2026).
# The value is never printed or kept anywhere else. Running it again signs everybody out, which is harmless.
set -euo pipefail
ENVFILE="/c/Users/eric/.benefitlab/benefitlab.env.ps1"
TOKEN="$(sed -n 's/^\$env:CLOUDFLARE_API_TOKEN *= *"\(.*\)"[[:space:]]*$/\1/p' "$ENVFILE" | head -1)"
[ -n "$TOKEN" ] || { echo "set-session-secret: no Cloudflare token found" >&2; exit 1; }
export CLOUDFLARE_API_TOKEN="$TOKEN"
cd /c/Users/eric/dev/aby-quote-tool
node -e 'process.stdout.write(require("crypto").randomBytes(48).toString("hex"))' | npx wrangler secret put SESSION_SECRET
