#!/usr/bin/env bash
# =============================================================================
# OPOS — install the real desktop session (Fedora / any systemd Linux)
#
#   ./scripts/install-session.sh                  build, then install (asks for sudo)
#   ./scripts/install-session.sh --install-deps   also dnf-install KWin, portals, services
#   ./scripts/install-session.sh --skip-build     install an existing release/linux-unpacked
#   ./scripts/install-session.sh --uninstall      remove the session and /opt/opos-shell
#
# Installs:
#   /opt/opos-shell/                               the packaged shell (electron-builder dir)
#   /usr/bin/opos-session                          session entry point (starts KWin)
#   /usr/libexec/opos/opos-session-inner           runs inside KWin, launches the shell
#   /usr/share/wayland-sessions/opos.desktop       "OPOS" in the login screen's session list
#   /usr/share/xdg-desktop-portal/opos-portals.conf
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PREFIX="${OPOS_PREFIX:-/opt/opos-shell}"
BUILD_DIR="$REPO_ROOT/release/linux-unpacked"
SESSION_BIN="/usr/bin/opos-session"
LIBEXEC_DIR="/usr/libexec/opos"
SESSION_FILE="/usr/share/wayland-sessions/opos.desktop"
PORTALS_CONF="/usr/share/xdg-desktop-portal/opos-portals.conf"
LEGACY=(/usr/share/wayland-sessions/opos-shell.desktop /usr/local/bin/opos-session)

# Runtime: compositor + Xwayland, screen locker, portals, the services OPOS talks to over D-Bus.
DNF_RUNTIME=(kwin-wayland kscreenlocker xorg-x11-server-Xwayland xdg-desktop-portal xdg-desktop-portal-kde
  xdg-desktop-portal-gtk pipewire wireplumber pipewire-pulseaudio pulseaudio-utils NetworkManager upower bluez
  polkit-kde glib2 xdg-utils qt6-qtwayland rsms-inter-fonts jetbrains-mono-fonts-all)
# Build: Node + a C++ toolchain for node-pty.
DNF_BUILD=(nodejs npm gcc-c++ make python3)

INSTALL_DEPS=0 SKIP_BUILD=0 UNINSTALL=0

if [[ -t 1 ]]; then
  C_ACC=$'\e[38;5;111m' C_OK=$'\e[32m' C_WARN=$'\e[33m' C_ERR=$'\e[31m' C_DIM=$'\e[2m' C_B=$'\e[1m' C_0=$'\e[0m'
else
  C_ACC='' C_OK='' C_WARN='' C_ERR='' C_DIM='' C_B='' C_0=''
fi
step() { printf '%s==>%s %s%s%s\n' "$C_ACC" "$C_0" "$C_B" "$*" "$C_0"; }
ok()   { printf '  %s✔%s %s\n' "$C_OK" "$C_0" "$*"; }
warn() { printf '  %s!%s %s\n' "$C_WARN" "$C_0" "$*" >&2; }
die()  { printf '%s✖ %s%s\n' "$C_ERR" "$*" "$C_0" >&2; exit 1; }
info() { printf '  %s%s%s\n' "$C_DIM" "$*" "$C_0"; }
usage() { sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0; }

for arg in "$@"; do
  case "$arg" in
    --install-deps) INSTALL_DEPS=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) usage ;;
    *) die "Unknown option: $arg (see --help)" ;;
  esac
done

as_root() { if [[ $EUID -eq 0 ]]; then "$@"; else sudo "$@"; fi; }

# ----------------------------------------------------------------------------- uninstall
if [[ $UNINSTALL -eq 1 ]]; then
  step "Removing the OPOS session"
  as_root rm -rf "$PREFIX" "$LIBEXEC_DIR"
  as_root rm -f "$SESSION_BIN" "$SESSION_FILE" "$PORTALS_CONF" "${LEGACY[@]}"
  ok "removed $PREFIX, $SESSION_BIN, $LIBEXEC_DIR, $SESSION_FILE, $PORTALS_CONF"
  info "User data is kept in ~/.config/opos and ~/.local/state/opos."
  exit 0
fi

# ----------------------------------------------------------------------------- 1. dependencies
if [[ $INSTALL_DEPS -eq 1 ]]; then
  command -v dnf >/dev/null 2>&1 || die "--install-deps uses dnf; install the equivalents of: ${DNF_RUNTIME[*]}"
  step "Installing runtime and build dependencies"
  pkgs=("${DNF_RUNTIME[@]}")
  [[ $SKIP_BUILD -eq 1 ]] || pkgs+=("${DNF_BUILD[@]}")
  as_root dnf install -y --skip-unavailable "${pkgs[@]}" || as_root dnf install -y "${pkgs[@]}"
  as_root systemctl enable --now NetworkManager.service bluetooth.service upower.service 2>/dev/null || true
  ok "dependencies installed"
fi

missing=()
for bin in kwin_wayland Xwayland; do command -v "$bin" >/dev/null 2>&1 || missing+=("$bin"); done
[[ ${#missing[@]} -eq 0 ]] || warn "Not found: ${missing[*]} — the session needs them (re-run with --install-deps)."

# ----------------------------------------------------------------------------- 2. build
if [[ $SKIP_BUILD -eq 0 ]]; then
  [[ $EUID -ne 0 ]] || die "Build as your normal user (the script asks for sudo when it installs), or pass --skip-build."
  command -v npm >/dev/null 2>&1 || die "npm not found (re-run with --install-deps, or install Node.js ≥ 20)."
  step "Building OPOS Shell"
  cd "$REPO_ROOT"
  [[ -d node_modules ]] || npm ci
  npm run build
  # electron-builder rebuilds node-pty against Electron's ABI while packaging.
  npx electron-builder --linux dir --publish never
  ok "built $BUILD_DIR"
fi
[[ -x "$BUILD_DIR/opos-shell" ]] || die "No packaged build at $BUILD_DIR (run without --skip-build)."

# ----------------------------------------------------------------------------- 3. install
step "Installing to $PREFIX"
as_root rm -rf "$PREFIX.new"
as_root cp -a "$BUILD_DIR" "$PREFIX.new"
as_root rm -rf "$PREFIX"
as_root mv "$PREFIX.new" "$PREFIX"
# Electron's setuid sandbox helper must be root-owned with mode 4755.
if [[ -f "$PREFIX/chrome-sandbox" ]]; then
  as_root chown root:root "$PREFIX/chrome-sandbox"
  as_root chmod 4755 "$PREFIX/chrome-sandbox"
fi
ok "$PREFIX"

step "Registering the session"
as_root install -D -m 0755 "$REPO_ROOT/session/opos-session" "$SESSION_BIN"
as_root install -D -m 0755 "$REPO_ROOT/session/opos-session-inner" "$LIBEXEC_DIR/opos-session-inner"
as_root install -D -m 0644 "$REPO_ROOT/session/opos.desktop" "$SESSION_FILE"
as_root install -D -m 0644 "$REPO_ROOT/session/opos-portals.conf" "$PORTALS_CONF"
as_root rm -f "${LEGACY[@]}"
if command -v restorecon >/dev/null 2>&1; then
  as_root restorecon -R "$PREFIX" "$SESSION_BIN" "$LIBEXEC_DIR" "$SESSION_FILE" "$PORTALS_CONF" || true
fi
ok "$SESSION_FILE → $SESSION_BIN → KWin → $LIBEXEC_DIR/opos-session-inner → $PREFIX/opos-shell --session"

step "Done"
info 'Log out and pick "OPOS" in the session menu of the login screen.'
info "Try it without logging out:  ./scripts/opos-nested.sh   (a windowed KWin running the session)"
info "Logs: ~/.local/state/opos/session.log"
