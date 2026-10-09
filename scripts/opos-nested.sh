#!/usr/bin/env bash
# Run the OPOS session in a window, inside your current desktop, for development.
# A private D-Bus keeps the nested KWin and the shell away from your real session's services.
#
#   ./scripts/opos-nested.sh                 run this checkout (npm run build first)
#   ./scripts/opos-nested.sh --installed     run /opt/opos-shell
#   OPOS_SIZE=1280x720 ./scripts/opos-nested.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIZE="${OPOS_SIZE:-1600x900}"
command -v kwin_wayland >/dev/null 2>&1 || { echo "kwin_wayland not found: sudo dnf install kwin-wayland" >&2; exit 1; }
command -v dbus-run-session >/dev/null 2>&1 || { echo "dbus-run-session not found (dbus-daemon / dbus-broker)" >&2; exit 1; }

if [[ "${1:-}" == "--installed" ]]; then
  export OPOS_DIR=/opt/opos-shell
else
  export OPOS_DIR="$REPO_ROOT"
  [[ -f "$REPO_ROOT/dist/index.html" ]] || { echo "Build first: npm run build" >&2; exit 1; }
fi

export XDG_CURRENT_DESKTOP=OPOS XDG_SESSION_DESKTOP=OPOS
exec dbus-run-session -- kwin_wayland --width "${SIZE%x*}" --height "${SIZE#*x}" --xwayland \
  --exit-with-session "$REPO_ROOT/session/opos-session-inner"
