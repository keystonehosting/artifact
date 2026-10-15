#!/bin/sh
# Installs the leak-check pre-push hook (SPEC §11). Run once per clone.
set -e
root=$(git rev-parse --show-toplevel)
hook="$root/.git/hooks/pre-push"
cat > "$hook" <<'HOOK'
#!/bin/sh
exec node "$(git rev-parse --show-toplevel)/scripts/leak-check.mjs"
HOOK
chmod +x "$hook"
echo "installed $hook"
