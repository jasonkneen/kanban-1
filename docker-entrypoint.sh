#!/bin/sh
set -e

# ── Git identity ─────────────────────────────────────────────────────────────
# Write a .gitconfig so `git commit` works inside the container.
# Kanban's initialize-repo.ts calls git commit without setting GIT_AUTHOR_*,
# so it depends on the global config. Turn checkpoints hardcode their own
# identity and are unaffected by this.
GIT_USER_NAME="${GIT_AUTHOR_NAME:-Cline Kanban}"
GIT_USER_EMAIL="${GIT_AUTHOR_EMAIL:-kanban@local}"

mkdir -p "${HOME}"
cat > "${HOME}/.gitconfig" << GITEOF
[user]
    name = ${GIT_USER_NAME}
    email = ${GIT_USER_EMAIL}
[safe]
    directory = *
[init]
    defaultBranch = main
GITEOF

# ── First-boot init ───────────────────────────────────────────────────────────
# Runs docker-init.js only when remote.db does not exist yet.
# Subsequent container starts skip this entirely.
DATA_DIR="${HOME}/.cline/kanban"
if [ ! -f "${DATA_DIR}/remote.db" ]; then
    node dist/docker-init.js
fi

# ── HTTPS configuration ───────────────────────────────────────────────────────
# If KANBAN_TLS_CERT + KANBAN_TLS_KEY are set, the Node process reads them
# directly (handled in cli.ts resolveRuntimeTls).
#
# If neither is set but KANBAN_HTTPS=1, pass --https to generate a self-signed
# cert. Browsers will show a one-time warning which can be bypassed via
# Advanced → Proceed. Required for push notifications and PWA install over LAN.
#
# If nothing is set, start plain HTTP.
if [ -n "${KANBAN_TLS_CERT}" ] && [ -n "${KANBAN_TLS_KEY}" ]; then
    # Cert paths are set — cli.ts will read them from env, no flag needed.
    set -- "$@"
elif [ "${KANBAN_HTTPS}" = "1" ]; then
    # Self-signed mode.
    set -- "$@" "--https"
fi

# ── Hand off to the main process ─────────────────────────────────────────────
exec "$@"
