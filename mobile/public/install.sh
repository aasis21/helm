#!/usr/bin/env bash
# One-line bootstrap installer for Helm (macOS / Linux).
#
#   curl -fsSL https://usehelm.netlify.app/install.sh | bash
#
# Downloads the prebuilt Helm Copilot CLI extension and drops it where
# `gh copilot` auto-discovers it (~/.copilot/extensions/helm), wired to the
# hosted relay so there is zero config. No git clone, no Node build.
#
# Run-your-own-relay overrides (env vars):
#   SUPABASE_URL=https://xxx.supabase.co SUPABASE_KEY=sb_publishable_xxx \
#     bash -c "$(curl -fsSL https://usehelm.netlify.app/install.sh)"
#
# Force overwrite of an existing .env: HELM_FORCE=1
set -euo pipefail

BASE="https://usehelm.netlify.app"
INSTALL_DIR="${HELM_INSTALL_DIR:-$HOME/.copilot/extensions/helm}"
SUPABASE_URL="${SUPABASE_URL:-https://jqzohxjouzxzawqqlifv.supabase.co}"
SUPABASE_KEY="${SUPABASE_KEY:-sb_publishable_Rf_bymYhJk9fF2Op4xKT0w_eaWLiyCY}"

cyan() { printf '\033[36m%s\033[0m\n' "$1"; }
green() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }

cyan ""
cyan "=== Installing Helm extension ==="
mkdir -p "$INSTALL_DIR"
curl -fsSL "$BASE/extension.mjs" -o "$INSTALL_DIR/extension.mjs"
green "extension.mjs -> $INSTALL_DIR"

ENV_PATH="$INSTALL_DIR/.env"
if [ -f "$ENV_PATH" ] && [ "${HELM_FORCE:-0}" != "1" ]; then
  green "kept your existing .env (set HELM_FORCE=1 to overwrite)"
else
  cat > "$ENV_PATH" <<EOF
# Helm relay config. The publishable key is client-safe by design; the channel is
# guarded by Supabase RLS + end-to-end AES-256-GCM. To run your own relay, swap these
# for your own Supabase project's URL + publishable key.
HELM_TRANSPORT=supabase
SUPABASE_URL=$SUPABASE_URL
SUPABASE_ANON_KEY=$SUPABASE_KEY
HELM_APPROVAL_TIMEOUT_MS=120000
EOF
  green "wrote relay config -> $ENV_PATH"
fi

cyan ""
cyan "=== Done ==="
echo "  1. Start Copilot CLI in any repo (run /helm-pair to re-show the QR)."
echo "  2. Open https://usehelm.netlify.app on your phone and scan the QR."
echo "  3. Trigger a Copilot action and approve / deny from your phone."
echo ""
printf '\033[90mUninstall: rm -rf "%s"\033[0m\n' "$INSTALL_DIR"
